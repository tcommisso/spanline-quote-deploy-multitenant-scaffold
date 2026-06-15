/**
 * Board Cut Plan & Waste Calculator
 * Calculates how many boards are needed, their cut lengths, stagger offsets,
 * and total waste for a given deck layout configuration.
 */

import type { SubfloorInputs, BoardLayoutInputs, OptionResult, SubfloorResult } from "./subfloor-calc";
import { DEFAULT_BOARD_LAYOUT } from "./subfloor-calc";
import { optimiseCutting, type CutPiece, type StockDefinition, type CuttingResult } from "./cuttingOptimiser";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface BoardRow {
  rowIndex: number;
  /** Y position from start edge (mm) */
  yPosition: number;
  /** Boards in this row with their cut lengths */
  boards: BoardCut[];
  /** Total linear mm of board material used in this row */
  totalLength: number;
}

export interface BoardCut {
  /** Length of this board piece (mm) */
  cutLength: number;
  /** X position from start edge (mm) */
  xPosition: number;
  /** Whether this is a full-length board or a cut piece */
  isCut: boolean;
  /** Offcut remaining from this stock board (mm), 0 if fully used */
  offcut: number;
}

export interface BoardCutPlan {
  /** All board rows */
  rows: BoardRow[];
  /** Total number of stock boards required (rounded up) */
  totalStockBoards: number;
  /** Total linear metres of board material */
  totalLinearM: number;
  /** Total deck surface area covered (m²) */
  coverageAreaM2: number;
  /** Waste percentage */
  wastePercent: number;
  /** Total waste in linear metres */
  wasteLinearM: number;
  /** Picture frame boards (if applicable) */
  pictureFrameBoards: number;
  /** Breaker board pieces (if applicable) */
  breakerBoardPieces: number;
  /** Fascia board linear metres */
  fasciaBoardLinearM: number;
  /** Fascia board stock count */
  fasciaBoardStockBoards: number;
  /** Infill board linear metres */
  infillBoardLinearM: number;
  /** Infill board stock count */
  infillBoardStockBoards: number;
  /** Summary for display */
  summary: string;
}

// ─── Calculation ────────────────────────────────────────────────────────────

/**
 * Calculate the board cut plan for a deck.
 * Accounts for board direction, stagger pattern, picture frame, and breaker boards.
 */
