/**
 * Per-side polygon inset algorithm.
 *
 * Given a polygon (as SVG points or [x,y] tuples) and per-side setback distances,
 * this module classifies each edge as front/rear/left/right based on its outward
 * normal direction, offsets each edge inward by the appropriate distance, and
 * computes the intersection of adjacent offset edges to produce the inset polygon.
 *
 * Edge classification uses the outward-facing normal of each edge:
 * - Front: normal points downward (positive Y in screen coords = toward viewer/street)
 * - Rear: normal points upward (negative Y)
 * - Left: normal points left (negative X)
 * - Right: normal points right (positive X)
 *
 * For edges at 45° angles, the dominant component determines the classification.
 */

export interface Point2D {
  x: number;
  y: number;
}

export interface PerSideSetbacks {
  /** Front setback in the same unit as the polygon coordinates (pixels or metres) */
  front: number;
  /** Rear setback */
  rear: number;
  /** Left setback */
  left: number;
  /** Right setback */
  right: number;
}

/**
 * Classify an edge's outward normal into front/rear/left/right.
 * The outward normal for a clockwise polygon edge from p1→p2 is (dy, -dx) normalized.
 * For counter-clockwise, it's (-dy, dx).
 *
 * We detect winding order first, then classify.
 */
function classifyEdge(
  normalX: number,
  normalY: number
): "front" | "rear" | "left" | "right" {
  // In screen coordinates: +Y is down (front/street), -Y is up (rear)
  // +X is right, -X is left
  const absX = Math.abs(normalX);
  const absY = Math.abs(normalY);

  if (absY >= absX) {
    // Primarily vertical normal
    return normalY > 0 ? "front" : "rear";
  } else {
    // Primarily horizontal normal
    return normalX > 0 ? "right" : "left";
  }
}

/**
 * Compute the signed area of a polygon (positive = counter-clockwise in math coords,
 * but in screen coords where Y is flipped, positive = clockwise).
 */
function signedArea(pts: Point2D[]): number {
  let area = 0;
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length;
    area += pts[i].x * pts[j].y - pts[j].x * pts[i].y;
  }
  return area / 2;
}

/**
 * Compute the intersection of two lines, each defined by a point and direction.
 * Returns null if lines are parallel.
 */
function lineIntersection(
  p1: Point2D,
  d1: Point2D,
  p2: Point2D,
  d2: Point2D
): Point2D | null {
  const cross = d1.x * d2.y - d1.y * d2.x;
  if (Math.abs(cross) < 1e-10) return null; // parallel

  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const t = (dx * d2.y - dy * d2.x) / cross;

  return {
    x: p1.x + t * d1.x,
    y: p1.y + t * d1.y,
  };
}

/**
 * Compute a per-side inset polygon from an arbitrary boundary polygon.
 *
 * @param points - The boundary polygon vertices (in screen coordinates)
 * @param setbacks - Per-side setback distances in the same unit as the polygon
 * @returns The inset polygon vertices, or null if the polygon is too small
 */
export function computePerSideInset(
  points: Point2D[],
  setbacks: PerSideSetbacks
): Point2D[] | null {
  if (points.length < 3) return null;

  // Ensure we don't have a repeated closing point
  const last = points[points.length - 1];
  const first = points[0];
  let pts = points;
  if (Math.abs(last.x - first.x) < 0.01 && Math.abs(last.y - first.y) < 0.01) {
    pts = points.slice(0, -1);
  }
  if (pts.length < 3) return null;

  // Determine winding order (in screen coords, positive area = clockwise)
  const area = signedArea(pts);
  if (Math.abs(area) < 1) return null; // degenerate polygon

  // For clockwise polygon in screen coords, outward normal of edge p1→p2 is (dy, -dx)
  // For counter-clockwise, it's (-dy, dx)
  const isCW = area > 0;

  // For each edge, compute:
  // 1. The outward normal direction
  // 2. Classify as front/rear/left/right
  // 3. The inset distance for that classification
  // 4. The offset edge (shifted inward by inset distance)
  const n = pts.length;
  const offsetEdges: { point: Point2D; dir: Point2D }[] = [];

  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const dx = pts[j].x - pts[i].x;
    const dy = pts[j].y - pts[i].y;
    const len = Math.hypot(dx, dy);
    if (len < 0.01) {
      // Degenerate edge, use previous edge's offset
      offsetEdges.push(offsetEdges.length > 0 ? offsetEdges[offsetEdges.length - 1] : { point: pts[i], dir: { x: 1, y: 0 } });
      continue;
    }

    // Outward normal (perpendicular to edge, pointing outward)
    let nx: number, ny: number;
    if (isCW) {
      // CW: outward normal is (dy, -dx) / len
      nx = dy / len;
      ny = -dx / len;
    } else {
      // CCW: outward normal is (-dy, dx) / len
      nx = -dy / len;
      ny = dx / len;
    }

    // Classify this edge
    const side = classifyEdge(nx, ny);

    // Get inset distance for this side
    const insetDist = setbacks[side] || 0;

    // Inward normal is opposite of outward normal
    const inwardX = -nx;
    const inwardY = -ny;

    // Offset the edge inward: shift both endpoints by insetDist along inward normal
    const offsetPoint: Point2D = {
      x: pts[i].x + inwardX * insetDist,
      y: pts[i].y + inwardY * insetDist,
    };
    const edgeDir: Point2D = { x: dx / len, y: dy / len };

    offsetEdges.push({ point: offsetPoint, dir: edgeDir });
  }

  // Compute intersection of adjacent offset edges to get inset polygon vertices
  const insetPoints: Point2D[] = [];
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const intersection = lineIntersection(
      offsetEdges[i].point,
      offsetEdges[i].dir,
      offsetEdges[j].point,
      offsetEdges[j].dir
    );

    if (intersection) {
      insetPoints.push(intersection);
    } else {
      // Parallel edges - use the midpoint of the two offset edge endpoints
      insetPoints.push({
        x: (offsetEdges[i].point.x + offsetEdges[j].point.x) / 2,
        y: (offsetEdges[i].point.y + offsetEdges[j].point.y) / 2,
      });
    }
  }

  // Validate: check that inset polygon doesn't self-intersect badly
  // Simple check: ensure all inset points are "inside" the original polygon centroid region
  const cx = pts.reduce((s, p) => s + p.x, 0) / n;
  const cy = pts.reduce((s, p) => s + p.y, 0) / n;
  const origAvgDist = pts.reduce((s, p) => s + Math.hypot(p.x - cx, p.y - cy), 0) / n;
  const insetAvgDist = insetPoints.reduce((s, p) => s + Math.hypot(p.x - cx, p.y - cy), 0) / insetPoints.length;

  // If inset polygon is larger than original or too small, it's invalid
  if (insetAvgDist > origAvgDist * 1.1 || insetAvgDist < origAvgDist * 0.05) {
    return null;
  }

  return insetPoints;
}

/**
 * Convert per-side setbacks from metres to pixels using a scale factor.
 */
export function setbacksToPixels(
  setbacksMm: { front: number; rear: number; left: number; right: number },
  pixelsPerMeter: number
): PerSideSetbacks {
  return {
    front: (setbacksMm.front / 1000) * pixelsPerMeter,
    rear: (setbacksMm.rear / 1000) * pixelsPerMeter,
    left: (setbacksMm.left / 1000) * pixelsPerMeter,
    right: (setbacksMm.right / 1000) * pixelsPerMeter,
  };
}
