/**
 * Raked Geometry Utility — Angle Cutting Calculations for Spec Sheet
 *
 * Computes diagonal cut lengths, cut angles, and tapered panel dimensions
 * for patio/structure roofs with angle-cut edges.
 *
 * Pricing rule:
 *   - Roof sheets are costed at FULL rectangle width (no reduction for the raked triangle)
 *   - Angle cutting is charged per lineal metre (LM) of the diagonal cut line
 *
 * Structure layout (plan view):
 *
 *       A ─────────────── B      ← House wall (width)
 *       │                 │
 *  D-A  │                 │  B-C  ← Projection sides (length/projection)
 *       │                 │
 *       D ─────────────── C      ← Post line (width)
 *
 * Edge naming:
 *   A-B = top/house wall edge (runs along width)
 *   B-C = right edge (runs along projection)
 *   C-D = bottom/post line edge (runs along width)
 *   D-A = left edge (runs along projection)
 *
 * When an edge is "angle cut", the roof sheet is cut diagonally across that edge.
 * The cut line is the hypotenuse of a right triangle where:
 *   - One leg is the edge length (width or projection)
 *   - The other leg is the "rake offset" — how much one end is trimmed back
 *
 * For simplicity, the rake offset defaults to the full adjacent dimension
 * (i.e., a full diagonal from corner to corner), but can be user-specified.
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export type RakedEdge = "A-B" | "B-C" | "C-D" | "D-A";

export interface RakedEdgeResult {
  edge: RakedEdge;
  /** Length of the edge being cut (mm) — width for A-B/C-D, projection for B-C/D-A */
  edgeLengthMm: number;
  /** Rake offset — how far the cut trims back at one end (mm) */
  rakeOffsetMm: number;
  /** Diagonal cut length = hypotenuse of (edgeLength, rakeOffset) in mm */
  cutLengthMm: number;
  /** Cut angle in degrees from the edge (atan(rakeOffset / edgeLength)) */
  cutAngleDeg: number;
  /** Tapered panel lengths: shortest and longest panel at each end of the cut */
  shortestPanelMm: number;
  longestPanelMm: number;
}

export interface RakedGeometryInput {
  /** Structure width in mm (A-B and C-D edge length) */
  widthMm: number;
  /** Structure projection in mm (B-C and D-A edge length) */
  projectionMm: number;
  /** Which edges are angle-cut */
  rakedEdges: RakedEdge[];
  /**
   * Per-edge rake offset overrides (mm).
   * If not provided for an edge, defaults to the adjacent dimension
   * (full corner-to-corner diagonal).
   */
  rakeOffsets?: Partial<Record<RakedEdge, number>>;
  /** Roof pitch angle in degrees (used for tapered panel length calculation) */
  pitchDeg?: number;
}

export interface RakedGeometryResult {
  edges: RakedEdgeResult[];
  /** Total angle cutting lineal metres (sum of all diagonal cut lengths) */
  totalCutLengthMm: number;
  totalCutLengthM: number;
  /** Total edge lengths of selected sides (for reference) */
  totalEdgeLengthMm: number;
  totalEdgeLengthM: number;
}

// ─── Core Calculation ────────────────────────────────────────────────────────

/**
 * Get the straight edge length for a given edge.
 */
function getEdgeLength(edge: RakedEdge, widthMm: number, projectionMm: number): number {
  switch (edge) {
    case "A-B":
    case "C-D":
      return widthMm;
    case "B-C":
    case "D-A":
      return projectionMm;
  }
}

/**
 * Get the default rake offset for an edge (the adjacent dimension).
 * For width edges (A-B, C-D), the offset is along the projection direction.
 * For projection edges (B-C, D-A), the offset is along the width direction.
 */
function getDefaultRakeOffset(edge: RakedEdge, widthMm: number, projectionMm: number): number {
  switch (edge) {
    case "A-B":
    case "C-D":
      return projectionMm;
    case "B-C":
    case "D-A":
      return widthMm;
  }
}

/**
 * Calculate the diagonal cut length (hypotenuse) given the edge length and rake offset.
 * cutLength = √(edgeLength² + rakeOffset²)
 */
