import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Info, CheckCircle2, AlertTriangle, XCircle } from "lucide-react";
import { useMemo } from "react";
import { validateBeamSize, type BeamValidationResult } from "../../../shared/beamSizeValidator";

/** Inline tooltip helper for parameter labels */
function ParamTip({ tip }: { tip: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Info className="h-3 w-3 text-slate-400 cursor-help shrink-0" />
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-[200px] text-xs">
        <p>{tip}</p>
      </TooltipContent>
    </Tooltip>
  );
}

interface SideElevationDiagramProps {
  /** Projection / length of the structure (mm) */
  projection: string;
  /** Beam height at the house wall connection (mm) — this is the underside-of-beam to FFL */
  beamHeight: string;
  /** Roof fall in degrees */
  roofFall: string;
  /** Roof type name */
  roofType: string;
  /** Post type/size */
  postSize: string;
  /** Beam size */
  beamSize: string;
  /** Gutter type */
  gutterType: string;
  /** Cut back eave (mm) */
  cutBackEave: string;
  /** House wall type */
  houseWallType: string;
  /** Connection type code (FLY, BCH, WFX, GBL, FSS, POP) */
  connectionType?: string;
  /** Job eave overhang in mm (from Roof section) — extends the roof past the post line */
  jobEave?: string;
  /** Wind category (N1-N4, C1-C4) for beam validation */
  windCat?: string;
  /** Beam span in mm (distance between posts along the beam) for validation */
  beamSpanMm?: number;
  /** Callbacks */
  onProjectionChange: (v: string) => void;
  onBeamHeightChange: (v: string) => void;
  onRoofFallChange: (v: string) => void;
  onPostSizeChange: (v: string) => void;
  onBeamSizeChange: (v: string) => void;
  onGutterTypeChange: (v: string) => void;
  onCutBackEaveChange: (v: string) => void;
  onHouseWallTypeChange: (v: string) => void;
  /** Callback fired when auto-suggest beam size is accepted — used to also update costing */
  onBeamSizeAutoSuggest?: (newSize: string) => void;
  /** Read-only mode */
  readOnly?: boolean;
}

/** Map connection code to a human-readable bracket label */
function connectionLabel(code?: string): string {
  switch (code) {
    case "FLY": return "Fly-over bracket";
    case "BCH": return "Fascia bracket";
    case "WFX": return "Wall fix bracket";
    case "GBL": return "Gable bracket";
    case "FSS": return "Free-standing (no bracket)";
    case "POP": return "Pop-up bracket";
    default: return "Bracket connection";
  }
}

/**
 * Interactive Side Elevation Diagram — True-Scale Rendering
 *
 * SVG Geometry Math (all to-scale):
 * ─────────────────────────────────────────────────────────────────────
 * Given:
 *   beamHeight (mm)   = height from FFL to underside of beam at house wall (high side)
 *   projection (mm)   = horizontal distance from house wall to post line
 *   pitch (°)         = roof fall angle in degrees
 *   jobEave (mm)      = eave overhang width beyond the post line
 *
 * Derived:
 *   pitchRad          = pitch × (π / 180)
 *   roofDrop          = projection × tan(pitchRad)
 *       → vertical drop of the beam/roof across the full projection
 *   eaveDrop          = jobEave × tan(pitchRad)
 *       → additional vertical drop from post line to end of eave overhang
 *   frontHeight       = beamHeight + eaveDrop
 *       → total height at the house wall from FFL to top of roof
 *       → (this accounts for the eave overhang extending the roof slope
 *          back above the wall plate)
 *   postHeight        = beamHeight - roofDrop
 *       → height of the post at the low (outer) end
 *   eaveEndHeight     = postHeight - eaveDrop
 *       → height at the very tip of the eave overhang (lowest point)
 *
 * Scale:
 *   A single uniform scale factor is used for both X and Y axes so that
 *   the diagram is drawn in true proportion. This ensures that a 3000mm
 *   projection looks proportionally correct relative to a 2700mm height.
 *
 *   totalWidthM  = (projection + jobEave) / 1000 + margin
 *   totalHeightM = (beamHeight + houseAboveEave) / 1000 + floorToGround
 *   scale = min(drawableWidth / totalWidthM, drawableHeight / totalHeightM)
 * ─────────────────────────────────────────────────────────────────────
 */
