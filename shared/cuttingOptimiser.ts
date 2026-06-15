/**
 * Linear Cutting Stock Optimiser
 * First-Fit-Decreasing bin-packing with cross-component offcut reuse.
 *
 * Takes a list of required cut pieces (from any component: deck boards, posts,
 * beams, bearers, stair treads, fascia, infill) and packs them into stock
 * lengths to minimise waste.
 *
 * Key features:
 *  - Groups pieces by material/stock length
 *  - Sorts pieces descending (FFD heuristic)
 *  - Tracks usable offcuts across components
 *  - Accounts for blade kerf per cut
 *  - Reports waste, utilisation, and cut patterns per stock piece
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export interface CutPiece {
  /** Unique identifier for this piece requirement */
  id: string;
  /** Component category (e.g. "deck-field", "stair-tread", "fascia", "post", "bearer") */
  component: string;
  /** Required cut length in mm */
  length: number;
  /** Quantity of this piece needed */
  qty: number;
  /** Material group key — pieces with same materialKey can share stock */
  materialKey: string;
  /** Description for display */
  label: string;
}

export interface StockDefinition {
  /** Material group key — matches CutPiece.materialKey */
  materialKey: string;
  /** Stock length in mm */
  stockLength: number;
  /** Display label (e.g. "Composite Board 5400mm") */
  label: string;
  /** Cost per stock piece (optional, for costing) */
  costPerPiece?: number;
}

export interface CutAssignment {
  /** Which piece this cut satisfies */
  pieceId: string;
  /** Component category */
  component: string;
  /** Cut length (mm) */
  cutLength: number;
  /** Label */
  label: string;
}

export interface StockPiece {
  /** Index of this stock piece (1-based) */
  index: number;
  /** Material key */
  materialKey: string;
  /** Stock length (mm) */
  stockLength: number;
  /** Cuts made from this stock piece */
  cuts: CutAssignment[];
  /** Total material used (mm) including kerf */
  usedLength: number;
  /** Remaining offcut (mm) */
  offcut: number;
  /** Whether the offcut is usable (above minimum threshold) */
  offcutUsable: boolean;
  /** Utilisation percentage */
  utilisation: number;
}

export interface CuttingResult {
  /** All stock pieces with their cut assignments */
  stockPieces: StockPiece[];
  /** Summary per material group */
  materialSummaries: MaterialSummary[];
  /** Overall statistics */
  totals: CuttingTotals;
}

export interface MaterialSummary {
  materialKey: string;
  label: string;
  stockLength: number;
  stockCount: number;
  totalCutsLength: number;
  totalWaste: number;
  wastePercent: number;
  usableOffcuts: number;
  usableOffcutLength: number;
  costPerPiece?: number;
  totalCost?: number;
}

export interface CuttingTotals {
  totalStockPieces: number;
  totalCutsLength: number;
  totalStockLength: number;
  totalWaste: number;
  overallWastePercent: number;
  usableOffcutCount: number;
  usableOffcutLength: number;
}