export function calculateDiagonalCutLength(edgeLengthMm: number, rakeOffsetMm: number): number {
  return Math.sqrt(edgeLengthMm * edgeLengthMm + rakeOffsetMm * rakeOffsetMm);
}

/**
 * Calculate the cut angle in degrees from the edge.
 * angle = atan(rakeOffset / edgeLength)
 */
export function calculateCutAngle(edgeLengthMm: number, rakeOffsetMm: number): number {
  if (edgeLengthMm <= 0) return 0;
  return Math.atan(rakeOffsetMm / edgeLengthMm) * (180 / Math.PI);
}

/**
 * Calculate tapered panel lengths for a raked edge.
 * The panels run perpendicular to the cut edge.
 * - For width edges (A-B, C-D): panels run along the projection
 *   → longest panel = full projection, shortest = projection - rakeOffset
 * - For projection edges (B-C, D-A): panels run along the width
 *   → longest panel = full width, shortest = width - rakeOffset
 *
 * Note: Pricing rule says sheets are costed at full rectangle width regardless.
 */
function calculateTaperedPanels(
  edge: RakedEdge,
  widthMm: number,
  projectionMm: number,
  rakeOffsetMm: number
): { shortest: number; longest: number } {
  switch (edge) {
    case "A-B":
    case "C-D":
      // Panels run along projection; cut reduces one end
      return {
        longest: projectionMm,
        shortest: Math.max(0, projectionMm - rakeOffsetMm),
      };
    case "B-C":
    case "D-A":
      // Panels run along width; cut reduces one end
      return {
        longest: widthMm,
        shortest: Math.max(0, widthMm - rakeOffsetMm),
      };
  }
}

/**
 * Main calculation: compute raked geometry for all selected edges.
 */
export function calculateRakedGeometry(input: RakedGeometryInput): RakedGeometryResult {
  const { widthMm, projectionMm, rakedEdges, rakeOffsets = {} } = input;

  if (widthMm <= 0 || projectionMm <= 0 || rakedEdges.length === 0) {
    return {
      edges: [],
      totalCutLengthMm: 0,
      totalCutLengthM: 0,
      totalEdgeLengthMm: 0,
      totalEdgeLengthM: 0,
    };
  }

  const edges: RakedEdgeResult[] = rakedEdges.map((edge) => {
    const edgeLengthMm = getEdgeLength(edge, widthMm, projectionMm);
    const rakeOffsetMm = rakeOffsets[edge] ?? getDefaultRakeOffset(edge, widthMm, projectionMm);
    const cutLengthMm = calculateDiagonalCutLength(edgeLengthMm, rakeOffsetMm);
    const cutAngleDeg = calculateCutAngle(edgeLengthMm, rakeOffsetMm);
    const panels = calculateTaperedPanels(edge, widthMm, projectionMm, rakeOffsetMm);

    return {
      edge,
      edgeLengthMm,
      rakeOffsetMm,
      cutLengthMm: Math.round(cutLengthMm),
      cutAngleDeg: Math.round(cutAngleDeg * 10) / 10,
      shortestPanelMm: Math.round(panels.shortest),
      longestPanelMm: Math.round(panels.longest),
    };
  });

  const totalCutLengthMm = edges.reduce((sum, e) => sum + e.cutLengthMm, 0);
  const totalEdgeLengthMm = edges.reduce((sum, e) => sum + e.edgeLengthMm, 0);

  return {
    edges,
    totalCutLengthMm,
    totalCutLengthM: Math.round((totalCutLengthMm / 1000) * 100) / 100,
    totalEdgeLengthMm,
    totalEdgeLengthM: Math.round((totalEdgeLengthMm / 1000) * 100) / 100,
  };
}

/**
 * Helper: given the structure dimensions and selected edges, compute
 * the total angle cutting LM for pricing (the diagonal cut length sum).
 * This is what gets charged per LM.
 */
export function getAngleCuttingMetres(
  widthMm: number,
  projectionMm: number,
  rakedEdges: RakedEdge[],
  rakeOffsets?: Partial<Record<RakedEdge, number>>
): number {
  const result = calculateRakedGeometry({
    widthMm,
    projectionMm,
    rakedEdges,
    rakeOffsets,
  });
  return result.totalCutLengthM;
}
