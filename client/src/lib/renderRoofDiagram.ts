/**
 * Roof Diagram Renderer — Refined Edition
 * Renders detailed isometric-style roof diagrams for branded PDF proposals.
 * Supports: Skillion, Gable, Split Gable, Hip roof types.
 * Features: beam/fascia detail, ridge caps, gutter lines, ground shadows,
 * improved posts with visible depth, panel rib lines, proper dimension arrows.
 */

export type RoofType = "skillion" | "gable" | "split_gable" | "hip" | "flyover";

export interface SkylightInfo {
  type: string;       // e.g. "Spanlite", "Slenlite", "Climatek V Skylight", "Ezi-struct"
  lm: number;         // linear metres (length of each skylight strip along sheet run)
  qty: number;        // number of skylight strips
  finish?: string;    // "Clear", "Opal", "Diffused"
}

export interface RoofDiagramOptions {
  roofType: RoofType;
  width: number;       // mm (structure width)
  length: number;      // mm (structure depth/projection)
  height: number;      // mm (wall height / eave height)
  roofColour?: string; // Colourbond name or hex
  wallColour?: string; // Colourbond name or hex (beams/fascia)
  postColour?: string; // Colourbond name or hex
  label?: string;      // e.g. "Roof Plan"
  showDimensions?: boolean;
  /** Roof sheet product name (e.g. "Double U", "Climatek V 60mm", "Ambitek") */
  roofSheetType?: string;
  /** Skylight information for rendering on the roof plan */
  skylight?: SkylightInfo;
}

// Colourbond colour map
const COLOURBOND_HEX: Record<string, string> = {
  "Monument": "#3C3C3C",
  "Surfmist": "#E8E4DB",
  "Basalt": "#5A5A5A",
  "Woodland Grey": "#4D5248",
  "Shale Grey": "#B0ADA6",
  "Dune": "#B5A898",
  "Jasper": "#5E4B3B",
  "Ironstone": "#3E3A36",
  "Windspray": "#7A8078",
  "Pale Eucalypt": "#6B7D6B",
  "Cottage Green": "#2D4A3E",
  "Manor Red": "#6B2D2D",
  "Night Sky": "#1A1A2E",
  "Classic Cream": "#E8DCC8",
  "Paperbark": "#C8BFA8",
  "Cove": "#6B7B8A",
  "Terrain": "#7A6B5A",
  "Gully": "#5A6B5A",
  "Mangrove": "#4A5A4A",
  "Wallaby": "#7A7A6A",
  "Bushland": "#8A8A6A",
  "Evening Haze": "#9A8A7A",
};

export function resolveColour(name?: string, fallback = "#5A5A5A"): string {
  if (!name) return fallback;
  if (name.startsWith("#")) return name;
  return COLOURBOND_HEX[name] || fallback;
}