export function calculateBoardCutPlan(inputs: SubfloorInputs): BoardCutPlan {
  const layout: BoardLayoutInputs = inputs.boardLayout || DEFAULT_BOARD_LAYOUT;
  const { boardWidth, boardGap, boardLength, boardDirection, staggerPattern, pictureFrame, breakerBoard, breakerDirection, breakerPosition, diagonalAngle } = layout;

  // Effective cover per board row (face width + gap)
  const coverPerRow = boardWidth + boardGap;

  // Determine deck dimensions for board laying direction
  let layLength: number; // distance boards run along
  let layWidth: number;  // distance across which rows are laid

  if (boardDirection === "parallel") {
    // Boards run parallel to length → rows laid across width
    layLength = inputs.length;
    layWidth = inputs.width;
  } else if (boardDirection === "perpendicular") {
    // Boards run across width → rows laid along length
    layLength = inputs.width;
    layWidth = inputs.length;
  } else {
    // Diagonal: boards run at angle, effective run length increases
    const radians = ((diagonalAngle || 45) * Math.PI) / 180;
    // For diagonal, the effective board run is longer
    layLength = Math.ceil(inputs.length / Math.cos(radians));
    // More rows needed because effective coverage is reduced
    layWidth = Math.ceil(inputs.width / Math.cos(radians));
  }

  // Account for picture frame reducing the field area
  let fieldLength = layLength;
  let fieldWidth = layWidth;
  let pictureFrameBoards = 0;

  if (pictureFrame === "single") {
    // Single border on all 4 sides: 1 board width removed from each edge
    fieldLength -= 2 * boardWidth;
    fieldWidth -= 2 * boardWidth;
    // 4 border pieces (2 along length, 2 along width)
    pictureFrameBoards = 4;
  } else if (pictureFrame === "double") {
    fieldLength -= 4 * boardWidth;
    fieldWidth -= 4 * boardWidth;
    pictureFrameBoards = 8;
  }

  // Ensure positive dimensions
  fieldLength = Math.max(fieldLength, 0);
  fieldWidth = Math.max(fieldWidth, 0);

  // Number of board rows in the field
  const numRows = Math.max(1, Math.ceil(fieldWidth / coverPerRow));

  // Build rows with stagger pattern
  const rows: BoardRow[] = [];
  let totalStockUsed = 0; // in mm

  for (let i = 0; i < numRows; i++) {
    const yPosition = i * coverPerRow;
    let staggerOffset = 0;

    if (staggerPattern === "equal") {
      // Equal offset: alternate rows offset by half board length
      staggerOffset = (i % 2 === 0) ? 0 : Math.round(boardLength / 2);
    } else if (staggerPattern === "third") {
      // 1/3 offset: cycle through 3 positions
      staggerOffset = (i % 3) * Math.round(boardLength / 3);
    } else if (staggerPattern === "quarter") {
      // 1/4 offset: cycle through 4 positions
      staggerOffset = (i % 4) * Math.round(boardLength / 4);
    } else {
      // Random: pseudo-random offset using golden ratio
      staggerOffset = Math.round(((i * 1.618) % 1) * boardLength * 0.6);
    }

    const boards: BoardCut[] = [];
    let xPos = -staggerOffset; // Start before edge for stagger
    let rowTotal = 0;

    // Fill the row
    while (xPos < fieldLength) {
      const remainingSpace = fieldLength - xPos;
      let cutLen: number;

      if (xPos < 0) {
        // First board is cut to fit from edge
        cutLen = Math.min(boardLength + xPos, fieldLength);
        xPos = 0;
      } else if (remainingSpace <= boardLength) {
        // Last board in row — cut to fit
        cutLen = remainingSpace;
      } else {
        // Full board
        cutLen = boardLength;
      }

      if (cutLen <= 0) break;

      const isCut = cutLen < boardLength;
      const offcut = isCut ? boardLength - cutLen : 0;

      boards.push({
        cutLength: Math.round(cutLen),
        xPosition: Math.round(Math.max(0, xPos)),
        isCut,
        offcut: Math.round(offcut),
      });

      rowTotal += cutLen;
      xPos += cutLen;
      totalStockUsed += boardLength; // Each piece uses one stock board (conservative)
    }

    rows.push({
      rowIndex: i,
      yPosition: Math.round(yPosition),
      boards,
      totalLength: Math.round(rowTotal),
    });
  }

  // Breaker board pieces — direction determines which dimension the breaker spans
  // "along-width": breaker runs along the width axis (top-to-bottom in plan)
  // "along-length": breaker runs along the length axis (left-to-right in plan)
  const breakerSpan = (breakerDirection || "along-width") === "along-width" ? inputs.width : inputs.length;
  let breakerBoardPieces = 0;
  if (breakerBoard === "single") {
    breakerBoardPieces = Math.ceil(breakerSpan / boardLength);
  } else if (breakerBoard === "double") {
    breakerBoardPieces = Math.ceil(breakerSpan / boardLength) * 2;
  }

  // Picture frame linear metres
  let pictureFrameLinearMm = 0;
  if (pictureFrame === "single") {
    pictureFrameLinearMm = 2 * layLength + 2 * layWidth;
  } else if (pictureFrame === "double") {
    pictureFrameLinearMm = 2 * (2 * layLength + 2 * layWidth);
  }

  // Total stock boards calculation
  const fieldBoardsNeeded = rows.reduce((sum, row) => sum + row.boards.length, 0);
  const pfBoardsNeeded = Math.ceil(pictureFrameLinearMm / boardLength);
  const totalStockBoards = fieldBoardsNeeded + pfBoardsNeeded + breakerBoardPieces;

  // Total linear metres
  const totalLinearMm = rows.reduce((sum, row) => sum + row.totalLength, 0) + pictureFrameLinearMm + (breakerBoardPieces * fieldWidth);
  const totalLinearM = totalLinearMm / 1000;

  // Coverage area
  const coverageAreaM2 = (totalLinearMm * boardWidth) / 1_000_000;

  // Waste calculation: stock used vs actual coverage needed
  const stockUsedMm = totalStockBoards * boardLength;
  const wasteLinearMm = Math.max(0, stockUsedMm - totalLinearMm);
  const wasteLinearM = wasteLinearMm / 1000;
  const wastePercent = stockUsedMm > 0 ? (wasteLinearMm / stockUsedMm) * 100 : 0;


  // Fascia boards: vertical boards covering the subfloor structure
  let fasciaBoardLinearMm = 0;
  let fasciaBoardStockBoards = 0;
  if (layout.fascia && layout.fascia !== "none") {
    // Fascia runs around exposed perimeter; height determines number of rows
    const fasciaHeight = layout.fasciaHeightMm || 150;
    const fasciaRows = Math.max(1, Math.ceil(fasciaHeight / boardWidth));
    const perimeterMm = 2 * inputs.length + 2 * inputs.width;
    fasciaBoardLinearMm = perimeterMm * fasciaRows;
    fasciaBoardStockBoards = Math.ceil(fasciaBoardLinearMm / boardLength);
  }

  // Infill boards: boards between ground and deck edge
  let infillBoardLinearMm = 0;
  let infillBoardStockBoards = 0;
  if (layout.infill && layout.infill !== "none" && (layout.infill === "matching" || layout.infill === "vertical-slats" || layout.infill === "horizontal-slats")) {
    // Infill covers exposed sides from ground to underside of deck
    // Assume deck height ~400mm (minHeight) for infill area calculation
    const deckHeight = 400; // mm, typical low-profile deck height
    const perimeterMm = 2 * inputs.length + 2 * inputs.width;
    if (layout.infill === "horizontal-slats" || layout.infill === "matching") {
      // Horizontal boards: rows stacked vertically
      const infillRows = Math.max(1, Math.ceil(deckHeight / (boardWidth + (layout.boardGap || 5.5))));
      infillBoardLinearMm = perimeterMm * infillRows;
    } else {
      // Vertical slats: boards placed vertically at ~100mm centres
      const slatCount = Math.ceil(perimeterMm / 100);
      infillBoardLinearMm = slatCount * deckHeight;
    }
    infillBoardStockBoards = Math.ceil(infillBoardLinearMm / boardLength);
  }

  // Summary
  const parts: string[] = [];
  parts.push(`${totalStockBoards} boards @ ${boardLength}mm`);
  parts.push(`${totalLinearM.toFixed(1)} LM total`);
  parts.push(`${wastePercent.toFixed(1)}% waste`);
  if (pictureFrameBoards > 0) parts.push(`+${pfBoardsNeeded} picture frame`);
  if (breakerBoardPieces > 0) parts.push(`+${breakerBoardPieces} breaker`);
  if (fasciaBoardStockBoards > 0) parts.push(`+${fasciaBoardStockBoards} fascia`);
  if (infillBoardStockBoards > 0) parts.push(`+${infillBoardStockBoards} infill`);

  return {
    rows,
    totalStockBoards: totalStockBoards + fasciaBoardStockBoards + infillBoardStockBoards,
    totalLinearM: totalLinearM + (fasciaBoardLinearMm + infillBoardLinearMm) / 1000,
    coverageAreaM2,
    wastePercent,
    wasteLinearM,
    pictureFrameBoards: pfBoardsNeeded,
    breakerBoardPieces,
    fasciaBoardLinearM: fasciaBoardLinearMm / 1000,
    fasciaBoardStockBoards,
    infillBoardLinearM: infillBoardLinearMm / 1000,
    infillBoardStockBoards,
    summary: parts.join(" | "),
  };
}