export default function SideElevationDiagram({
  projection,
  beamHeight,
  roofFall,
  roofType,
  postSize,
  beamSize,
  gutterType,
  cutBackEave,
  houseWallType,
  connectionType,
  jobEave,
  windCat,
  beamSpanMm,
  onProjectionChange,
  onBeamHeightChange,
  onRoofFallChange,
  onPostSizeChange,
  onBeamSizeChange,
  onGutterTypeChange,
  onCutBackEaveChange,
  onHouseWallTypeChange,
  onBeamSizeAutoSuggest,
  readOnly = false,
}: SideElevationDiagramProps) {
  const geometry = useMemo(() => {
    const viewWidth = 800;
    const viewHeight = 520;

    // ─── Parse input values (all in mm) ───
    const projMm = Math.max(1000, parseFloat(projection) || 3000);
    const beamMm = Math.max(1800, parseFloat(beamHeight) || 2400);
    const pitchDeg = Math.min(15, Math.max(0, parseFloat(roofFall) || 2));
    const pitchRad = pitchDeg * (Math.PI / 180);
    const eaveMm = Math.max(0, parseFloat(jobEave || "0") || 0);

    // ─── Derived dimensions (mm) ───
    // roofDrop: vertical fall across the full projection
    const roofDropMm = projMm * Math.tan(pitchRad);
    // eaveDrop: additional vertical fall from post line to eave tip
    const eaveDropMm = eaveMm * Math.tan(pitchRad);
    // postHeight: beam height at the low (post) end
    const postHeightMm = beamMm - roofDropMm;
    // frontHeight: total height at house wall = beamHeight (since beam is at wall)
    // The "front height" including eave effect is the roof top at wall
    // Actually: the roof surface at the wall is at beamHeight + some beam/roof thickness
    // For the dimension label, frontHeight = beamHeight (underside of beam at wall)
    // The eave extends the roof PAST the post, so eave is on the LOW side

    // House wall extends above the eave connection point
    const houseAboveEaveMm = 600; // visible house wall above the beam connection

    // ─── Convert to metres for scaling ───
    const projM = projMm / 1000;
    const beamM = beamMm / 1000;
    const eaveM = eaveMm / 1000;
    const houseAboveM = houseAboveEaveMm / 1000;

    // Total real-world extents
    // Width: house wall thickness + projection + eave overhang + margins
    const houseWallThickM = 0.2; // visual thickness of house wall
    const totalWidthM = houseWallThickM + projM + eaveM + 0.3; // 0.3m margin
    // Height: from ground to top of house wall above eave
    const totalHeightM = beamM + houseAboveM + 0.2; // 0.2m margin below/above

    // ─── Compute uniform scale factor ───
    const padL = 80;  // left padding for dimension labels
    const padR = 60;  // right padding
    const padT = 50;  // top padding
    const padB = 70;  // bottom padding for projection dimension
    const drawW = viewWidth - padL - padR;
    const drawH = viewHeight - padT - padB;

    const scaleX = drawW / totalWidthM;
    const scaleY = drawH / totalHeightM;
    const scale = Math.min(scaleX, scaleY);

    // ─── Position key points ───
    // Ground/FFL at bottom
    const groundY = viewHeight - padB;
    const fflY = groundY - 8; // FFL slightly above ground line

    // House wall left edge (centered in available space)
    const usedWidth = totalWidthM * scale;
    const offsetX = padL + (drawW - usedWidth) / 2;
    const wallX = offsetX + houseWallThickM * scale;

    // Beam connection at wall (high side) — underside of beam
    const eaveY = fflY - beamM * scale;

    // House wall top (above eave)
    const wallTopY = eaveY - houseAboveM * scale;

    // Post position (horizontal distance = projection from wall)
    const postX = wallX + projM * scale;

    // Post top (low side of beam) — beam drops by roofDrop
    const roofDropPx = (roofDropMm / 1000) * scale;
    const postTopY = eaveY + roofDropPx;

    // Eave overhang tip (extends past post)
    const eaveEndX = postX + eaveM * scale;
    const eaveDropPx = (eaveDropMm / 1000) * scale;
    const eaveEndY = postTopY + eaveDropPx;

    // Post height in mm (for label)
    const postHtMm = Math.round(postHeightMm);

    return {
      viewWidth,
      viewHeight,
      wallX,
      postX,
      eaveEndX,
      fflY,
      groundY,
      eaveY,
      postTopY,
      eaveEndY,
      wallTopY,
      scale,
      pitchDeg,
      pitchRad,
      projMm,
      beamMm,
      eaveMm,
      roofDropMm,
      eaveDropMm,
      postHtMm,
      houseWallThickM,
      padL,
    };
  }, [beamHeight, roofFall, projection, jobEave]);

  const {
    viewWidth,
    viewHeight,
    wallX,
    postX,
    eaveEndX,
    fflY,
    groundY,
    eaveY,
    postTopY,
    eaveEndY,
    wallTopY,
    scale,
    pitchDeg,
    pitchRad,
    projMm,
    beamMm,
    eaveMm,
    roofDropMm,
    eaveDropMm,
    postHtMm,
    houseWallThickM,
    padL,
  } = geometry;

  const showConnection = !!connectionType && connectionType !== "FSS";

  // Wall visual width in px
  const wallWPx = houseWallThickM * scale;

  return (
    <div className="w-full border rounded-lg bg-white p-3 sm:p-4 overflow-hidden">
      <Label className="text-xs font-medium text-muted-foreground mb-3 block">
        Side Elevation Diagram {readOnly ? "(from spec sheet)" : "(fillable)"} — True Scale
      </Label>

      <div className="flex flex-col lg:flex-row gap-4">
        {/* ─── LEFT: SVG Diagram ─── */}
        <div className="flex-1 min-w-0 overflow-auto touch-manipulation" style={{ WebkitOverflowScrolling: 'touch' }}>
          <div
            className="origin-top-left transition-transform duration-100"
            style={{ minWidth: '100%' }}
            ref={(el) => {
              if (!el) return;
              let sc = 1;
              let startDist = 0;
              const getDistance = (touches: TouchList) => {
                const dx = touches[0].clientX - touches[1].clientX;
                const dy = touches[0].clientY - touches[1].clientY;
                return Math.sqrt(dx * dx + dy * dy);
              };
              el.ontouchstart = (e) => {
                if (e.touches.length === 2) startDist = getDistance(e.touches);
              };
              el.ontouchmove = (e) => {
                if (e.touches.length === 2) {
                  const dist = getDistance(e.touches);
                  sc = Math.min(3, Math.max(1, sc * (dist / startDist)));
                  el.style.transform = `scale(${sc})`;
                  startDist = dist;
                  e.preventDefault();
                }
              };
              el.ontouchend = () => {
                if (sc < 1.1) { sc = 1; el.style.transform = 'scale(1)'; }
              };
            }}
          >
          <svg
            viewBox={`0 0 ${viewWidth} ${viewHeight}`}
            className="w-full h-auto"
            xmlns="http://www.w3.org/2000/svg"
          >
            <rect x="0" y="0" width={viewWidth} height={viewHeight} fill="white" />

            {/* ─── Marker definitions ─── */}
            <defs>
              <marker id="seArrowRight" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
                <polygon points="0 0, 8 3, 0 6" fill="black" />
              </marker>
              <marker id="seArrowLeft" markerWidth="8" markerHeight="6" refX="0" refY="3" orient="auto">
                <polygon points="8 0, 0 3, 8 6" fill="black" />
              </marker>
              <marker id="seArrowUp" markerWidth="6" markerHeight="8" refX="3" refY="0" orient="auto">
                <polygon points="0 8, 3 0, 6 8" fill="black" />
              </marker>
              <marker id="seArrowDown" markerWidth="6" markerHeight="8" refX="3" refY="8" orient="auto">
                <polygon points="0 0, 3 8, 6 0" fill="black" />
              </marker>
              <pattern id="seGroundHatch" patternUnits="userSpaceOnUse" width="8" height="8" patternTransform="rotate(-45)">
                <line x1="0" y1="0" x2="0" y2="8" stroke="#8B6914" strokeWidth="0.5" opacity="0.4" />
              </pattern>
            </defs>

            {/* ═══ House wall (thick rectangle from ground to above eave) ═══ */}
            <rect
              x={wallX - wallWPx}
              y={wallTopY}
              width={wallWPx}
              height={fflY - wallTopY}
              fill="none"
              stroke="#1e293b"
              strokeWidth="2.5"
            />

            {/* House roof (sloping up-left from wall top) */}
            <line x1={wallX - wallWPx - 50} y1={wallTopY - 30} x2={wallX} y2={wallTopY} stroke="#1e293b" strokeWidth="3" />
            {/* Eave overhang of existing house */}
            <line x1={wallX} y1={wallTopY} x2={wallX + 30} y2={wallTopY + 2} stroke="#1e293b" strokeWidth="2" />

            {/* ═══ FASCIA at existing house eave ═══ */}
            <line x1={wallX + 30} y1={wallTopY - 4} x2={wallX + 30} y2={eaveY + 4} stroke="#1e293b" strokeWidth="3.5" />
            {/* Eave soffit (dashed) */}
            <line x1={wallX} y1={eaveY} x2={wallX + 28} y2={eaveY} stroke="#1e293b" strokeWidth="1" strokeDasharray="4 3" />

            {/* Cut back eave dimension */}
            <line x1={wallX} y1={eaveY + 14} x2={wallX + 28} y2={eaveY + 14} stroke="black" strokeWidth="0.8" markerStart="url(#seArrowLeft)" markerEnd="url(#seArrowRight)" />
            <line x1={wallX} y1={eaveY + 4} x2={wallX} y2={eaveY + 20} stroke="black" strokeWidth="0.4" strokeDasharray="2 2" />
            <line x1={wallX + 30} y1={eaveY + 4} x2={wallX + 30} y2={eaveY + 20} stroke="black" strokeWidth="0.4" strokeDasharray="2 2" />

            {/* FASCIA label */}
            <text x={wallX + 36} y={eaveY - 2} fontSize="8" fill="#1e293b" fontWeight="bold" fontFamily="sans-serif">FASCIA</text>

            {/* ═══ CONNECTION DETAIL ANNOTATION ═══ */}
            {showConnection && (
              <g>
                <circle cx={wallX + 15} cy={eaveY} r={22} fill="none" stroke="#e63946" strokeWidth="2" strokeDasharray="5 3" />
                <line x1={wallX + 15} y1={eaveY - 22} x2={wallX + 80} y2={eaveY - 60} stroke="#e63946" strokeWidth="1.5" />
                <rect x={wallX + 50} y={eaveY - 95} width="140" height="48" rx="4" fill="white" stroke="#e63946" strokeWidth="1.5" />
                <text x={wallX + 120} y={eaveY - 78} fontSize="10" fontWeight="bold" fill="#e63946" fontFamily="sans-serif" textAnchor="middle">
                  CONNECTION DETAIL
                </text>
                <text x={wallX + 120} y={eaveY - 63} fontSize="9" fill="#333" fontFamily="sans-serif" textAnchor="middle">
                  {connectionLabel(connectionType)}
                </text>
                <text x={wallX + 120} y={eaveY - 51} fontSize="8" fill="#666" fontFamily="sans-serif" textAnchor="middle">
                  ({connectionType})
                </text>

                {/* Bracket icons */}
                {connectionType === "FLY" && (
                  <g>
                    <path d={`M ${wallX + 26} ${eaveY + 2} L ${wallX + 26} ${eaveY - 12} L ${wallX + 38} ${eaveY - 12} L ${wallX + 38} ${eaveY + 2}`} fill="none" stroke="#e63946" strokeWidth="2.5" />
                    <circle cx={wallX + 26} cy={eaveY + 2} r="2" fill="#e63946" />
                    <circle cx={wallX + 38} cy={eaveY + 2} r="2" fill="#e63946" />
                  </g>
                )}
                {connectionType === "BCH" && (
                  <g>
                    <path d={`M ${wallX + 30} ${eaveY - 5} L ${wallX + 30} ${eaveY + 12} L ${wallX + 44} ${eaveY + 12}`} fill="none" stroke="#e63946" strokeWidth="2.5" />
                    <circle cx={wallX + 30} cy={eaveY - 5} r="2" fill="#e63946" />
                    <circle cx={wallX + 44} cy={eaveY + 12} r="2" fill="#e63946" />
                  </g>
                )}
                {connectionType === "WFX" && (
                  <g>
                    <path d={`M ${wallX - wallWPx + 4} ${eaveY} L ${wallX - wallWPx + 4} ${eaveY + 16} L ${wallX - wallWPx + 18} ${eaveY + 16}`} fill="none" stroke="#e63946" strokeWidth="2.5" />
                    <circle cx={wallX - wallWPx + 4} cy={eaveY} r="2" fill="#e63946" />
                    <circle cx={wallX - wallWPx + 4} cy={eaveY + 10} r="2" fill="#e63946" />
                  </g>
                )}
                {connectionType === "GBL" && (
                  <g>
                    <path d={`M ${wallX - wallWPx + 4} ${eaveY - 6} L ${wallX - wallWPx + 4} ${eaveY + 14} L ${wallX - wallWPx + 18} ${eaveY + 14} Z`} fill="none" stroke="#e63946" strokeWidth="2" />
                    <circle cx={wallX - wallWPx + 4} cy={eaveY - 6} r="2" fill="#e63946" />
                  </g>
                )}
                {connectionType === "POP" && (
                  <g>
                    <rect x={wallX + 27} y={eaveY - 18} width="8" height="20" fill="none" stroke="#e63946" strokeWidth="2" />
                    <circle cx={wallX + 31} cy={eaveY - 8} r="2" fill="#e63946" />
                    <circle cx={wallX + 31} cy={eaveY} r="2" fill="#e63946" />
                  </g>
                )}
              </g>
            )}

            {/* ═══ Beam (from eave connection to post top, sloping down) ═══ */}
            <line x1={wallX} y1={eaveY} x2={postX} y2={postTopY} stroke="#1e293b" strokeWidth="4" />
            <line x1={wallX} y1={eaveY + 6} x2={postX} y2={postTopY + 6} stroke="#1e293b" strokeWidth="1" opacity="0.4" />

            {/* ═══ Roof sheet (parallel to beam, slightly above, extends to eave overhang) ═══ */}
            <line x1={wallX} y1={eaveY - 6} x2={eaveEndX} y2={eaveEndY - 6} stroke="#475569" strokeWidth="2" />
            <line x1={wallX} y1={eaveY - 10} x2={eaveEndX} y2={eaveEndY - 10} stroke="#94a3b8" strokeWidth="1" />
            {/* End cap at eave tip */}
            <line x1={eaveEndX} y1={eaveEndY - 10} x2={eaveEndX} y2={eaveEndY + 2} stroke="#475569" strokeWidth="1.5" />

            {/* Roof type label along the sheet */}
            {(() => {
              const midX = (wallX + postX) / 2;
              const midY = (eaveY + postTopY) / 2 - 18;
              return (
                <text
                  x={midX}
                  y={midY}
                  fontSize="11"
                  fill="#475569"
                  fontFamily="sans-serif"
                  textAnchor="middle"
                  transform={`rotate(${pitchDeg}, ${midX}, ${midY})`}
                >
                  {roofType.toUpperCase()} @ {pitchDeg}°
                </text>
              );
            })()}

            {/* ═══ Gutter at low end (at post position) ═══ */}
            <path
              d={`M ${postX + 4} ${postTopY + 2} L ${postX + 16} ${postTopY + 2} L ${postX + 16} ${postTopY + 14} L ${postX + 6} ${postTopY + 14} L ${postX + 4} ${postTopY + 8} Z`}
              fill="#e2e8f0"
              stroke="#64748b"
              strokeWidth="1.5"
            />
            <text x={postX + 20} y={postTopY + 10} fontSize="8" fill="#64748b" fontFamily="sans-serif">GUTTER</text>

            {/* ═══ Post (vertical at outer edge) ═══ */}
            <line x1={postX} y1={postTopY} x2={postX} y2={fflY} stroke="#1e293b" strokeWidth="4" />
            <rect x={postX - 6} y={fflY - 4} width={12} height={8} fill="none" stroke="#1e293b" strokeWidth="1.5" rx="1" />
            <text
              x={postX + 10}
              y={postTopY + (fflY - postTopY) * 0.5}
              fontSize="8"
              fill="#334155"
              fontFamily="sans-serif"
              textAnchor="middle"
              transform={`rotate(90, ${postX + 10}, ${postTopY + (fflY - postTopY) * 0.5})`}
            >
              Post {postSize}
            </text>

            {/* ═══ Eave overhang dimension (if > 0) ═══ */}
            {eaveMm > 0 && (
              <g opacity="0.8">
                <line x1={postX} y1={eaveEndY + 20} x2={eaveEndX} y2={eaveEndY + 20} stroke="#9333ea" strokeWidth="0.8" markerStart="url(#seArrowLeft)" markerEnd="url(#seArrowRight)" />
                <line x1={postX} y1={eaveEndY + 10} x2={postX} y2={eaveEndY + 26} stroke="#9333ea" strokeWidth="0.4" strokeDasharray="2 2" />
                <line x1={eaveEndX} y1={eaveEndY + 10} x2={eaveEndX} y2={eaveEndY + 26} stroke="#9333ea" strokeWidth="0.4" strokeDasharray="2 2" />
                <text x={(postX + eaveEndX) / 2} y={eaveEndY + 34} fontSize="8" fill="#9333ea" fontFamily="sans-serif" textAnchor="middle">
                  EAVE {eaveMm}mm
                </text>
              </g>
            )}

            {/* ═══ Ground line with hatching ═══ */}
            <line x1={wallX - wallWPx - 40} y1={groundY} x2={eaveEndX + 30} y2={groundY} stroke="#8B6914" strokeWidth="1.5" />
            <rect x={wallX - wallWPx - 40} y={groundY} width={eaveEndX + 70 - wallX + wallWPx} height={12} fill="url(#seGroundHatch)" />

            {/* FFL line (dashed) */}
            <line x1={wallX - wallWPx - 20} y1={fflY} x2={eaveEndX + 20} y2={fflY} stroke="#94a3b8" strokeWidth="0.8" strokeDasharray="4 3" />
            <text x={wallX - wallWPx - 25} y={fflY + 3} fontSize="7" fill="#94a3b8" fontFamily="sans-serif" textAnchor="end">FFL</text>

            {/* ═══ Roof pitch angle indicator ═══ */}
            <g>
              <line x1={wallX} y1={eaveY} x2={wallX + 50} y2={eaveY} stroke="#dc2626" strokeWidth="0.8" strokeDasharray="3 2" />
              <line x1={wallX} y1={eaveY} x2={wallX + 50} y2={eaveY + Math.tan(pitchRad) * 50} stroke="#dc2626" strokeWidth="0.8" />
              <text x={wallX + 55} y={eaveY + 5} fontSize="10" fill="#dc2626" fontWeight="bold" fontFamily="sans-serif">
                ROOF FALL {pitchDeg}°
              </text>
            </g>

            {/* ═══ DIMENSION: Projection (horizontal, below ground) ═══ */}
            <line x1={wallX} y1={groundY + 25} x2={postX} y2={groundY + 25} stroke="black" strokeWidth="0.8" markerStart="url(#seArrowLeft)" markerEnd="url(#seArrowRight)" />
            <line x1={wallX} y1={groundY + 8} x2={wallX} y2={groundY + 30} stroke="black" strokeWidth="0.4" />
            <line x1={postX} y1={groundY + 8} x2={postX} y2={groundY + 30} stroke="black" strokeWidth="0.4" />
            <text x={(wallX + postX) / 2} y={groundY + 22} fontSize="10" fill="#1e293b" fontFamily="sans-serif" textAnchor="middle">
              {projection ? `${projection}mm` : "— mm"}
            </text>
            <text x={(wallX + postX) / 2} y={groundY + 42} fontSize="9" fill="#1e293b" fontWeight="bold" fontFamily="sans-serif" textAnchor="middle">
              O/ALL PROJECTION
            </text>

            {/* ═══ DIMENSION: Beam height at wall (vertical, left side) ═══ */}
            <line x1={wallX - wallWPx - 30} y1={eaveY} x2={wallX - wallWPx - 30} y2={fflY} stroke="black" strokeWidth="0.8" markerStart="url(#seArrowUp)" markerEnd="url(#seArrowDown)" />
            <line x1={wallX - wallWPx - 35} y1={eaveY} x2={wallX - wallWPx - 5} y2={eaveY} stroke="black" strokeWidth="0.4" />
            <line x1={wallX - wallWPx - 35} y1={fflY} x2={wallX - wallWPx - 5} y2={fflY} stroke="black" strokeWidth="0.4" />
            <text x={wallX - wallWPx - 35} y={eaveY + (fflY - eaveY) / 2 + 4} fontSize="9" fill="#1e293b" fontFamily="sans-serif" textAnchor="end">
              {beamHeight ? `${beamHeight}mm` : "— mm"}
            </text>

            {/* ═══ DIMENSION: Post height (vertical, right of post) ═══ */}
            <line x1={postX + 28} y1={postTopY} x2={postX + 28} y2={fflY} stroke="#475569" strokeWidth="0.6" markerStart="url(#seArrowUp)" markerEnd="url(#seArrowDown)" />
            <line x1={postX + 6} y1={postTopY} x2={postX + 33} y2={postTopY} stroke="#475569" strokeWidth="0.4" />
            <line x1={postX + 6} y1={fflY} x2={postX + 33} y2={fflY} stroke="#475569" strokeWidth="0.4" />
            <text x={postX + 35} y={postTopY + (fflY - postTopY) / 2 + 3} fontSize="9" fill="#475569" fontFamily="sans-serif">
              {postHtMm}mm
            </text>

            {/* ═══ House wall label ═══ */}
            <text
              x={wallX - wallWPx / 2}
              y={wallTopY + (fflY - wallTopY) * 0.4}
              fontSize="9"
              fill="#1e293b"
              fontFamily="sans-serif"
              textAnchor="middle"
              transform={`rotate(-90, ${wallX - wallWPx / 2}, ${wallTopY + (fflY - wallTopY) * 0.4})`}
            >
              EXISTING HOUSE
            </text>

            {/* EAVE LEVEL label */}
            <line x1={wallX - wallWPx - 20} y1={eaveY} x2={wallX - wallWPx - 40} y2={eaveY} stroke="#94a3b8" strokeWidth="0.5" strokeDasharray="2 2" />
            <text x={wallX - wallWPx - 42} y={eaveY - 3} fontSize="6" fill="#94a3b8" fontFamily="sans-serif" textAnchor="end">EAVE LEVEL</text>

            {/* Beam size label along the beam */}
            <text
              x={(wallX + postX) / 2}
              y={(eaveY + postTopY) / 2 + 18}
              fontSize="8"
              fill="#334155"
              fontFamily="sans-serif"
              textAnchor="middle"
            >
              Beam: {beamSize}
            </text>

            {/* Cut back eave label */}
            {cutBackEave && cutBackEave !== "0" && (
              <g>
                <line x1={wallX - wallWPx} y1={eaveY - 12} x2={wallX + 15} y2={eaveY - 12} stroke="#9333ea" strokeWidth="0.8" strokeDasharray="2 2" />
                <text x={wallX + 18} y={eaveY - 9} fontSize="7" fill="#9333ea" fontFamily="sans-serif">
                  Cut Back: {cutBackEave}mm
                </text>
              </g>
            )}

            {/* ═══ Calculated front height annotation ═══ */}
            {eaveMm > 0 && (
              <g opacity="0.7">
                <text x={wallX + 55} y={eaveY + 20} fontSize="7" fill="#065f46" fontFamily="sans-serif">
                  Front Ht = {beamMm}mm + ({eaveMm} × tan{pitchDeg}°)
                </text>
                <text x={wallX + 55} y={eaveY + 30} fontSize="7" fill="#065f46" fontFamily="sans-serif">
                  = {beamMm} + {Math.round(eaveDropMm)} = {Math.round(beamMm + eaveDropMm)}mm
                </text>
              </g>
            )}
          </svg>
          </div>
        </div>

        {/* ─── RIGHT: Fields Table ─── */}
        <div className="w-full lg:w-[280px] shrink-0">
          <div className="border rounded-md overflow-hidden">
            <div className="bg-slate-50 px-3 py-2 border-b">
              <span className="text-xs font-semibold text-slate-700 uppercase tracking-wide">Parameters</span>
            </div>
            <div className="divide-y">
              {/* Beam Height */}
              <div className="flex items-center gap-2 px-3 py-2">
                <label className="text-xs text-slate-600 w-24 shrink-0 flex items-center gap-1">Beam Height <ParamTip tip="Height from FFL to the underside of the beam at the house wall (high side connection point)" /></label>
                {readOnly ? (
                  <span className="text-xs font-medium">{beamHeight || "—"} mm</span>
                ) : (
                  <Input
                    className="h-7 text-xs flex-1"
                    value={beamHeight}
                    onChange={(e) => onBeamHeightChange(e.target.value)}
                    placeholder="mm"
                  />
                )}
              </div>

              {/* Projection */}
              <div className="flex items-center gap-2 px-3 py-2">
                <label className="text-xs text-slate-600 w-24 shrink-0 flex items-center gap-1">Projection <ParamTip tip="Horizontal distance from the house wall to the post line (outer edge)" /></label>
                {readOnly ? (
                  <span className="text-xs font-medium">{projection || "—"} mm</span>
                ) : (
                  <Input
                    className="h-7 text-xs flex-1"
                    value={projection}
                    onChange={(e) => onProjectionChange(e.target.value)}
                    placeholder="mm"
                  />
                )}
              </div>

              {/* Roof Pitch */}
              <div className="flex items-center gap-2 px-3 py-2">
                <label className="text-xs text-slate-600 w-24 shrink-0 flex items-center gap-1">Roof Pitch <ParamTip tip="Angle of the roof slope in degrees. Determines the fall from eave to gutter." /></label>
                {readOnly ? (
                  <span className="text-xs font-medium">{roofFall || "—"}°</span>
                ) : (
                  <Select value={roofFall} onValueChange={onRoofFallChange}>
                    <SelectTrigger className="h-7 text-xs flex-1">
                      <SelectValue placeholder="Select" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">1°</SelectItem>
                      <SelectItem value="2">2°</SelectItem>
                      <SelectItem value="3">3°</SelectItem>
                      <SelectItem value="5">5°</SelectItem>
                      <SelectItem value="7">7°</SelectItem>
                      <SelectItem value="10">10°</SelectItem>
                      <SelectItem value="12">12°</SelectItem>
                      <SelectItem value="15">15°</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              </div>

              {/* Job Eave (read-only display from Roof section) */}
              <div className="flex items-center gap-2 px-3 py-2 bg-green-50">
                <label className="text-xs text-green-700 w-24 shrink-0 flex items-center gap-1">Job Eave <ParamTip tip="Eave overhang width from the Roof section. Extends the roof past the post line. Edit in Dimensions & Structure section." /></label>
                <span className="text-xs font-medium text-green-800">{eaveMm > 0 ? `${eaveMm}mm` : "None"}</span>
              </div>

              {/* Cut Back Eave */}
              <div className="flex items-center gap-2 px-3 py-2">
                <label className="text-xs text-slate-600 w-24 shrink-0 flex items-center gap-1">Cut Back Eave <ParamTip tip="Distance the existing house eave is cut back to allow the new roof to connect flush" /></label>
                {readOnly ? (
                  <span className="text-xs font-medium">{cutBackEave || "—"} mm</span>
                ) : (
                  <Input
                    className="h-7 text-xs flex-1"
                    value={cutBackEave}
                    onChange={(e) => onCutBackEaveChange(e.target.value)}
                    placeholder="mm"
                  />
                )}
              </div>

              {/* Wall Type */}
              <div className="flex items-center gap-2 px-3 py-2">
                <label className="text-xs text-slate-600 w-24 shrink-0 flex items-center gap-1">Wall Type <ParamTip tip="Construction type of the existing house wall where the structure attaches" /></label>
                {readOnly ? (
                  <span className="text-xs font-medium">{houseWallType || "—"}</span>
                ) : (
                  <Select value={houseWallType} onValueChange={onHouseWallTypeChange}>
                    <SelectTrigger className="h-7 text-xs flex-1">
                      <SelectValue placeholder="Select" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Brick Veneer">Brick Veneer</SelectItem>
                      <SelectItem value="Double Brick">Double Brick</SelectItem>
                      <SelectItem value="Weatherboard">Weatherboard</SelectItem>
                      <SelectItem value="Hebel">Hebel</SelectItem>
                      <SelectItem value="Rendered">Rendered</SelectItem>
                      <SelectItem value="Colorbond">Colorbond</SelectItem>
                      <SelectItem value="Other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              </div>

              {/* Beam Size — with RB100 validation colour coding */}
              {(() => {
                const validation: BeamValidationResult = (beamSize && beamSpanMm && windCat)
                  ? validateBeamSize(beamSize, beamSpanMm, parseFloat(projection) || 3000, windCat)
                  : { status: "unknown", colour: "#9ca3af", borderClass: "border-gray-300", bgClass: "", textClass: "text-gray-500", label: "N/A", tooltip: "Set beam span and wind category to validate.", maxSpanMm: null, utilisation: null };
                const bgTint = validation.status === "pass" ? "bg-green-50" : validation.status === "warning" ? "bg-amber-50" : validation.status === "fail" ? "bg-red-50" : "";
                return (
                  <div className={`flex items-center gap-2 px-3 py-2 ${bgTint}`}>
                    <label className="text-xs text-slate-600 w-24 shrink-0 flex items-center gap-1">Beam Size <ParamTip tip="Cross-section dimensions of the main beam (width × depth in mm). Colour indicates RB100 compliance." /></label>
                    {readOnly ? (
                      <span className="text-xs font-medium">{beamSize || "—"}</span>
                    ) : (
                      <Select value={beamSize} onValueChange={onBeamSizeChange}>
                        <SelectTrigger className={`h-7 text-xs flex-1 ${validation.borderClass}`}>
                          <SelectValue placeholder="Select" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="75x50">75x50</SelectItem>
                          <SelectItem value="100x50">100x50</SelectItem>
                          <SelectItem value="125x50">125x50</SelectItem>
                          <SelectItem value="150x50">150x50</SelectItem>
                          <SelectItem value="175x50">175x50</SelectItem>
                          <SelectItem value="200x50">200x50</SelectItem>
                          <SelectItem value="250x50">250x50</SelectItem>
                          <SelectItem value="300x50">300x50</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                    {/* Validation status badge with tooltip */}
                    {validation.status !== "unknown" && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${validation.textClass} ${validation.bgClass} border ${validation.borderClass} cursor-help flex items-center gap-0.5`}>
                            {validation.status === "pass" && <CheckCircle2 className="h-3 w-3" />}
                            {validation.status === "warning" && <AlertTriangle className="h-3 w-3" />}
                            {validation.status === "fail" && <XCircle className="h-3 w-3" />}
                            {validation.label}
                          </span>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-[280px] text-xs">
                          <p>{validation.tooltip}</p>
                          {validation.suggestion && <p className="mt-1 font-semibold">{validation.suggestion}</p>}
                        </TooltipContent>
                      </Tooltip>
                    )}
                    {/* Auto-suggest: one-click accept recommended beam size */}
                    {!readOnly && (validation.status === "fail" || validation.status === "warning") && validation.suggestion && (() => {
                      // Extract the recommended beam size from the suggestion string
                      const match = validation.suggestion.match(/(\d+x\d+)/);
                      const recommended = match ? match[1] : null;
                      if (!recommended || recommended === beamSize) return null;
                      return (
                        <button
                          type="button"
                          className="text-[9px] font-medium px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 border border-blue-300 hover:bg-blue-200 transition-colors whitespace-nowrap"
                          onClick={() => {
                            onBeamSizeChange(recommended);
                            onBeamSizeAutoSuggest?.(recommended);
                          }}
                          title={`Accept recommended beam size: ${recommended}`}
                        >
                          Use {recommended}
                        </button>
                      );
                    })()}
                  </div>
                );
              })()}

              {/* Post Size */}
              <div className="flex items-center gap-2 px-3 py-2">
                <label className="text-xs text-slate-600 w-24 shrink-0 flex items-center gap-1">Post Size <ParamTip tip="Cross-section dimensions of the support posts (square section in mm)" /></label>
                {readOnly ? (
                  <span className="text-xs font-medium">{postSize || "—"}</span>
                ) : (
                  <Select value={postSize} onValueChange={onPostSizeChange}>
                    <SelectTrigger className="h-7 text-xs flex-1">
                      <SelectValue placeholder="Select" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="75x75">75x75</SelectItem>
                      <SelectItem value="90x90">90x90</SelectItem>
                      <SelectItem value="100x100">100x100</SelectItem>
                      <SelectItem value="125x125">125x125</SelectItem>
                      <SelectItem value="150x150">150x150</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              </div>

              {/* Gutter Type */}
              <div className="flex items-center gap-2 px-3 py-2">
                <label className="text-xs text-slate-600 w-24 shrink-0 flex items-center gap-1">Gutter <ParamTip tip="Gutter profile type at the low end of the roof (collects rainwater)" /></label>
                {readOnly ? (
                  <span className="text-xs font-medium">{gutterType || "—"}</span>
                ) : (
                  <Select value={gutterType} onValueChange={onGutterTypeChange}>
                    <SelectTrigger className="h-7 text-xs flex-1">
                      <SelectValue placeholder="Select" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Quad">Quad</SelectItem>
                      <SelectItem value="Half Round">Half Round</SelectItem>
                      <SelectItem value="Square">Square</SelectItem>
                      <SelectItem value="OG">OG</SelectItem>
                      <SelectItem value="Fascia">Fascia</SelectItem>
                      <SelectItem value="None">None</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              </div>

              {/* Connection Type (read-only display) */}
              {connectionType && (
                <div className="flex items-center gap-2 px-3 py-2 bg-red-50">
                  <label className="text-xs text-red-700 w-24 shrink-0 font-medium">Connection</label>
                  <span className="text-xs font-medium text-red-800">{connectionLabel(connectionType)} ({connectionType})</span>
                </div>
              )}

              {/* Calculated Post Height (read-only) */}
              <div className="flex items-center gap-2 px-3 py-2 bg-slate-50">
                <label className="text-xs text-slate-500 w-24 shrink-0">Post Height</label>
                <span className="text-xs font-medium text-slate-600">{postHtMm} mm (calculated)</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <p className="text-[10px] text-muted-foreground mt-2">
        {readOnly
          ? "Values from the original spec sheet. Diagram drawn to true scale — proportions reflect actual dimensions."
          : "Fill in the fields on the right. Diagram drawn to true scale — proportions update dynamically as values change."}
      </p>
    </div>
  );
}