function darken(hex: string, amount = 30): string {
  const r = Math.max(0, parseInt(hex.slice(1, 3), 16) - amount);
  const g = Math.max(0, parseInt(hex.slice(3, 5), 16) - amount);
  const b = Math.max(0, parseInt(hex.slice(5, 7), 16) - amount);
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

function lighten(hex: string, amount = 40): string {
  const r = Math.min(255, parseInt(hex.slice(1, 3), 16) + amount);
  const g = Math.min(255, parseInt(hex.slice(3, 5), 16) + amount);
  const b = Math.min(255, parseInt(hex.slice(5, 7), 16) + amount);
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

// Isometric projection helpers (30° angle)
const COS30 = Math.cos(Math.PI / 6);
const SIN30 = Math.sin(Math.PI / 6);

function isoX(x: number, y: number): number {
  return x * COS30 - y * COS30;
}

function isoY(x: number, y: number, z: number): number {
  return x * SIN30 + y * SIN30 - z;
}

export function renderRoofDiagram(options: RoofDiagramOptions): string {
  const {
    roofType,
    width,
    length,
    height,
    roofColour,
    wallColour,
    postColour,
    label,
    showDimensions = true,
    roofSheetType,
    skylight,
  } = options;

  const canvas = document.createElement("canvas");
  canvas.width = 1200;
  canvas.height = 800;
  const ctx = canvas.getContext("2d")!;

  // White background
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Resolve colours
  const roofHex = resolveColour(roofColour, "#5A5A5A");
  const beamHex = resolveColour(wallColour, "#E8E4DB");
  const postHex = resolveColour(postColour, "#3C3C3C");

  // Scale real dimensions to fit canvas
  const margin = 150;
  const drawW = canvas.width - margin * 2;
  const drawH = canvas.height - margin * 2;
  const maxDim = Math.max(width, length, height * 1.5);
  const scale = Math.min(drawW, drawH) / (maxDim * 1.2) * 0.55;

  // Center offset
  const cx = canvas.width / 2;
  const cy = canvas.height / 2 + 80;

  // Transform a 3D point to 2D canvas coordinates
  function toCanvas(x: number, y: number, z: number): [number, number] {
    return [cx + isoX(x * scale, y * scale), cy + isoY(x * scale, y * scale, z * scale)];
  }

  // Draw ground shadow first (behind everything)
  drawGroundShadow(ctx, toCanvas, width, length, roofType, height);

  // Draw based on roof type
  switch (roofType) {
    case "skillion":
      drawSkillion(ctx, toCanvas, width, length, height, roofHex, beamHex, postHex);
      break;
    case "gable":
      drawGable(ctx, toCanvas, width, length, height, roofHex, beamHex, postHex);
      break;
    case "split_gable":
      drawSplitGable(ctx, toCanvas, width, length, height, roofHex, beamHex, postHex);
      break;
    case "hip":
      drawHip(ctx, toCanvas, width, length, height, roofHex, beamHex, postHex);
      break;
    case "flyover":
      drawFlyover(ctx, toCanvas, width, length, height, roofHex, beamHex, postHex);
      break;
  }

  // Draw skylights on roof surface
  if (skylight && skylight.qty > 0 && skylight.lm > 0) {
    drawSkylightsOnRoof(ctx, toCanvas, width, length, height, roofType, skylight, roofSheetType);
  }

  // Draw dimensions
  if (showDimensions) {
    drawDimensionLabels(ctx, toCanvas, width, length, height);
  }

  // Draw label
  if (label) {
    ctx.font = "bold 20px Inter, system-ui, sans-serif";
    ctx.fillStyle = "#1E2328";
    ctx.textAlign = "center";
    ctx.fillText(label, canvas.width / 2, 35);
  }

  // Draw roof type badge
  const typeLabel = roofType === "split_gable" ? "Split Gable" : roofType === "flyover" ? "Flyover (Attached)" : roofType.charAt(0).toUpperCase() + roofType.slice(1);
  ctx.font = "15px Inter, system-ui, sans-serif";
  ctx.fillStyle = "#555555";
  ctx.textAlign = "center";
  ctx.fillText(`Roof Type: ${typeLabel}`, canvas.width / 2, 58);

  // Colour legend
  drawColourLegend(ctx, roofColour || "Monument", wallColour || "Surfmist", postColour || "Monument", roofHex, beamHex, postHex);

  return canvas.toDataURL("image/png");
}

// ─── Ground Shadow ────────────────────────────────────────────────────────────
function drawGroundShadow(
  ctx: CanvasRenderingContext2D,
  toCanvas: (x: number, y: number, z: number) => [number, number],
  w: number, l: number, roofType: RoofType, h: number
) {
  // Shadow offset (simulating sun from top-left)
  const shadowOffset = 80;
  const pts = [
    toCanvas(-shadowOffset, -shadowOffset, -20),
    toCanvas(w + shadowOffset * 0.3, -shadowOffset, -20),
    toCanvas(w + shadowOffset * 0.3, l + shadowOffset * 0.3, -20),
    toCanvas(-shadowOffset, l + shadowOffset * 0.3, -20),
  ];

  ctx.beginPath();
  ctx.moveTo(...pts[0]);
  pts.slice(1).forEach(p => ctx.lineTo(...p));
  ctx.closePath();
  ctx.fillStyle = "rgba(0, 0, 0, 0.04)";
  ctx.fill();

  // Ground plane outline
  const ground = [
    toCanvas(-50, -50, 0),
    toCanvas(w + 50, -50, 0),
    toCanvas(w + 50, l + 50, 0),
    toCanvas(-50, l + 50, 0),
  ];
  ctx.beginPath();
  ctx.moveTo(...ground[0]);
  ground.slice(1).forEach(p => ctx.lineTo(...p));
  ctx.closePath();
  ctx.setLineDash([4, 6]);
  ctx.strokeStyle = "#CCCCCC";
  ctx.lineWidth = 0.8;
  ctx.stroke();
  ctx.setLineDash([]);
}

// ─── Skillion Roof ────────────────────────────────────────────────────────────
function drawSkillion(
  ctx: CanvasRenderingContext2D,
  toCanvas: (x: number, y: number, z: number) => [number, number],
  w: number, l: number, h: number,
  roofHex: string, beamHex: string, postHex: string
) {
  const ridgeHeight = h + l * 0.15; // 15% pitch rise over length
  const overhang = 80; // mm overhang on all sides
  const beamDepth = 60; // mm beam visual depth
  const fasciaDepth = 40;

  // Posts (4 corners) — draw back posts first
  drawDetailedPost(ctx, toCanvas, 0, l, 0, ridgeHeight, postHex);
  drawDetailedPost(ctx, toCanvas, w, l, 0, ridgeHeight, postHex);
  drawDetailedPost(ctx, toCanvas, 0, 0, 0, h, postHex);
  drawDetailedPost(ctx, toCanvas, w, 0, 0, h, postHex);

  // Beams along top of posts (visible under roof)
  drawBeam(ctx, toCanvas, 0, 0, h, w, 0, h, beamHex, beamDepth);
  drawBeam(ctx, toCanvas, 0, l, ridgeHeight, w, l, ridgeHeight, beamHex, beamDepth);
  drawBeam(ctx, toCanvas, w, 0, h, w, l, ridgeHeight, beamHex, beamDepth);
  drawBeam(ctx, toCanvas, 0, 0, h, 0, l, ridgeHeight, beamHex, beamDepth);

  // Rafters (visible under roof)
  const rafterCount = Math.max(3, Math.round(w / 600));
  for (let i = 0; i <= rafterCount; i++) {
    const frac = i / rafterCount;
    const x = w * frac;
    drawRafter(ctx, toCanvas, x, 0, h, x, l, ridgeHeight, beamHex);
  }

  // Roof face (single slope) with overhang
  const roofPts = [
    toCanvas(-overhang, -overhang, h - 10),
    toCanvas(w + overhang, -overhang, h - 10),
    toCanvas(w + overhang, l + overhang, ridgeHeight + 10),
    toCanvas(-overhang, l + overhang, ridgeHeight + 10),
  ];
  ctx.beginPath();
  ctx.moveTo(...roofPts[0]);
  roofPts.slice(1).forEach(p => ctx.lineTo(...p));
  ctx.closePath();
  ctx.fillStyle = roofHex;
  ctx.fill();
  ctx.strokeStyle = darken(roofHex, 20);
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Roof panel ribs
  const ribCount = Math.max(6, Math.round(w / 300));
  for (let i = 1; i < ribCount; i++) {
    const frac = i / ribCount;
    const x = -overhang + (w + overhang * 2) * frac;
    const p1 = toCanvas(x, -overhang, h - 10);
    const p2 = toCanvas(x, l + overhang, ridgeHeight + 10);
    ctx.beginPath();
    ctx.moveTo(...p1);
    ctx.lineTo(...p2);
    ctx.strokeStyle = hexToRgba(darken(roofHex, 15), 0.5);
    ctx.lineWidth = 0.7;
    ctx.stroke();
  }

  // Fascia (front edge — low side)
  drawFascia(ctx, toCanvas, -overhang, -overhang, h - 10, w + overhang * 2, 0, fasciaDepth, beamHex);

  // Gutter line (front)
  drawGutterLine(ctx, toCanvas, -overhang, -overhang, h - fasciaDepth - 10, w + overhang * 2, 0);
}

// ─── Gable Roof ───────────────────────────────────────────────────────────────
function drawGable(
  ctx: CanvasRenderingContext2D,
  toCanvas: (x: number, y: number, z: number) => [number, number],
  w: number, l: number, h: number,
  roofHex: string, beamHex: string, postHex: string
) {
  const ridgeHeight = h + w * 0.2; // 20% pitch from centre
  const midW = w / 2;
  const overhang = 80;
  const beamDepth = 60;
  const fasciaDepth = 40;

  // Posts — back first, then front
  drawDetailedPost(ctx, toCanvas, 0, l, 0, h, postHex);
  drawDetailedPost(ctx, toCanvas, w, l, 0, h, postHex);
  drawDetailedPost(ctx, toCanvas, 0, 0, 0, h, postHex);
  drawDetailedPost(ctx, toCanvas, w, 0, 0, h, postHex);

  // Beams
  drawBeam(ctx, toCanvas, 0, 0, h, w, 0, h, beamHex, beamDepth);
  drawBeam(ctx, toCanvas, 0, l, h, w, l, h, beamHex, beamDepth);
  drawBeam(ctx, toCanvas, w, 0, h, w, l, h, beamHex, beamDepth);
  drawBeam(ctx, toCanvas, 0, 0, h, 0, l, h, beamHex, beamDepth);

  // Rafters
  const rafterCount = Math.max(4, Math.round(l / 500));
  for (let i = 0; i <= rafterCount; i++) {
    const frac = i / rafterCount;
    const y = l * frac;
    // Left rafter
    drawRafter(ctx, toCanvas, 0, y, h, midW, y, ridgeHeight, beamHex);
    // Right rafter
    drawRafter(ctx, toCanvas, w, y, h, midW, y, ridgeHeight, beamHex);
  }

  // Gable end wall (back — triangular fill)
  const gableBack = [toCanvas(0, l, h), toCanvas(w, l, h), toCanvas(midW, l, ridgeHeight)];
  ctx.beginPath();
  ctx.moveTo(...gableBack[0]);
  gableBack.slice(1).forEach(p => ctx.lineTo(...p));
  ctx.closePath();
  ctx.fillStyle = lighten(beamHex, 20);
  ctx.fill();
  ctx.strokeStyle = darken(beamHex, 20);
  ctx.lineWidth = 1;
  ctx.stroke();

  // Barge board (back gable)
  ctx.beginPath();
  ctx.moveTo(...toCanvas(0, l + 10, h));
  ctx.lineTo(...toCanvas(midW, l + 10, ridgeHeight));
  ctx.lineTo(...toCanvas(w, l + 10, h));
  ctx.strokeStyle = darken(beamHex, 30);
  ctx.lineWidth = 3;
  ctx.stroke();

  // Right roof face (with overhang)
  const roofR = [
    toCanvas(midW, -overhang, ridgeHeight + 5),
    toCanvas(w + overhang, -overhang, h - 15),
    toCanvas(w + overhang, l + overhang, h - 15),
    toCanvas(midW, l + overhang, ridgeHeight + 5),
  ];
  ctx.beginPath();
  ctx.moveTo(...roofR[0]);
  roofR.slice(1).forEach(p => ctx.lineTo(...p));
  ctx.closePath();
  ctx.fillStyle = roofHex;
  ctx.fill();
  ctx.strokeStyle = darken(roofHex, 20);
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Right roof panel ribs
  const ribCount = Math.max(4, Math.round(midW / 350));
  for (let i = 1; i < ribCount; i++) {
    const frac = i / ribCount;
    const x = midW + (w + overhang - midW) * frac;
    const z = ridgeHeight + 5 - (ridgeHeight + 5 - (h - 15)) * frac;
    const p1 = toCanvas(x, -overhang, z);
    const p2 = toCanvas(x, l + overhang, z);
    ctx.beginPath();
    ctx.moveTo(...p1);
    ctx.lineTo(...p2);
    ctx.strokeStyle = hexToRgba(darken(roofHex, 15), 0.5);
    ctx.lineWidth = 0.7;
    ctx.stroke();
  }

  // Left roof face (slightly lighter)
  const roofL = [
    toCanvas(midW, -overhang, ridgeHeight + 5),
    toCanvas(-overhang, -overhang, h - 15),
    toCanvas(-overhang, l + overhang, h - 15),
    toCanvas(midW, l + overhang, ridgeHeight + 5),
  ];
  ctx.beginPath();
  ctx.moveTo(...roofL[0]);
  roofL.slice(1).forEach(p => ctx.lineTo(...p));
  ctx.closePath();
  ctx.fillStyle = lighten(roofHex, 12);
  ctx.fill();
  ctx.strokeStyle = darken(roofHex, 20);
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Left roof panel ribs
  for (let i = 1; i < ribCount; i++) {
    const frac = i / ribCount;
    const x = midW - (midW + overhang) * frac;
    const z = ridgeHeight + 5 - (ridgeHeight + 5 - (h - 15)) * frac;
    const p1 = toCanvas(x, -overhang, z);
    const p2 = toCanvas(x, l + overhang, z);
    ctx.beginPath();
    ctx.moveTo(...p1);
    ctx.lineTo(...p2);
    ctx.strokeStyle = hexToRgba(darken(roofHex, 10), 0.4);
    ctx.lineWidth = 0.7;
    ctx.stroke();
  }

  // Ridge cap
  drawRidgeCap(ctx, toCanvas, midW, -overhang, ridgeHeight + 5, midW, l + overhang, ridgeHeight + 5, roofHex);

  // Fascia (right side — visible face)
  drawFascia(ctx, toCanvas, w + overhang, -overhang, h - 15, 0, l + overhang * 2, fasciaDepth, beamHex);

  // Gutter lines
  drawGutterLine(ctx, toCanvas, w + overhang, -overhang, h - fasciaDepth - 15, 0, l + overhang * 2);
  drawGutterLine(ctx, toCanvas, -overhang, -overhang, h - fasciaDepth - 15, 0, l + overhang * 2);
}

// ─── Split Gable Roof ─────────────────────────────────────────────────────────
function drawSplitGable(
  ctx: CanvasRenderingContext2D,
  toCanvas: (x: number, y: number, z: number) => [number, number],
  w: number, l: number, h: number,
  roofHex: string, beamHex: string, postHex: string
) {
  const ridgeHeight = h + w * 0.18;
  const midW = w / 2;
  const splitGap = l * 0.06;
  const halfL = (l - splitGap) / 2;
  const overhang = 70;

  // Posts (8 posts — 4 corners + 4 at split)
  drawDetailedPost(ctx, toCanvas, 0, l, 0, h, postHex);
  drawDetailedPost(ctx, toCanvas, w, l, 0, h, postHex);
  drawDetailedPost(ctx, toCanvas, 0, halfL + splitGap, 0, h, postHex);
  drawDetailedPost(ctx, toCanvas, w, halfL + splitGap, 0, h, postHex);
  drawDetailedPost(ctx, toCanvas, 0, halfL, 0, h, postHex);
  drawDetailedPost(ctx, toCanvas, w, halfL, 0, h, postHex);
  drawDetailedPost(ctx, toCanvas, 0, 0, 0, h, postHex);
  drawDetailedPost(ctx, toCanvas, w, 0, 0, h, postHex);

  // Beams
  drawBeam(ctx, toCanvas, 0, 0, h, w, 0, h, beamHex, 50);
  drawBeam(ctx, toCanvas, 0, l, h, w, l, h, beamHex, 50);
  drawBeam(ctx, toCanvas, w, 0, h, w, l, h, beamHex, 50);
  drawBeam(ctx, toCanvas, 0, 0, h, 0, l, h, beamHex, 50);

  // Gable end wall (back)
  const gableBack = [toCanvas(0, l, h), toCanvas(w, l, h), toCanvas(midW, l, ridgeHeight)];
  ctx.beginPath();
  ctx.moveTo(...gableBack[0]);
  gableBack.slice(1).forEach(p => ctx.lineTo(...p));
  ctx.closePath();
  ctx.fillStyle = lighten(beamHex, 20);
  ctx.fill();
  ctx.strokeStyle = darken(beamHex, 20);
  ctx.lineWidth = 1;
  ctx.stroke();

  // Front gable section
  drawGableRoofSection(ctx, toCanvas, 0, halfL, w, midW, h, ridgeHeight, overhang, roofHex);

  // Rear gable section
  drawGableRoofSection(ctx, toCanvas, halfL + splitGap, l, w, midW, h, ridgeHeight, overhang, roofHex);

  // Ridge caps for both sections
  drawRidgeCap(ctx, toCanvas, midW, -overhang, ridgeHeight + 5, midW, halfL, ridgeHeight + 5, roofHex);
  drawRidgeCap(ctx, toCanvas, midW, halfL + splitGap, ridgeHeight + 5, midW, l + overhang, ridgeHeight + 5, roofHex);

  // Valley gutter between sections
  const valleyL1 = toCanvas(-overhang, halfL, h - 15);
  const valleyR1 = toCanvas(w + overhang, halfL, h - 15);
  ctx.beginPath();
  ctx.moveTo(...valleyL1);
  ctx.lineTo(...valleyR1);
  ctx.strokeStyle = darken(beamHex, 40);
  ctx.lineWidth = 3;
  ctx.setLineDash([8, 4]);
  ctx.stroke();
  ctx.setLineDash([]);

  const valleyL2 = toCanvas(-overhang, halfL + splitGap, h - 15);
  const valleyR2 = toCanvas(w + overhang, halfL + splitGap, h - 15);
  ctx.beginPath();
  ctx.moveTo(...valleyL2);
  ctx.lineTo(...valleyR2);
  ctx.strokeStyle = darken(beamHex, 40);
  ctx.lineWidth = 3;
  ctx.setLineDash([8, 4]);
  ctx.stroke();
  ctx.setLineDash([]);

  // "VALLEY" label
  const valleyMid = toCanvas(midW, halfL + splitGap / 2, h + 30);
  ctx.font = "italic 11px Inter, system-ui, sans-serif";
  ctx.fillStyle = "#666666";
  ctx.textAlign = "center";
  ctx.fillText("Valley", valleyMid[0], valleyMid[1]);
}

// ─── Hip Roof ─────────────────────────────────────────────────────────────────
function drawHip(
  ctx: CanvasRenderingContext2D,
  toCanvas: (x: number, y: number, z: number) => [number, number],
  w: number, l: number, h: number,
  roofHex: string, beamHex: string, postHex: string
) {
  const ridgeHeight = h + w * 0.2;
  const midW = w / 2;
  const hipInset = w * 0.4; // how far the ridge is inset from each end
  const overhang = 80;

  // Posts
  drawDetailedPost(ctx, toCanvas, 0, l, 0, h, postHex);
  drawDetailedPost(ctx, toCanvas, w, l, 0, h, postHex);
  drawDetailedPost(ctx, toCanvas, 0, 0, 0, h, postHex);
  drawDetailedPost(ctx, toCanvas, w, 0, 0, h, postHex);

  // Beams
  drawBeam(ctx, toCanvas, 0, 0, h, w, 0, h, beamHex, 60);
  drawBeam(ctx, toCanvas, 0, l, h, w, l, h, beamHex, 60);
  drawBeam(ctx, toCanvas, w, 0, h, w, l, h, beamHex, 60);
  drawBeam(ctx, toCanvas, 0, 0, h, 0, l, h, beamHex, 60);

  // Ridge endpoints
  const ridgeY0 = hipInset;
  const ridgeY1 = l - hipInset;

  // Back hip face (triangle)
  const hipBack = [
    toCanvas(-overhang, l + overhang, h - 15),
    toCanvas(w + overhang, l + overhang, h - 15),
    toCanvas(midW, ridgeY1, ridgeHeight + 5),
  ];
  ctx.beginPath();
  ctx.moveTo(...hipBack[0]);
  hipBack.slice(1).forEach(p => ctx.lineTo(...p));
  ctx.closePath();
  ctx.fillStyle = lighten(roofHex, 8);
  ctx.fill();
  ctx.strokeStyle = darken(roofHex, 20);
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Right roof face (trapezoid)
  const roofR = [
    toCanvas(w + overhang, -overhang, h - 15),
    toCanvas(w + overhang, l + overhang, h - 15),
    toCanvas(midW, ridgeY1, ridgeHeight + 5),
    toCanvas(midW, ridgeY0, ridgeHeight + 5),
  ];
  ctx.beginPath();
  ctx.moveTo(...roofR[0]);
  roofR.slice(1).forEach(p => ctx.lineTo(...p));
  ctx.closePath();
  ctx.fillStyle = roofHex;
  ctx.fill();
  ctx.strokeStyle = darken(roofHex, 20);
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Right roof panel ribs
  const ribCount = Math.max(4, Math.round((l + overhang * 2) / 400));
  for (let i = 1; i < ribCount; i++) {
    const frac = i / ribCount;
    const y = -overhang + (l + overhang * 2) * frac;
    // Interpolate x from eave to ridge
    let ridgeX = midW;
    let ridgeZ = ridgeHeight + 5;
    if (y < ridgeY0) {
      const t = y / ridgeY0;
      ridgeX = w + overhang - (w + overhang - midW) * (y + overhang) / (ridgeY0 + overhang);
    } else if (y > ridgeY1) {
      ridgeX = w + overhang - (w + overhang - midW) * (l + overhang - y) / (l + overhang - ridgeY1);
    }
    const p1 = toCanvas(w + overhang, y, h - 15);
    const p2 = toCanvas(midW, Math.max(ridgeY0, Math.min(ridgeY1, y)), ridgeHeight + 5);
    ctx.beginPath();
    ctx.moveTo(...p1);
    ctx.lineTo(...p2);
    ctx.strokeStyle = hexToRgba(darken(roofHex, 15), 0.4);
    ctx.lineWidth = 0.6;
    ctx.stroke();
  }

  // Left roof face (trapezoid — lighter)
  const roofL = [
    toCanvas(-overhang, -overhang, h - 15),
    toCanvas(-overhang, l + overhang, h - 15),
    toCanvas(midW, ridgeY1, ridgeHeight + 5),
    toCanvas(midW, ridgeY0, ridgeHeight + 5),
  ];
  ctx.beginPath();
  ctx.moveTo(...roofL[0]);
  roofL.slice(1).forEach(p => ctx.lineTo(...p));
  ctx.closePath();
  ctx.fillStyle = lighten(roofHex, 12);
  ctx.fill();
  ctx.strokeStyle = darken(roofHex, 20);
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Front hip face (triangle)
  const hipFront = [
    toCanvas(-overhang, -overhang, h - 15),
    toCanvas(w + overhang, -overhang, h - 15),
    toCanvas(midW, ridgeY0, ridgeHeight + 5),
  ];
  ctx.beginPath();
  ctx.moveTo(...hipFront[0]);
  hipFront.slice(1).forEach(p => ctx.lineTo(...p));
  ctx.closePath();
  ctx.fillStyle = darken(roofHex, 8);
  ctx.fill();
  ctx.strokeStyle = darken(roofHex, 20);
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Ridge cap
  drawRidgeCap(ctx, toCanvas, midW, ridgeY0, ridgeHeight + 5, midW, ridgeY1, ridgeHeight + 5, roofHex);

  // Hip lines (ridges from corners to ridge endpoints)
  const hipLines: [[number, number], [number, number]][] = [
    [toCanvas(-overhang, -overhang, h - 15), toCanvas(midW, ridgeY0, ridgeHeight + 5)],
    [toCanvas(w + overhang, -overhang, h - 15), toCanvas(midW, ridgeY0, ridgeHeight + 5)],
    [toCanvas(-overhang, l + overhang, h - 15), toCanvas(midW, ridgeY1, ridgeHeight + 5)],
    [toCanvas(w + overhang, l + overhang, h - 15), toCanvas(midW, ridgeY1, ridgeHeight + 5)],
  ];
  hipLines.forEach(([start, end]) => {
    ctx.beginPath();
    ctx.moveTo(...start);
    ctx.lineTo(...end);
    ctx.strokeStyle = darken(roofHex, 35);
    ctx.lineWidth = 2;
    ctx.stroke();
  });
}

// ─── Helper: Gable Roof Section (for split gable) ────────────────────────────
function drawGableRoofSection(
  ctx: CanvasRenderingContext2D,
  toCanvas: (x: number, y: number, z: number) => [number, number],
  y0: number, y1: number, w: number, midW: number,
  h: number, ridgeHeight: number, overhang: number,
  roofHex: string
) {
  // Right roof face
  const roofR = [
    toCanvas(midW, y0 - (y0 === 0 ? overhang : 0), ridgeHeight + 5),
    toCanvas(w + overhang, y0 - (y0 === 0 ? overhang : 0), h - 15),
    toCanvas(w + overhang, y1 + (y1 > w ? overhang : 0), h - 15),
    toCanvas(midW, y1 + (y1 > w ? overhang : 0), ridgeHeight + 5),
  ];
  ctx.beginPath();
  ctx.moveTo(...roofR[0]);
  roofR.slice(1).forEach(p => ctx.lineTo(...p));
  ctx.closePath();
  ctx.fillStyle = roofHex;
  ctx.fill();
  ctx.strokeStyle = darken(roofHex, 20);
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Panel ribs (right)
  const ribCount = Math.max(3, Math.round(midW / 400));
  for (let i = 1; i < ribCount; i++) {
    const frac = i / ribCount;
    const x = midW + (w + overhang - midW) * frac;
    const z = ridgeHeight + 5 - (ridgeHeight + 5 - (h - 15)) * frac;
    const p1 = toCanvas(x, y0, z);
    const p2 = toCanvas(x, y1, z);
    ctx.beginPath();
    ctx.moveTo(...p1);
    ctx.lineTo(...p2);
    ctx.strokeStyle = hexToRgba(darken(roofHex, 15), 0.4);
    ctx.lineWidth = 0.6;
    ctx.stroke();
  }

  // Left roof face
  const roofL = [
    toCanvas(midW, y0 - (y0 === 0 ? overhang : 0), ridgeHeight + 5),
    toCanvas(-overhang, y0 - (y0 === 0 ? overhang : 0), h - 15),
    toCanvas(-overhang, y1 + (y1 > w ? overhang : 0), h - 15),
    toCanvas(midW, y1 + (y1 > w ? overhang : 0), ridgeHeight + 5),
  ];
  ctx.beginPath();
  ctx.moveTo(...roofL[0]);
  roofL.slice(1).forEach(p => ctx.lineTo(...p));
  ctx.closePath();
  ctx.fillStyle = lighten(roofHex, 12);
  ctx.fill();
  ctx.strokeStyle = darken(roofHex, 20);
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

// ─── Detailed Post (square section with depth) ────────────────────────────────
function drawDetailedPost(
  ctx: CanvasRenderingContext2D,
  toCanvas: (x: number, y: number, z: number) => [number, number],
  x: number, y: number, z0: number, z1: number,
  colour: string
) {
  const pw = 35; // post width in mm (visual)

  // Front face of post
  const frontPts = [
    toCanvas(x - pw / 2, y, z0),
    toCanvas(x + pw / 2, y, z0),
    toCanvas(x + pw / 2, y, z1),
    toCanvas(x - pw / 2, y, z1),
  ];
  ctx.beginPath();
  ctx.moveTo(...frontPts[0]);
  frontPts.slice(1).forEach(p => ctx.lineTo(...p));
  ctx.closePath();
  ctx.fillStyle = colour;
  ctx.fill();
  ctx.strokeStyle = darken(colour, 25);
  ctx.lineWidth = 1;
  ctx.stroke();

  // Side face of post (right side visible)
  const sidePts = [
    toCanvas(x + pw / 2, y, z0),
    toCanvas(x + pw / 2, y + pw, z0),
    toCanvas(x + pw / 2, y + pw, z1),
    toCanvas(x + pw / 2, y, z1),
  ];
  ctx.beginPath();
  ctx.moveTo(...sidePts[0]);
  sidePts.slice(1).forEach(p => ctx.lineTo(...p));
  ctx.closePath();
  ctx.fillStyle = darken(colour, 15);
  ctx.fill();
  ctx.strokeStyle = darken(colour, 25);
  ctx.lineWidth = 1;
  ctx.stroke();

  // Top face of post
  const topPts = [
    toCanvas(x - pw / 2, y, z1),
    toCanvas(x + pw / 2, y, z1),
    toCanvas(x + pw / 2, y + pw, z1),
    toCanvas(x - pw / 2, y + pw, z1),
  ];
  ctx.beginPath();
  ctx.moveTo(...topPts[0]);
  topPts.slice(1).forEach(p => ctx.lineTo(...p));
  ctx.closePath();
  ctx.fillStyle = lighten(colour, 20);
  ctx.fill();
  ctx.strokeStyle = darken(colour, 25);
  ctx.lineWidth = 1;
  ctx.stroke();

  // Base plate indicator
  const baseW = pw * 1.3;
  const basePts = [
    toCanvas(x - baseW / 2, y - 5, 0),
    toCanvas(x + baseW / 2, y - 5, 0),
    toCanvas(x + baseW / 2, y + pw + 5, 0),
    toCanvas(x - baseW / 2, y + pw + 5, 0),
  ];
  ctx.beginPath();
  ctx.moveTo(...basePts[0]);
  basePts.slice(1).forEach(p => ctx.lineTo(...p));
  ctx.closePath();
  ctx.fillStyle = "rgba(80, 80, 80, 0.15)";
  ctx.fill();
  ctx.strokeStyle = "rgba(80, 80, 80, 0.3)";
  ctx.lineWidth = 0.8;
  ctx.stroke();
}

// ─── Beam (horizontal member between posts) ──────────────────────────────────
function drawBeam(
  ctx: CanvasRenderingContext2D,
  toCanvas: (x: number, y: number, z: number) => [number, number],
  x0: number, y0: number, z0: number,
  x1: number, y1: number, z1: number,
  colour: string, depth: number
) {
  // Bottom face of beam (visible from below)
  const beamW = 25; // visual width
  const pts = [
    toCanvas(x0, y0, z0 - depth),
    toCanvas(x1, y1, z1 - depth),
    toCanvas(x1, y1, z1),
    toCanvas(x0, y0, z0),
  ];
  ctx.beginPath();
  ctx.moveTo(...pts[0]);
  pts.slice(1).forEach(p => ctx.lineTo(...p));
  ctx.closePath();
  ctx.fillStyle = hexToRgba(darken(colour, 10), 0.3);
  ctx.fill();
  ctx.strokeStyle = hexToRgba(darken(colour, 30), 0.4);
  ctx.lineWidth = 0.8;
  ctx.stroke();
}

// ─── Rafter (thinner beam between main beams) ────────────────────────────────
function drawRafter(
  ctx: CanvasRenderingContext2D,
  toCanvas: (x: number, y: number, z: number) => [number, number],
  x0: number, y0: number, z0: number,
  x1: number, y1: number, z1: number,
  colour: string
) {
  const p0 = toCanvas(x0, y0, z0);
  const p1 = toCanvas(x1, y1, z1);
  ctx.beginPath();
  ctx.moveTo(...p0);
  ctx.lineTo(...p1);
  ctx.strokeStyle = hexToRgba(darken(colour, 20), 0.25);
  ctx.lineWidth = 1.2;
  ctx.stroke();
}

// ─── Ridge Cap ───────────────────────────────────────────────────────────────
function drawRidgeCap(
  ctx: CanvasRenderingContext2D,
  toCanvas: (x: number, y: number, z: number) => [number, number],
  x0: number, y0: number, z0: number,
  x1: number, y1: number, z1: number,
  roofHex: string
) {
  const capWidth = 60; // mm visual width of cap
  const p0 = toCanvas(x0, y0, z0);
  const p1 = toCanvas(x1, y1, z1);

  // Draw as thick line with rounded ends
  ctx.beginPath();
  ctx.moveTo(...p0);
  ctx.lineTo(...p1);
  ctx.strokeStyle = darken(roofHex, 35);
  ctx.lineWidth = 5;
  ctx.lineCap = "round";
  ctx.stroke();
  ctx.lineCap = "butt";

  // Highlight line on top
  ctx.beginPath();
  ctx.moveTo(p0[0], p0[1] - 1);
  ctx.lineTo(p1[0], p1[1] - 1);
  ctx.strokeStyle = lighten(roofHex, 25);
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

// ─── Fascia Board ────────────────────────────────────────────────────────────
function drawFascia(
  ctx: CanvasRenderingContext2D,
  toCanvas: (x: number, y: number, z: number) => [number, number],
  startX: number, startY: number, startZ: number,
  lengthX: number, lengthY: number, depth: number,
  colour: string
) {
  const endX = startX + lengthX;
  const endY = startY + lengthY;

  const pts = [
    toCanvas(startX, startY, startZ),
    toCanvas(endX, endY, startZ),
    toCanvas(endX, endY, startZ - depth),
    toCanvas(startX, startY, startZ - depth),
  ];
  ctx.beginPath();
  ctx.moveTo(...pts[0]);
  pts.slice(1).forEach(p => ctx.lineTo(...p));
  ctx.closePath();
  ctx.fillStyle = colour;
  ctx.fill();
  ctx.strokeStyle = darken(colour, 25);
  ctx.lineWidth = 1.2;
  ctx.stroke();
}

// ─── Gutter Line ─────────────────────────────────────────────────────────────
function drawGutterLine(
  ctx: CanvasRenderingContext2D,
  toCanvas: (x: number, y: number, z: number) => [number, number],
  startX: number, startY: number, z: number,
  lengthX: number, lengthY: number
) {
  const endX = startX + lengthX;
  const endY = startY + lengthY;
  const p0 = toCanvas(startX, startY, z);
  const p1 = toCanvas(endX, endY, z);

  ctx.beginPath();
  ctx.moveTo(...p0);
  ctx.lineTo(...p1);
  ctx.strokeStyle = "#888888";
  ctx.lineWidth = 2;
  ctx.stroke();

  // Gutter profile (small arc below)
  ctx.beginPath();
  ctx.moveTo(...p0);
  ctx.lineTo(...p1);
  ctx.strokeStyle = "#AAAAAA";
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 3]);
  const gutterLow0 = toCanvas(startX, startY, z - 15);
  const gutterLow1 = toCanvas(endX, endY, z - 15);
  ctx.moveTo(...gutterLow0);
  ctx.lineTo(...gutterLow1);
  ctx.stroke();
  ctx.setLineDash([]);
}

// ─── Dimension Labels with Proper Arrows ─────────────────────────────────────
function drawDimensionLabels(
  ctx: CanvasRenderingContext2D,
  toCanvas: (x: number, y: number, z: number) => [number, number],
  w: number, l: number, h: number
) {
  ctx.font = "bold 14px Inter, system-ui, sans-serif";
  ctx.fillStyle = "#333333";
  ctx.textAlign = "center";

  const dimOffset = 200;

  // Width label (along front edge)
  const wStart = toCanvas(0, -dimOffset, 0);
  const wEnd = toCanvas(w, -dimOffset, 0);
  const wMid = toCanvas(w / 2, -dimOffset, 0);
  drawDimensionArrow(ctx, wStart, wEnd);
  ctx.fillText(`${(w / 1000).toFixed(1)}m`, wMid[0], wMid[1] - 8);

  // Length label (along right edge)
  const lStart = toCanvas(w + dimOffset, 0, 0);
  const lEnd = toCanvas(w + dimOffset, l, 0);
  const lMid = toCanvas(w + dimOffset, l / 2, 0);
  drawDimensionArrow(ctx, lStart, lEnd);
  ctx.fillText(`${(l / 1000).toFixed(1)}m`, lMid[0] + 10, lMid[1] + 5);

  // Height label (vertical on left)
  const hStart = toCanvas(-dimOffset, 0, 0);
  const hEnd = toCanvas(-dimOffset, 0, h);
  const hMid = toCanvas(-dimOffset, 0, h / 2);
  drawDimensionArrow(ctx, hStart, hEnd);
  ctx.fillText(`${(h / 1000).toFixed(1)}m`, hMid[0] - 10, hMid[1] + 5);
}

function drawDimensionArrow(ctx: CanvasRenderingContext2D, start: [number, number], end: [number, number]) {
  const headLen = 8;
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  const angle = Math.atan2(dy, dx);

  // Main line
  ctx.beginPath();
  ctx.moveTo(...start);
  ctx.lineTo(...end);
  ctx.strokeStyle = "#555555";
  ctx.lineWidth = 1;
  ctx.stroke();

  // Extension lines (small perpendicular marks at each end)
  const perpAngle = angle + Math.PI / 2;
  const extLen = 6;

  [start, end].forEach(pt => {
    ctx.beginPath();
    ctx.moveTo(pt[0] + Math.cos(perpAngle) * extLen, pt[1] + Math.sin(perpAngle) * extLen);
    ctx.lineTo(pt[0] - Math.cos(perpAngle) * extLen, pt[1] - Math.sin(perpAngle) * extLen);
    ctx.strokeStyle = "#555555";
    ctx.lineWidth = 1;
    ctx.stroke();
  });

  // Arrowhead at start
  ctx.beginPath();
  ctx.moveTo(...start);
  ctx.lineTo(
    start[0] + headLen * Math.cos(angle - Math.PI / 7),
    start[1] + headLen * Math.sin(angle - Math.PI / 7)
  );
  ctx.moveTo(...start);
  ctx.lineTo(
    start[0] + headLen * Math.cos(angle + Math.PI / 7),
    start[1] + headLen * Math.sin(angle + Math.PI / 7)
  );
  ctx.strokeStyle = "#555555";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Arrowhead at end
  ctx.beginPath();
  ctx.moveTo(...end);
  ctx.lineTo(
    end[0] - headLen * Math.cos(angle - Math.PI / 7),
    end[1] - headLen * Math.sin(angle - Math.PI / 7)
  );
  ctx.moveTo(...end);
  ctx.lineTo(
    end[0] - headLen * Math.cos(angle + Math.PI / 7),
    end[1] - headLen * Math.sin(angle + Math.PI / 7)
  );
  ctx.strokeStyle = "#555555";
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

// ─── Colour Legend ────────────────────────────────────────────────────────────
function drawColourLegend(
  ctx: CanvasRenderingContext2D,
  roofName: string, beamName: string, postName: string,
  roofHex: string, beamHex: string, postHex: string
) {
  const y = 760;
  const x = 60;
  const spacing = 200;

  ctx.font = "13px Inter, system-ui, sans-serif";
  ctx.textAlign = "left";

  // Roof colour swatch
  ctx.fillStyle = roofHex;
  ctx.fillRect(x, y - 10, 18, 18);
  ctx.strokeStyle = "#999";
  ctx.lineWidth = 0.5;
  ctx.strokeRect(x, y - 10, 18, 18);
  ctx.fillStyle = "#333";
  ctx.fillText(`Roof: ${roofName}`, x + 24, y + 4);

  // Beam/structure colour swatch
  const x2 = x + spacing;
  ctx.fillStyle = beamHex;
  ctx.fillRect(x2, y - 10, 18, 18);
  ctx.strokeStyle = "#999";
  ctx.strokeRect(x2, y - 10, 18, 18);
  ctx.fillStyle = "#333";
  ctx.fillText(`Beams: ${beamName}`, x2 + 24, y + 4);

  // Post colour swatch
  const x3 = x2 + spacing;
  ctx.fillStyle = postHex;
  ctx.fillRect(x3, y - 10, 18, 18);
  ctx.strokeStyle = "#999";
  ctx.strokeRect(x3, y - 10, 18, 18);
  ctx.fillStyle = "#333";
  ctx.fillText(`Posts: ${postName}`, x3 + 24, y + 4);
}

/**
 * Determine roof type from spec sheet string.
 * Maps common spec values to our enum.
 */
export function parseRoofType(specRoofType?: string | null): RoofType {
  if (!specRoofType) return "skillion";
  const lower = specRoofType.toLowerCase().trim();
  if (lower.includes("flyover") || lower.includes("attached")) return "flyover";
  if (lower.includes("split") && lower.includes("gable")) return "split_gable";
  if (lower.includes("hip")) return "hip";
  if (lower.includes("gable")) return "gable";
  return "skillion"; // default for flat, skillion, mono-pitch etc.
}

// ─── Flyover / Attached Roof ───────────────────────────────────────────────────────
// Renders a skillion-style roof attached to a house wall on the back side.
// No posts on the back edge; instead a rendered brick/wall face is shown.
function drawFlyover(
  ctx: CanvasRenderingContext2D,
  toCanvas: (x: number, y: number, z: number) => [number, number],
  w: number, l: number, h: number,
  roofHex: string, beamHex: string, postHex: string
) {
  const wallHeight = h + l * 0.15 + 200; // House wall is taller than the structure
  const ridgeHeight = h + l * 0.15; // High side at wall
  const overhang = 80;
  const beamDepth = 60;
  const fasciaDepth = 40;
  const wallThickness = 120;

  // ─── House wall (back side) ───
  // Wall face (rendered/brick texture)
  const wallPts = [
    toCanvas(-100, l, 0),
    toCanvas(w + 100, l, 0),
    toCanvas(w + 100, l, wallHeight),
    toCanvas(-100, l, wallHeight),
  ];
  ctx.beginPath();
  ctx.moveTo(...wallPts[0]);
  wallPts.slice(1).forEach(p => ctx.lineTo(...p));
  ctx.closePath();
  ctx.fillStyle = "#D4C5B0"; // Rendered wall colour
  ctx.fill();
  ctx.strokeStyle = "#A89880";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Brick pattern on wall
  const brickH = 35;
  const brickW = 120;
  const wallLeft = toCanvas(-100, l, 0);
  const wallRight = toCanvas(w + 100, l, 0);
  const wallTop = toCanvas(-100, l, wallHeight);
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(...wallPts[0]);
  wallPts.slice(1).forEach(p => ctx.lineTo(...p));
  ctx.closePath();
  ctx.clip();

  // Horizontal mortar lines
  ctx.strokeStyle = "rgba(160, 140, 120, 0.3)";
  ctx.lineWidth = 0.5;
  for (let row = 0; row < wallHeight / brickH; row++) {
    const z = row * brickH;
    const p1 = toCanvas(-100, l, z);
    const p2 = toCanvas(w + 100, l, z);
    ctx.beginPath();
    ctx.moveTo(...p1);
    ctx.lineTo(...p2);
    ctx.stroke();
  }
  ctx.restore();

  // Wall thickness (side face visible)
  const wallSide = [
    toCanvas(w + 100, l, 0),
    toCanvas(w + 100, l + wallThickness, 0),
    toCanvas(w + 100, l + wallThickness, wallHeight),
    toCanvas(w + 100, l, wallHeight),
  ];
  ctx.beginPath();
  ctx.moveTo(...wallSide[0]);
  wallSide.slice(1).forEach(p => ctx.lineTo(...p));
  ctx.closePath();
  ctx.fillStyle = "#BFB09A";
  ctx.fill();
  ctx.strokeStyle = "#A89880";
  ctx.lineWidth = 1;
  ctx.stroke();

  // ─── Front posts only (no back posts — attached to wall) ───
  drawDetailedPost(ctx, toCanvas, 0, 0, 0, h, postHex);
  drawDetailedPost(ctx, toCanvas, w, 0, 0, h, postHex);
  // Optional mid-post if wide
  if (w > 4000) {
    drawDetailedPost(ctx, toCanvas, w / 2, 0, 0, h, postHex);
  }

  // ─── Beams ───
  // Front beam
  drawBeam(ctx, toCanvas, 0, 0, h, w, 0, h, beamHex, beamDepth);
  // Side beams (from front posts to wall)
  drawBeam(ctx, toCanvas, 0, 0, h, 0, l, ridgeHeight, beamHex, beamDepth);
  drawBeam(ctx, toCanvas, w, 0, h, w, l, ridgeHeight, beamHex, beamDepth);
  // Wall plate (at wall face)
  drawBeam(ctx, toCanvas, 0, l, ridgeHeight, w, l, ridgeHeight, beamHex, beamDepth);

  // ─── Rafters ───
  const rafterCount = Math.max(3, Math.round(w / 600));
  for (let i = 0; i <= rafterCount; i++) {
    const frac = i / rafterCount;
    const x = w * frac;
    drawRafter(ctx, toCanvas, x, 0, h, x, l, ridgeHeight, beamHex);
  }

  // ─── Roof face (single slope, attached at high side) ───
  const roofPts = [
    toCanvas(-overhang, -overhang, h - 10),
    toCanvas(w + overhang, -overhang, h - 10),
    toCanvas(w + overhang, l + 20, ridgeHeight + 10), // Tucks under wall
    toCanvas(-overhang, l + 20, ridgeHeight + 10),
  ];
  ctx.beginPath();
  ctx.moveTo(...roofPts[0]);
  roofPts.slice(1).forEach(p => ctx.lineTo(...p));
  ctx.closePath();
  ctx.fillStyle = roofHex;
  ctx.fill();
  ctx.strokeStyle = darken(roofHex, 20);
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Roof panel ribs
  const ribCount = Math.max(6, Math.round(w / 300));
  for (let i = 1; i < ribCount; i++) {
    const frac = i / ribCount;
    const x = -overhang + (w + overhang * 2) * frac;
    const p1 = toCanvas(x, -overhang, h - 10);
    const p2 = toCanvas(x, l + 20, ridgeHeight + 10);
    ctx.beginPath();
    ctx.moveTo(...p1);
    ctx.lineTo(...p2);
    ctx.strokeStyle = hexToRgba(darken(roofHex, 15), 0.5);
    ctx.lineWidth = 0.7;
    ctx.stroke();
  }

  // Fascia (front edge — low side)
  drawFascia(ctx, toCanvas, -overhang, -overhang, h - 10, w + overhang * 2, 0, fasciaDepth, beamHex);

  // Gutter line (front)
  drawGutterLine(ctx, toCanvas, -overhang, -overhang, h - fasciaDepth - 10, w + overhang * 2, 0);

  // ─── "Attached" label on wall ───
  const labelPos = toCanvas(w / 2, l, wallHeight - 80);
  ctx.font = "italic 14px Inter, system-ui, sans-serif";
  ctx.fillStyle = "#666";
  ctx.textAlign = "center";
  ctx.fillText("Existing House Wall", labelPos[0], labelPos[1]);
}


// ─── Roof Sheet Calculator ──────────────────────────────────────────────────
export interface RoofSheetCalcResult {
  sheetCoverWidth: number;     // mm
  skylightWidth: number;       // mm per skylight strip
  totalSheets: number;         // always rounded up to full sheet
  skylightSheets: number;      // number of skylight panels/strips
  effectiveCoverage: number;   // total coverage in mm (sheets + skylights)
  wasteSheets: number;         // fractional waste expressed as sheet count
  roofAreaM2: number;          // width × length in m²
  sheetsOrderedM2: number;     // sheets × cover width × length
  skylightsOrderedM2: number;  // skylights × skylight width × length
}

/**
 * Determine sheet cover width from product name
 */
export function getSheetCoverWidth(roofSheetType?: string): number {
  if (!roofSheetType) return 1000;
  const t = roofSheetType.toLowerCase();
  if (t.includes("double u") || t.includes("double-u") || t.includes("doubleu")) return 305;
  if (t.includes("slendek")) return 305;
  if (t.includes("climatek")) return 1000;
  if (t.includes("ambitek")) return 1000;
  if (t.includes("wavetek")) return 1000;
  if (t.includes("corrotek") || t.includes("double corro") || t.includes("doublecorro")) return 1000;
  if (t.includes("signature")) return 1100;
  return 1000; // default
}

/**
 * Determine skylight width from skylight type and roof sheet type
 */
export function getSkylightWidth(skylightType?: string, roofSheetType?: string): number {
  if (!skylightType) return 0;
  const st = skylightType.toLowerCase();
  const rt = (roofSheetType || "").toLowerCase();
  // Spanlite for Double U = 150mm
  if (st.includes("spanlite") || st.includes("span lite")) return 150;
  // Slenlite for Slendek = 150mm
  if (st.includes("slenlite") || st.includes("slen lite")) return 150;
  // Climatek V Skylight = 250mm
  if (st.includes("climatek")) return 250;
  // Ezi-struct for Ambitek/Wavetek/Corrotek = 250mm
  if (st.includes("ezi") || st.includes("ezy")) return 250;
  // Signature skylight = 150mm
  if (rt.includes("signature")) return 150;
  // Default based on roof type
  if (rt.includes("double u")) return 150;
  if (rt.includes("slendek")) return 150;
  return 250; // default for insulated panels
}

/**
 * Determine the skylight behaviour type based on roof sheet product
 */
type SkylightBehaviour = "net_zero" | "cut_into" | "adds_coverage";

function getSkylightBehaviour(roofSheetType?: string): SkylightBehaviour {
  if (!roofSheetType) return "adds_coverage";
  const t = roofSheetType.toLowerCase();
  // Double U + Spanlite: split sheet, cut cancels addition = net zero
  if (t.includes("double u") || t.includes("double-u") || t.includes("doubleu")) return "net_zero";
  // Double Corro: skylight adds to coverage
  if (t.includes("double corro") || t.includes("doublecorro")) return "adds_coverage";
  // Climatek: skylight cut into panel, overall width stays 1000mm
  if (t.includes("climatek")) return "cut_into";
  // Ambitek, Wavetek, Corrotek, Slendek: skylight adds to coverage
  return "adds_coverage";
}

/**
 * Calculate roof sheet quantities considering skylights.
 * All sheet quantities are rounded UP to the nearest full sheet.
 */
export function calculateRoofSheets(
  widthMm: number,
  lengthMm: number,
  roofSheetType?: string,
  skylightType?: string,
  skylightQty?: number,
  skylightLm?: number,
): RoofSheetCalcResult {
  const sheetCoverWidth = getSheetCoverWidth(roofSheetType);
  const skylightWidth = getSkylightWidth(skylightType, roofSheetType);
  const qty = skylightQty || 0;
  const lm = skylightLm || 0;
  const behaviour = getSkylightBehaviour(roofSheetType);

  let totalSheets: number;
  let skylightSheets = qty;

  switch (behaviour) {
    case "net_zero":
      // Double U + Spanlite: skylights don't reduce sheet count
      // Sheet is split and spanlite inserted, but cut offsets the addition
      totalSheets = Math.ceil(widthMm / sheetCoverWidth);
      break;
    case "cut_into":
      // Climatek: skylight cut into panel, overall width stays same
      // Full sheets still needed for entire coverage area
      totalSheets = Math.ceil(widthMm / sheetCoverWidth);
      break;
    case "adds_coverage":
      // Ambitek/Wavetek/Corrotek/Slendek: skylights add to coverage
      // Remaining roof = width - (qty × skylightWidth)
      const remainingWidth = Math.max(0, widthMm - (qty * skylightWidth));
      totalSheets = Math.ceil(remainingWidth / sheetCoverWidth);
      break;
  }

  const effectiveCoverage = totalSheets * sheetCoverWidth + qty * skylightWidth;
  const wasteMm = effectiveCoverage - widthMm;
  const wasteSheets = wasteMm / sheetCoverWidth;

  const lengthM = lengthMm / 1000;
  const widthM = widthMm / 1000;
  const roofAreaM2 = widthM * lengthM;
  const sheetsOrderedM2 = totalSheets * (sheetCoverWidth / 1000) * lengthM;
  const skylightsOrderedM2 = qty * (skylightWidth / 1000) * (lm || lengthM);

  return {
    sheetCoverWidth,
    skylightWidth,
    totalSheets,
    skylightSheets,
    effectiveCoverage,
    wasteSheets,
    roofAreaM2,
    sheetsOrderedM2,
    skylightsOrderedM2,
  };
}

// ─── Skylight Rendering on Roof ─────────────────────────────────────────────
function drawSkylightsOnRoof(
  ctx: CanvasRenderingContext2D,
  toCanvas: (x: number, y: number, z: number) => [number, number],
  w: number, l: number, h: number,
  roofType: RoofType,
  skylight: SkylightInfo,
  roofSheetType?: string,
) {
  const { qty, lm } = skylight;
  if (qty <= 0 || lm <= 0) return;

  const skylightWidthMm = getSkylightWidth(skylight.type, roofSheetType);
  const skylightLengthMm = lm * 1000; // convert LM to mm
  const behaviour = getSkylightBehaviour(roofSheetType);

  // Skylight colour (translucent blue-white for clear/opal, amber for diffused)
  const finish = (skylight.finish || "").toLowerCase();
  let skylightColour = "rgba(180, 220, 255, 0.55)"; // clear/opal
  if (finish === "diffused") skylightColour = "rgba(255, 240, 180, 0.55)";

  const overhang = 80;

  // For skillion/flyover: roof slopes from front (h) to back (ridgeHeight)
  // For gable: two slopes from eave (h) to ridge (h + w*0.2)
  // We render skylights as parallelograms on the roof surface

  if (roofType === "skillion" || roofType === "flyover") {
    const ridgeHeight = roofType === "flyover" ? h + l * 0.12 : h + l * 0.15;
    // Skylights run along the sheet direction (front to back = length direction)
    // Position them evenly across the width
    const spacing = w / (qty + 1);

    for (let i = 1; i <= qty; i++) {
      const xCenter = spacing * i;
      const halfW = skylightWidthMm / 2;
      // Skylight starts some distance from front edge, length = skylightLengthMm
      const yStart = (l - skylightLengthMm) / 2; // centered along length
      const yEnd = yStart + skylightLengthMm;

      // Interpolate Z for the sloped roof
      const z1 = h + (ridgeHeight - h) * (yStart / l);
      const z2 = h + (ridgeHeight - h) * (yEnd / l);

      const pts = [
        toCanvas(xCenter - halfW, yStart, z1 + 5),
        toCanvas(xCenter + halfW, yStart, z1 + 5),
        toCanvas(xCenter + halfW, yEnd, z2 + 5),
        toCanvas(xCenter - halfW, yEnd, z2 + 5),
      ];

      ctx.beginPath();
      ctx.moveTo(...pts[0]);
      pts.slice(1).forEach(p => ctx.lineTo(...p));
      ctx.closePath();
      ctx.fillStyle = skylightColour;
      ctx.fill();
      ctx.strokeStyle = "rgba(100, 160, 220, 0.8)";
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Label
      const labelPt = toCanvas(xCenter, (yStart + yEnd) / 2, (z1 + z2) / 2 + 20);
      ctx.font = "bold 11px Inter, system-ui, sans-serif";
      ctx.fillStyle = "#1565C0";
      ctx.textAlign = "center";
      ctx.fillText(`S${i}`, labelPt[0], labelPt[1]);
    }
  } else if (roofType === "gable" || roofType === "split_gable") {
    const ridgeHeight = h + w * 0.2;
    const midW = w / 2;
    // For gable, skylights are on each slope — distribute across both sides
    const perSide = Math.ceil(qty / 2);
    const leftQty = Math.min(perSide, qty);
    const rightQty = qty - leftQty;

    // Left slope (x: 0 to midW)
    for (let i = 1; i <= leftQty; i++) {
      const yCenter = l / 2;
      const yStart = yCenter - skylightLengthMm / 2;
      const yEnd = yCenter + skylightLengthMm / 2;
      const xFrac = i / (leftQty + 1);
      const xCenter = midW * xFrac;
      const halfW = skylightWidthMm / 2;
      const zAtX = h + (ridgeHeight - h) * (xCenter / midW);

      const pts = [
        toCanvas(xCenter - halfW, yStart, zAtX + 3),
        toCanvas(xCenter + halfW, yStart, zAtX + 3),
        toCanvas(xCenter + halfW, yEnd, zAtX + 3),
        toCanvas(xCenter - halfW, yEnd, zAtX + 3),
      ];

      ctx.beginPath();
      ctx.moveTo(...pts[0]);
      pts.slice(1).forEach(p => ctx.lineTo(...p));
      ctx.closePath();
      ctx.fillStyle = skylightColour;
      ctx.fill();
      ctx.strokeStyle = "rgba(100, 160, 220, 0.8)";
      ctx.lineWidth = 1.5;
      ctx.stroke();

      const labelPt = toCanvas(xCenter, yCenter, zAtX + 20);
      ctx.font = "bold 11px Inter, system-ui, sans-serif";
      ctx.fillStyle = "#1565C0";
      ctx.textAlign = "center";
      ctx.fillText(`S${i}`, labelPt[0], labelPt[1]);
    }

    // Right slope (x: midW to w)
    for (let i = 1; i <= rightQty; i++) {
      const yCenter = l / 2;
      const yStart = yCenter - skylightLengthMm / 2;
      const yEnd = yCenter + skylightLengthMm / 2;
      const xFrac = i / (rightQty + 1);
      const xCenter = midW + midW * xFrac;
      const halfW = skylightWidthMm / 2;
      const zAtX = ridgeHeight - (ridgeHeight - h) * ((xCenter - midW) / midW);

      const pts = [
        toCanvas(xCenter - halfW, yStart, zAtX + 3),
        toCanvas(xCenter + halfW, yStart, zAtX + 3),
        toCanvas(xCenter + halfW, yEnd, zAtX + 3),
        toCanvas(xCenter - halfW, yEnd, zAtX + 3),
      ];

      ctx.beginPath();
      ctx.moveTo(...pts[0]);
      pts.slice(1).forEach(p => ctx.lineTo(...p));
      ctx.closePath();
      ctx.fillStyle = skylightColour;
      ctx.fill();
      ctx.strokeStyle = "rgba(100, 160, 220, 0.8)";
      ctx.lineWidth = 1.5;
      ctx.stroke();

      const labelPt = toCanvas(xCenter, yCenter, zAtX + 20);
      ctx.font = "bold 11px Inter, system-ui, sans-serif";
      ctx.fillStyle = "#1565C0";
      ctx.textAlign = "center";
      ctx.fillText(`S${leftQty + i}`, labelPt[0], labelPt[1]);
    }
  } else if (roofType === "hip") {
    // Hip roof — similar to skillion but with hip slopes
    const ridgeHeight = h + w * 0.18;
    const spacing = w / (qty + 1);

    for (let i = 1; i <= qty; i++) {
      const xCenter = spacing * i;
      const halfW = skylightWidthMm / 2;
      const yStart = (l - skylightLengthMm) / 2;
      const yEnd = yStart + skylightLengthMm;
      // Approximate Z on hip roof surface
      const xDist = Math.min(xCenter, w - xCenter);
      const zApprox = h + (ridgeHeight - h) * Math.min(1, xDist / (w * 0.4));

      const pts = [
        toCanvas(xCenter - halfW, yStart, zApprox + 3),
        toCanvas(xCenter + halfW, yStart, zApprox + 3),
        toCanvas(xCenter + halfW, yEnd, zApprox + 3),
        toCanvas(xCenter - halfW, yEnd, zApprox + 3),
      ];

      ctx.beginPath();
      ctx.moveTo(...pts[0]);
      pts.slice(1).forEach(p => ctx.lineTo(...p));
      ctx.closePath();
      ctx.fillStyle = skylightColour;
      ctx.fill();
      ctx.strokeStyle = "rgba(100, 160, 220, 0.8)";
      ctx.lineWidth = 1.5;
      ctx.stroke();

      const labelPt = toCanvas(xCenter, (yStart + yEnd) / 2, zApprox + 20);
      ctx.font = "bold 11px Inter, system-ui, sans-serif";
      ctx.fillStyle = "#1565C0";
      ctx.textAlign = "center";
      ctx.fillText(`S${i}`, labelPt[0], labelPt[1]);
    }
  }

  // Draw skylight legend/summary below the diagram
  const sheetCalc = calculateRoofSheets(w, l, roofSheetType, skylight.type, qty, lm);
  const legendY = 780;
  ctx.font = "13px Inter, system-ui, sans-serif";
  ctx.fillStyle = "#333";
  ctx.textAlign = "left";
  ctx.fillText(
    `Skylights: ${qty} × ${skylight.type || "Skylight"} (${skylightWidthMm}mm wide × ${lm}m long, ${skylight.finish || "Clear"})`,
    20, legendY - 20
  );
  ctx.fillText(
    `Roof Sheets: ${sheetCalc.totalSheets} × ${roofSheetType || "Sheet"} (${sheetCalc.sheetCoverWidth}mm cover)  |  Skylight Panels: ${qty}`,
    20, legendY
  );
}