// ─── Optimised Cutting Plan ─────────────────────────────────────────────────

/**
 * Generate an optimised cutting plan using the bin-packing algorithm.
 * This considers ALL board-type pieces together (field, picture frame, breaker,
 * fascia, infill) and packs them into stock lengths to minimise waste.
 * Offcuts from longer field boards can be reused for shorter fascia/infill pieces.
 */
export function calculateOptimisedCutPlan(inputs: SubfloorInputs): CuttingResult {
  const layout: BoardLayoutInputs = inputs.boardLayout || DEFAULT_BOARD_LAYOUT;
  const { boardWidth, boardGap, boardLength, boardDirection, staggerPattern, pictureFrame, breakerBoard, breakerDirection, diagonalAngle } = layout;

  const coverPerRow = boardWidth + boardGap;

  // Determine deck dimensions for board laying direction
  let layLength: number;
  let layWidth: number;

  if (boardDirection === "parallel") {
    layLength = inputs.length;
    layWidth = inputs.width;
  } else if (boardDirection === "perpendicular") {
    layLength = inputs.width;
    layWidth = inputs.length;
  } else {
    const radians = ((diagonalAngle || 45) * Math.PI) / 180;
    layLength = Math.ceil(inputs.length / Math.cos(radians));
    layWidth = Math.ceil(inputs.width / Math.cos(radians));
  }

  // Account for picture frame
  let fieldLength = layLength;
  let fieldWidth = layWidth;

  if (pictureFrame === "single") {
    fieldLength -= 2 * boardWidth;
    fieldWidth -= 2 * boardWidth;
  } else if (pictureFrame === "double") {
    fieldLength -= 4 * boardWidth;
    fieldWidth -= 4 * boardWidth;
  }
  fieldLength = Math.max(fieldLength, 0);
  fieldWidth = Math.max(fieldWidth, 0);

  const numRows = Math.max(1, Math.ceil(fieldWidth / coverPerRow));

  // Build cut pieces list
  const pieces: CutPiece[] = [];

  // Field boards: determine actual cut lengths per row based on stagger
  const cutLengthCounts = new Map<number, number>();
  for (let i = 0; i < numRows; i++) {
    let staggerOffset = 0;
    if (staggerPattern === "equal") {
      staggerOffset = (i % 2 === 0) ? 0 : Math.round(boardLength / 2);
    } else if (staggerPattern === "third") {
      staggerOffset = (i % 3) * Math.round(boardLength / 3);
    } else if (staggerPattern === "quarter") {
      staggerOffset = (i % 4) * Math.round(boardLength / 4);
    } else {
      staggerOffset = Math.round(((i * 1.618) % 1) * boardLength * 0.6);
    }

    let xPos = -staggerOffset;
    while (xPos < fieldLength) {
      let cutLen: number;
      if (xPos < 0) {
        cutLen = Math.min(boardLength + xPos, fieldLength);
        xPos = 0;
      } else if (fieldLength - xPos <= boardLength) {
        cutLen = fieldLength - xPos;
      } else {
        cutLen = boardLength;
      }
      if (cutLen <= 0) break;
      cutLen = Math.round(cutLen);
      cutLengthCounts.set(cutLen, (cutLengthCounts.get(cutLen) || 0) + 1);
      xPos += cutLen;
    }
  }

  // Convert to CutPiece entries
  let idx = 0;
  for (const [len, qty] of Array.from(cutLengthCounts.entries())) {
    idx++;
    pieces.push({
      id: `field_${idx}`,
      component: "deck-field",
      length: len,
      qty,
      materialKey: "board",
      label: `Field board ${len}mm`,
    });
  }

  // Picture frame pieces
  if (pictureFrame !== "none") {
    const pfMultiplier = pictureFrame === "double" ? 2 : 1;
    // 2 long sides + 2 short sides
    pieces.push({
      id: "pf_long",
      component: "picture-frame",
      length: layLength,
      qty: 2 * pfMultiplier,
      materialKey: "board",
      label: `PF long ${layLength}mm`,
    });
    pieces.push({
      id: "pf_short",
      component: "picture-frame",
      length: layWidth,
      qty: 2 * pfMultiplier,
      materialKey: "board",
      label: `PF short ${layWidth}mm`,
    });
  }

  // Breaker board pieces — direction-aware
  if (breakerBoard !== "none") {
    const bbMultiplier = breakerBoard === "double" ? 2 : 1;
    const breakerSpan = (breakerDirection || "along-width") === "along-width" ? inputs.width : inputs.length;
    pieces.push({
      id: "breaker",
      component: "breaker",
      length: breakerSpan,
      qty: Math.ceil(breakerSpan / boardLength) * bbMultiplier,
      materialKey: "board",
      label: `Breaker ${breakerSpan}mm`,
    });
  }

  // Fascia pieces
  if (layout.fascia && layout.fascia !== "none") {
    const fasciaHeight = layout.fasciaHeightMm || 150;
    const fasciaRows = Math.max(1, Math.ceil(fasciaHeight / boardWidth));
    // 2 long sides + 2 short sides, each row
    pieces.push({
      id: "fascia_long",
      component: "fascia",
      length: inputs.length,
      qty: 2 * fasciaRows,
      materialKey: "board",
      label: `Fascia long ${inputs.length}mm`,
    });
    pieces.push({
      id: "fascia_short",
      component: "fascia",
      length: inputs.width,
      qty: 2 * fasciaRows,
      materialKey: "board",
      label: `Fascia short ${inputs.width}mm`,
    });
  }

  // Infill pieces
  if (layout.infill && layout.infill !== "none" && (layout.infill === "matching" || layout.infill === "vertical-slats" || layout.infill === "horizontal-slats")) {
    const deckHeight = inputs.maxHeight || 400;
    const perimeterMm = 2 * inputs.length + 2 * inputs.width;
    if (layout.infill === "horizontal-slats" || layout.infill === "matching") {
      const infillRows = Math.max(1, Math.ceil(deckHeight / (boardWidth + (layout.boardGap || 5.5))));
      pieces.push({
        id: "infill_long",
        component: "infill",
        length: inputs.length,
        qty: 2 * infillRows,
        materialKey: "board",
        label: `Infill long ${inputs.length}mm`,
      });
      pieces.push({
        id: "infill_short",
        component: "infill",
        length: inputs.width,
        qty: 2 * infillRows,
        materialKey: "board",
        label: `Infill short ${inputs.width}mm`,
      });
    } else {
      // Vertical slats: short pieces at ~100mm centres around perimeter
      const slatCount = Math.ceil(perimeterMm / 100);
      pieces.push({
        id: "infill_slats",
        component: "infill",
        length: deckHeight,
        qty: slatCount,
        materialKey: "board",
        label: `Infill slat ${deckHeight}mm`,
      });
    }
  }

  // Stock definition for boards
  const stocks: StockDefinition[] = [
    { materialKey: "board", stockLength: boardLength, label: `Board ${boardLength}mm` },
  ];

  return optimiseCutting(pieces, stocks);
}