export interface CuttingOptions {
  /** Blade kerf width in mm (material lost per cut). Default: 3 */
  kerfMm?: number;
  /** Minimum offcut length to be considered "usable" (mm). Default: 200 */
  minUsableOffcut?: number;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const DEFAULT_KERF = 3; // mm
const DEFAULT_MIN_USABLE_OFFCUT = 200; // mm

// ─── Algorithm ──────────────────────────────────────────────────────────────

/**
 * Optimise cutting of required pieces from stock lengths.
 * Uses First-Fit-Decreasing (FFD) bin-packing heuristic with cross-component
 * offcut reuse within the same material group.
 */
export function optimiseCutting(
  pieces: CutPiece[],
  stocks: StockDefinition[],
  options?: CuttingOptions
): CuttingResult {
  const kerf = options?.kerfMm ?? DEFAULT_KERF;
  const minUsable = options?.minUsableOffcut ?? DEFAULT_MIN_USABLE_OFFCUT;

  // Build a flat list of all individual cuts needed, grouped by material
  const allCuts: Array<{ pieceId: string; component: string; length: number; label: string; materialKey: string }> = [];

  for (const piece of pieces) {
    for (let i = 0; i < piece.qty; i++) {
      allCuts.push({
        pieceId: `${piece.id}_${i + 1}`,
        component: piece.component,
        length: piece.length,
        label: piece.label,
        materialKey: piece.materialKey,
      });
    }
  }

  // Group cuts by material
  const byMaterial = new Map<string, typeof allCuts>();
  for (const cut of allCuts) {
    const group = byMaterial.get(cut.materialKey) || [];
    group.push(cut);
    byMaterial.set(cut.materialKey, group);
  }
  // Build stock lookup
  const stockMap = new Map<string, StockDefinition>();
  for (const s of stocks) {
    stockMap.set(s.materialKey, s);
  }

  const allStockPieces: StockPiece[] = [];
  const materialSummaries: MaterialSummary[] = [];
  let globalIndex = 0;

  // Process each material group
  for (const [materialKey, cuts] of Array.from(byMaterial.entries())) {
    const stock = stockMap.get(materialKey);
    if (!stock) continue; // skip if no stock definition

    // Sort cuts descending (FFD)
    cuts.sort((a: typeof allCuts[number], b: typeof allCuts[number]) => b.length - a.length);

    // Bins: each bin represents one stock piece
    const bins: Array<{ remaining: number; cuts: CutAssignment[]; usedLength: number }> = [];

    for (const cut of cuts) {
      const cutWithKerf = cut.length + kerf; // account for blade kerf
      let placed = false;

      // First-fit: try to place in existing bin
      for (const bin of bins) {
        if (bin.remaining >= cutWithKerf) {
          bin.cuts.push({
            pieceId: cut.pieceId,
            component: cut.component,
            cutLength: cut.length,
            label: cut.label,
          });
          bin.remaining -= cutWithKerf;
          bin.usedLength += cutWithKerf;
          placed = true;
          break;
        }
        // Also check if it fits without kerf (last piece in bin doesn't need trailing kerf)
        if (bin.remaining >= cut.length && bin.remaining < cutWithKerf) {
          bin.cuts.push({
            pieceId: cut.pieceId,
            component: cut.component,
            cutLength: cut.length,
            label: cut.label,
          });
          bin.remaining -= cut.length;
          bin.usedLength += cut.length;
          placed = true;
          break;
        }
      }

      // If not placed, open a new bin
      if (!placed) {
        bins.push({
          remaining: stock.stockLength - cutWithKerf,
          cuts: [{
            pieceId: cut.pieceId,
            component: cut.component,
            cutLength: cut.length,
            label: cut.label,
          }],
          usedLength: cutWithKerf,
        });
      }
    }

    // Convert bins to StockPiece results
    let totalCutsLength = 0;
    let totalWaste = 0;
    let usableOffcuts = 0;
    let usableOffcutLength = 0;

    for (const bin of bins) {
      globalIndex++;
      const offcut = bin.remaining;
      const offcutUsable = offcut >= minUsable;
      const actualUsed = stock.stockLength - offcut;
      const cutsOnlyLength = bin.cuts.reduce((sum, c) => sum + c.cutLength, 0);

      totalCutsLength += cutsOnlyLength;
      totalWaste += offcut;
      if (offcutUsable) {
        usableOffcuts++;
        usableOffcutLength += offcut;
      }

      allStockPieces.push({
        index: globalIndex,
        materialKey,
        stockLength: stock.stockLength,
        cuts: bin.cuts,
        usedLength: actualUsed,
        offcut,
        offcutUsable,
        utilisation: (cutsOnlyLength / stock.stockLength) * 100,
      });
    }

    const totalStockLength = bins.length * stock.stockLength;
    materialSummaries.push({
      materialKey,
      label: stock.label,
      stockLength: stock.stockLength,
      stockCount: bins.length,
      totalCutsLength,
      totalWaste,
      wastePercent: totalStockLength > 0 ? (totalWaste / totalStockLength) * 100 : 0,
      usableOffcuts,
      usableOffcutLength,
      costPerPiece: stock.costPerPiece,
      totalCost: stock.costPerPiece ? stock.costPerPiece * bins.length : undefined,
    });
  }

  // Calculate totals
  const totalStockPieces = allStockPieces.length;
  const totalCutsLength = materialSummaries.reduce((s, m) => s + m.totalCutsLength, 0);
  const totalStockLength = materialSummaries.reduce((s, m) => s + m.stockCount * m.stockLength, 0);
  const totalWaste = materialSummaries.reduce((s, m) => s + m.totalWaste, 0);
  const usableOffcutCount = materialSummaries.reduce((s, m) => s + m.usableOffcuts, 0);
  const usableOffcutLength = materialSummaries.reduce((s, m) => s + m.usableOffcutLength, 0);

  return {
    stockPieces: allStockPieces,
    materialSummaries,
    totals: {
      totalStockPieces,
      totalCutsLength,
      totalStockLength,
      totalWaste,
      overallWastePercent: totalStockLength > 0 ? (totalWaste / totalStockLength) * 100 : 0,
      usableOffcutCount,
      usableOffcutLength,
    },
  };
}

// ─── Helper: Build cut pieces from deck data ────────────────────────────────

/**
 * Build CutPiece list from a deck's board cut plan data.
 * Combines field boards, picture frame, breaker, fascia, infill, and stair treads
 * into a unified cut list for optimisation.
 */
export interface DeckCuttingInputs {
  /** Field board cut lengths needed (mm) with quantities */
  fieldBoards: Array<{ length: number; qty: number }>;
  /** Picture frame pieces (mm) with quantities */
  pictureFramePieces?: Array<{ length: number; qty: number }>;
  /** Breaker board pieces (mm) with quantities */
  breakerPieces?: Array<{ length: number; qty: number }>;
  /** Fascia pieces (mm) with quantities */
  fasciaPieces?: Array<{ length: number; qty: number }>;
  /** Infill pieces (mm) with quantities */
  infillPieces?: Array<{ length: number; qty: number }>;
  /** Stair tread pieces (mm) with quantities */
  stairTreads?: Array<{ length: number; qty: number }>;
  /** Post lengths (mm) with quantities */
  posts?: Array<{ length: number; qty: number }>;
  /** Bearer lengths (mm) with quantities */
  bearers?: Array<{ length: number; qty: number }>;
  /** Beam/joist lengths (mm) with quantities */
  joists?: Array<{ length: number; qty: number }>;
  /** Stock definitions per material */
  stockDefinitions: StockDefinition[];
}

/**
 * Convert deck cutting inputs into the generic CutPiece format
 * and run the optimiser.
 */
export function optimiseDeckCutting(
  inputs: DeckCuttingInputs,
  options?: CuttingOptions
): CuttingResult {
  const pieces: CutPiece[] = [];
  let idx = 0;

  const addPieces = (
    items: Array<{ length: number; qty: number }> | undefined,
    component: string,
    materialKey: string,
    labelPrefix: string
  ) => {
    if (!items) return;
    for (const item of items) {
      idx++;
      pieces.push({
        id: `${component}_${idx}`,
        component,
        length: item.length,
        qty: item.qty,
        materialKey,
        label: `${labelPrefix} ${item.length}mm`,
      });
    }
  };

  // Board-type materials (all share the same board stock)
  const boardMaterial = "board";
  addPieces(inputs.fieldBoards, "deck-field", boardMaterial, "Field board");
  addPieces(inputs.pictureFramePieces, "picture-frame", boardMaterial, "Picture frame");
  addPieces(inputs.breakerPieces, "breaker", boardMaterial, "Breaker board");
  addPieces(inputs.fasciaPieces, "fascia", boardMaterial, "Fascia");
  addPieces(inputs.infillPieces, "infill", boardMaterial, "Infill");
  addPieces(inputs.stairTreads, "stair-tread", boardMaterial, "Stair tread");

  // Structural materials (separate stock lengths)
  addPieces(inputs.posts, "post", "post", "Post");
  addPieces(inputs.bearers, "bearer", "bearer", "Bearer");
  addPieces(inputs.joists, "joist", "joist", "Joist");

  return optimiseCutting(pieces, inputs.stockDefinitions, options);
}

// ─── Helper: Format summary for display ─────────────────────────────────────

export function formatCuttingSummary(result: CuttingResult): string {
  const parts: string[] = [];
  for (const mat of result.materialSummaries) {
    parts.push(
      `${mat.label}: ${mat.stockCount} pcs × ${mat.stockLength}mm = ${(mat.stockCount * mat.stockLength / 1000).toFixed(1)} LM (${mat.wastePercent.toFixed(1)}% waste)`
    );
  }
  parts.push(
    `Overall: ${result.totals.totalStockPieces} stock pieces, ${result.totals.overallWastePercent.toFixed(1)}% waste, ${result.totals.usableOffcutCount} usable offcuts (${(result.totals.usableOffcutLength / 1000).toFixed(1)} LM)`
  );
  return parts.join("\n");
}