// ─── Framing Stock Lengths ────────────────────────────────────────────────────
// Standard stock lengths for aluminium/steel framing extrusions (mm)
const FRAMING_STOCK_LENGTHS: Record<string, number> = {
  spanmor: 6500,    // Spanmor aluminium extrusions come in 6.5m lengths
  clickdeck: 6500,  // ClickDeck modular aluminium in 6.5m lengths
  sfs01: 6000,      // SFS01 steel framing in 6.0m lengths
};

// Post stock length (aluminium posts typically 6.5m)
const POST_STOCK_LENGTH = 6500; // mm

/**
 * Calculate individual post heights using linear interpolation between
 * minHeight and maxHeight based on Y position (for sloping sites).
 * For flat sites (minHeight === maxHeight), all posts are the same height.
 * Adds bearer depth + joist depth to get full post length (post supports bearer which supports joist).
 */
function getPostHeights(
  option: OptionResult,
  inputs: SubfloorInputs
): { label: string; length: number }[] {
  const { minHeight, maxHeight } = inputs;
  const bearerDepth = option.profile.depth;
  const joistDepth = option.profile.depth; // joists use same profile

  const posts: { label: string; length: number }[] = [];

  for (const bl of option.bearerLines) {
    for (const post of bl.posts) {
      // Interpolate height based on Y position (0 = minHeight edge, width = maxHeight edge)
      const fraction = inputs.width > 0 ? post.y / inputs.width : 0;
      const groundToUnderside = Math.round(minHeight + fraction * (maxHeight - minHeight));
      // Post length = ground to underside of bearer (post sits under bearer)
      // The post supports the bearer, so post length = clearance height
      // Bearer and joist sit on top of the post
      const postLength = Math.max(groundToUnderside, 50); // minimum 50mm stub
      posts.push({ label: post.label, length: postLength });
    }
  }

  return posts;
}

/**
 * Calculate optimised framing cut plan for posts, joists, and bearers.
 * Uses the cutting optimiser to minimise stock waste by packing multiple
 * pieces from the same stock length.
 *
 * @param option - The selected framing option (A or B) from SubfloorResult
 * @param inputs - The SubfloorInputs with deck dimensions and heights
 * @returns CuttingResult with optimised cut assignments for all framing members
 */
export function calculateFramingCutPlan(
  option: OptionResult,
  inputs: SubfloorInputs
): CuttingResult {
  const system = inputs.framingSystem || "spanmor";
  const framingStockLength = FRAMING_STOCK_LENGTHS[system] || 6500;

  const pieces: CutPiece[] = [];

  // ─── Posts ──────────────────────────────────────────────────────────────
  const postHeights = getPostHeights(option, inputs);

  // Group posts by length for efficient packing
  const postLengthCounts = new Map<number, number>();
  for (const p of postHeights) {
    postLengthCounts.set(p.length, (postLengthCounts.get(p.length) || 0) + 1);
  }

  let postIdx = 0;
  for (const [len, qty] of Array.from(postLengthCounts.entries())) {
    postIdx++;
    pieces.push({
      id: `post_${postIdx}`,
      component: "post",
      length: len,
      qty,
      materialKey: "post",
      label: `Post ${len}mm`,
    });
  }

  // ─── Joists ─────────────────────────────────────────────────────────────
  // All joists are the same length in a rectangular deck
  if (option.sections && option.sections.length > 0) {
    // L-shape or U-shape: different joist lengths per section
    option.sections.forEach((sec, i) => {
      pieces.push({
        id: `joist_s${i + 1}`,
        component: "joist",
        length: sec.joistLength,
        qty: sec.joistCount,
        materialKey: "joist",
        label: `Joist ${sec.joistLength}mm (${sec.label})`,
      });
    });
  } else {
    pieces.push({
      id: "joist_main",
      component: "joist",
      length: option.joistLength,
      qty: option.joistCount,
      materialKey: "joist",
      label: `Joist ${option.joistLength}mm`,
    });
  }

  // ─── Bearers ────────────────────────────────────────────────────────────
  // All bearers are the same length in a rectangular deck (= deck length)
  if (option.sections && option.sections.length > 0) {
    // L-shape or U-shape: different bearer lengths per section
    option.sections.forEach((sec, i) => {
      pieces.push({
        id: `bearer_s${i + 1}`,
        component: "bearer",
        length: sec.bearerLength,
        qty: sec.bearerCount,
        materialKey: "bearer",
        label: `Bearer ${sec.bearerLength}mm (${sec.label})`,
      });
    });
  } else {
    pieces.push({
      id: "bearer_main",
      component: "bearer",
      length: option.bearerLength,
      qty: option.bearerCount,
      materialKey: "bearer",
      label: `Bearer ${option.bearerLength}mm`,
    });
  }

  // ─── Stock Definitions ──────────────────────────────────────────────────
  const stocks: StockDefinition[] = [
    { materialKey: "post", stockLength: POST_STOCK_LENGTH, label: `Post ${POST_STOCK_LENGTH}mm` },
    { materialKey: "joist", stockLength: framingStockLength, label: `Joist ${framingStockLength}mm` },
    { materialKey: "bearer", stockLength: framingStockLength, label: `Bearer ${framingStockLength}mm` },
  ];

  return optimiseCutting(pieces, stocks);
}
