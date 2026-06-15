import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Info } from "lucide-react";
import { useMemo } from "react";

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

interface FrontElevationDiagramProps {
  /** Overall width of the structure (mm) */
  structureWidth: string;
  /** Beam height from floor (mm) */
  beamHeight: string;
  /** Number of posts */
  postCount: string;
  /** Post spacing (mm) - derived or entered */
  postSpacing: string;
  /** Gutter type */
  gutterType: string;
  /** Roof overhang at front (mm) */
  roofOverhang: string;
  /** Post type/size */
  postSize: string;
  /** Beam size */
  beamSize: string;
  /** Roof shape: Flat/Skillion, Gable, Dutch Gable, Split Gable, Flat-Gable-Flat */
  roofShape?: string;
  /** Roof fall in degrees */
  roofFall?: string;
  /** Callbacks */
  onStructureWidthChange: (v: string) => void;
  onBeamHeightChange: (v: string) => void;
  onPostCountChange: (v: string) => void;
  onPostSpacingChange: (v: string) => void;
  onGutterTypeChange: (v: string) => void;
  onRoofOverhangChange: (v: string) => void;
  onPostSizeChange: (v: string) => void;
  onBeamSizeChange: (v: string) => void;
  /** Read-only mode */
  readOnly?: boolean;
}

/**
 * Interactive Front Elevation Diagram
 * 
 * Shows the front view of a structure with fillable fields for:
 * Structure Width, Beam Height, Post Count, Post Spacing, Gutter Type,
 * Roof Overhang, Post Size, and Beam Size.
 * The diagram dynamically adjusts post positions and beam height.
 * 
 * When roofShape is Gable/Dutch Gable/Split Gable:
 * - Draws triangular infill panel at the gable end
 * - Barge boards along the sloped edges
 * - Ridge cap at the apex
 * - Beams follow the slope (not flat)
 */
export default function FrontElevationDiagram({
  structureWidth,
  beamHeight,
  postCount,
  postSpacing,
  gutterType,
  roofOverhang,
  postSize,
  beamSize,
  roofShape,
  roofFall,
  onStructureWidthChange,
  onBeamHeightChange,
  onPostCountChange,
  onPostSpacingChange,
  onGutterTypeChange,
  onRoofOverhangChange,
  onPostSizeChange,
  onBeamSizeChange,
  readOnly = false,
}: FrontElevationDiagramProps) {
  // Determine if this is a gable roof
  const isGable = roofShape === "Gable" || roofShape === "Dutch Gable" || roofShape === "Split Gable" || roofShape === "Flat-Gable-Flat";
  const isDutchGable = roofShape === "Dutch Gable";
  const isFlatGableFlat = roofShape === "Flat-Gable-Flat";
  const isSplitGable = roofShape === "Split Gable";

  // ─── Dynamic geometry ───────────────────────────────────────────────────
  const geometry = useMemo(() => {
    const numPosts = Math.min(8, Math.max(2, parseInt(postCount) || 2));
    
    // Beam height scales visually: 2100mm = default, range 1800-3600
    const beamMm = Math.min(3600, Math.max(1800, parseFloat(beamHeight) || 2400));
    // Map 1800-3600mm to visual height 200-350px
    const beamVisualH = 200 + ((beamMm - 1800) / 1800) * 150;

    // Overhang: 0-300mm maps to 0-30px visual
    const overhangMm = Math.min(300, Math.max(0, parseFloat(roofOverhang) || 0));
    const overhangPx = (overhangMm / 300) * 30;

    // Roof pitch (degrees) for gable rise calculation
    const pitchDeg = Math.min(30, Math.max(0, parseFloat(roofFall || "0") || 2));
    const pitchRad = pitchDeg * (Math.PI / 180);

    // Layout constants
    const viewWidth = 800;
    const viewHeight = 600;
    const margin = 80;
    const structureVisualWidth = viewWidth - margin * 2; // 640px
    const floorY = 520;
    const beamTopY = floorY - beamVisualH;

    // Gable rise: half-span * tan(pitch)
    const halfSpanPx = structureVisualWidth / 2;
    const gableRisePx = isGable ? Math.min(120, halfSpanPx * Math.tan(pitchRad)) : 0;

    // Roof top Y: for flat, beam sits flush; for gable, peak is above beam
    const roofTopY = beamTopY; // Beam flush with roof at eave level
    const ridgeY = roofTopY - gableRisePx; // Peak of gable

    // Post positions (evenly distributed)
    const posts: number[] = [];
    for (let i = 0; i < numPosts; i++) {
      const x = margin + (i / (numPosts - 1)) * structureVisualWidth;
      posts.push(x);
    }

    // Dutch Gable: flat ridge section occupies the top ~30% of the gable height
    const dutchFlatWidth = isDutchGable ? structureVisualWidth * 0.3 : 0;
    const dutchRidgeY = isDutchGable ? ridgeY : ridgeY; // same ridge height
    // The gable slopes stop at a "hip break" point partway up
    const dutchBreakY = isDutchGable ? ridgeY + gableRisePx * 0.35 : ridgeY;

    // Flat-Gable-Flat: centre 1/3 is gable, outer 1/3 on each side is flat
    const fgfCentreWidth = structureVisualWidth / 3;
    const fgfLeftFlatEnd = margin + structureVisualWidth / 3; // end of left flat section
    const fgfRightFlatStart = margin + (2 * structureVisualWidth) / 3; // start of right flat section
    const fgfPeakX = margin + structureVisualWidth / 2; // centre of gable
    // Gable rise for the centre section only (half of centre width * tan(pitch))
    const fgfGableRise = isFlatGableFlat ? Math.min(80, (fgfCentreWidth / 2) * Math.tan(pitchRad)) : 0;
    const fgfRidgeY = roofTopY - fgfGableRise;

    // Split Gable: two separate gable peaks side-by-side, each spanning half the width
    const sgHalfWidth = structureVisualWidth / 2;
    const sgValleyX = margin + sgHalfWidth; // centre valley between the two peaks
    const sgLeftPeakX = margin + sgHalfWidth / 2; // peak of left gable
    const sgRightPeakX = margin + sgHalfWidth + sgHalfWidth / 2; // peak of right gable
    // Each gable rise is based on quarter-span (half of each gable's width)
    const sgGableRise = isSplitGable ? Math.min(90, (sgHalfWidth / 2) * Math.tan(pitchRad)) : 0;
    const sgRidgeY = roofTopY - sgGableRise;

    return {
      numPosts,
      beamVisualH,
      overhangPx,
      viewWidth,
      viewHeight,
      margin,
      structureVisualWidth,
      floorY,
      beamTopY,
      roofTopY,
      ridgeY,
      gableRisePx,
      posts,
      pitchDeg,
      dutchFlatWidth,
      dutchBreakY,
      fgfCentreWidth,
      fgfLeftFlatEnd,
      fgfRightFlatStart,
      fgfPeakX,
      fgfGableRise,
      fgfRidgeY,
      sgHalfWidth,
      sgValleyX,
      sgLeftPeakX,
      sgRightPeakX,
      sgGableRise,
      sgRidgeY,
    };
  }, [postCount, beamHeight, roofOverhang, roofFall, isGable, isDutchGable, isFlatGableFlat, isSplitGable]);

  const { numPosts, overhangPx, margin, structureVisualWidth, floorY, beamTopY, roofTopY, ridgeY, gableRisePx, posts, pitchDeg, dutchFlatWidth, dutchBreakY, fgfCentreWidth, fgfLeftFlatEnd, fgfRightFlatStart, fgfPeakX, fgfGableRise, fgfRidgeY, sgHalfWidth, sgValleyX, sgLeftPeakX, sgRightPeakX, sgGableRise, sgRidgeY } = geometry;

  // Gable geometry points
  const peakX = margin + structureVisualWidth / 2;
  const leftEaveX = margin - overhangPx;
  const rightEaveX = margin + structureVisualWidth + overhangPx;

  return (
    <div className="w-full border rounded-lg bg-white p-3 sm:p-4 overflow-hidden">
      <Label className="text-xs font-medium text-muted-foreground mb-3 block">
        Front Elevation Diagram {readOnly ? "(from spec sheet)" : "(fillable)"}
        {isGable && <span className="ml-2 text-blue-600 font-semibold">• {roofShape}</span>}
      </Label>

      <div className="flex flex-col lg:flex-row gap-4">
      {/* ─── LEFT: SVG Diagram ─── */}
      <div className="flex-1 min-w-0">
        <svg
          viewBox="0 0 800 600"
          className="w-full h-full"
          xmlns="http://www.w3.org/2000/svg"
        >
          <rect x="0" y="0" width="800" height="600" fill="white" />

          {/* ─── Arrow markers ─── */}
          <defs>
            <marker id="feArrowRight" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
              <polygon points="0 0, 8 3, 0 6" fill="black" />
            </marker>
            <marker id="feArrowLeft" markerWidth="8" markerHeight="6" refX="0" refY="3" orient="auto">
              <polygon points="8 0, 0 3, 8 6" fill="black" />
            </marker>
            <marker id="feArrowUp" markerWidth="6" markerHeight="8" refX="3" refY="0" orient="auto">
              <polygon points="0 8, 3 0, 6 8" fill="black" />
            </marker>
            <marker id="feArrowDown" markerWidth="6" markerHeight="8" refX="3" refY="8" orient="auto">
              <polygon points="0 0, 3 8, 6 0" fill="black" />
            </marker>
          </defs>

          {isGable ? (
            /* ═══════════════════════════════════════════════════════════════
               GABLE / DUTCH GABLE ROOF RENDERING
               Dutch Gable: flat ridge section at top + sloped gable below
               Standard Gable: triangular infill to single apex
            ═══════════════════════════════════════════════════════════════ */
            <g>
              {isSplitGable ? (
                /* ─── SPLIT GABLE: two separate gable peaks side-by-side ─── */
                <g>
                  {/* Left gable triangular infill */}
                  <path
                    d={`M ${leftEaveX} ${roofTopY} L ${sgLeftPeakX} ${sgRidgeY} L ${sgValleyX} ${roofTopY} Z`}
                    fill="#e8f0f8"
                    stroke="none"
                  />
                  {/* Right gable triangular infill */}
                  <path
                    d={`M ${sgValleyX} ${roofTopY} L ${sgRightPeakX} ${sgRidgeY} L ${rightEaveX} ${roofTopY} Z`}
                    fill="#e8f0f8"
                    stroke="none"
                  />

                  {/* Left gable mullions */}
                  {Array.from({ length: 3 }, (_, i) => {
                    const t = (i + 1) / 4;
                    const x = leftEaveX + t * (sgValleyX - leftEaveX);
                    let topY: number;
                    if (x <= sgLeftPeakX) {
                      const tSlope = (x - leftEaveX) / (sgLeftPeakX - leftEaveX);
                      topY = roofTopY + tSlope * (sgRidgeY - roofTopY);
                    } else {
                      const tSlope = (x - sgLeftPeakX) / (sgValleyX - sgLeftPeakX);
                      topY = sgRidgeY + tSlope * (roofTopY - sgRidgeY);
                    }
                    return <line key={`sg-lm-${i}`} x1={x} y1={topY + 3} x2={x} y2={roofTopY} stroke="#94b8d4" strokeWidth="0.8" opacity="0.5" />;
                  })}
                  {/* Right gable mullions */}
                  {Array.from({ length: 3 }, (_, i) => {
                    const t = (i + 1) / 4;
                    const x = sgValleyX + t * (rightEaveX - sgValleyX);
                    let topY: number;
                    if (x <= sgRightPeakX) {
                      const tSlope = (x - sgValleyX) / (sgRightPeakX - sgValleyX);
                      topY = roofTopY + tSlope * (sgRidgeY - roofTopY);
                    } else {
                      const tSlope = (x - sgRightPeakX) / (rightEaveX - sgRightPeakX);
                      topY = sgRidgeY + tSlope * (roofTopY - sgRidgeY);
                    }
                    return <line key={`sg-rm-${i}`} x1={x} y1={topY + 3} x2={x} y2={roofTopY} stroke="#94b8d4" strokeWidth="0.8" opacity="0.5" />;
                  })}

                  {/* Left gable barge boards */}
                  <line x1={leftEaveX} y1={roofTopY} x2={sgLeftPeakX} y2={sgRidgeY} stroke="black" strokeWidth="3" />
                  <line x1={sgLeftPeakX} y1={sgRidgeY} x2={sgValleyX} y2={roofTopY} stroke="black" strokeWidth="3" />
                  <line x1={leftEaveX + 2} y1={roofTopY + 4} x2={sgLeftPeakX} y2={sgRidgeY + 4} stroke="black" strokeWidth="1" opacity="0.5" />
                  <line x1={sgLeftPeakX} y1={sgRidgeY + 4} x2={sgValleyX - 2} y2={roofTopY + 4} stroke="black" strokeWidth="1" opacity="0.5" />

                  {/* Right gable barge boards */}
                  <line x1={sgValleyX} y1={roofTopY} x2={sgRightPeakX} y2={sgRidgeY} stroke="black" strokeWidth="3" />
                  <line x1={sgRightPeakX} y1={sgRidgeY} x2={rightEaveX} y2={roofTopY} stroke="black" strokeWidth="3" />
                  <line x1={sgValleyX + 2} y1={roofTopY + 4} x2={sgRightPeakX} y2={sgRidgeY + 4} stroke="black" strokeWidth="1" opacity="0.5" />
                  <line x1={sgRightPeakX} y1={sgRidgeY + 4} x2={rightEaveX - 2} y2={roofTopY + 4} stroke="black" strokeWidth="1" opacity="0.5" />

                  {/* Left ridge cap */}
                  <rect x={sgLeftPeakX - 10} y={sgRidgeY - 5} width={20} height={9} fill="white" stroke="black" strokeWidth="2" rx="2" />
                  <text x={sgLeftPeakX} y={sgRidgeY + 2} fontSize="5" fill="#333" fontFamily="sans-serif" textAnchor="middle">RIDGE</text>

                  {/* Right ridge cap */}
                  <rect x={sgRightPeakX - 10} y={sgRidgeY - 5} width={20} height={9} fill="white" stroke="black" strokeWidth="2" rx="2" />
                  <text x={sgRightPeakX} y={sgRidgeY + 2} fontSize="5" fill="#333" fontFamily="sans-serif" textAnchor="middle">RIDGE</text>

                  {/* Valley gutter at centre */}
                  <line x1={sgValleyX} y1={roofTopY} x2={sgValleyX} y2={roofTopY - 15} stroke="#2563eb" strokeWidth="2" strokeDasharray="4 2" />
                  <text x={sgValleyX} y={roofTopY - 18} fontSize="6" fill="#2563eb" fontFamily="sans-serif" textAnchor="middle">VALLEY</text>

                  {/* Roof ribs - left gable */}
                  {Array.from({ length: 4 }, (_, i) => {
                    const t = (i + 1) / 5;
                    const x = leftEaveX + t * (sgLeftPeakX - leftEaveX);
                    const y = roofTopY + t * (sgRidgeY - roofTopY);
                    return <line key={`sg-lr-${i}`} x1={x} y1={y} x2={x} y2={roofTopY} stroke="black" strokeWidth="0.3" opacity="0.15" />;
                  })}
                  {Array.from({ length: 4 }, (_, i) => {
                    const t = (i + 1) / 5;
                    const x = sgLeftPeakX + t * (sgValleyX - sgLeftPeakX);
                    const y = sgRidgeY + t * (roofTopY - sgRidgeY);
                    return <line key={`sg-lrr-${i}`} x1={x} y1={y} x2={x} y2={roofTopY} stroke="black" strokeWidth="0.3" opacity="0.15" />;
                  })}
                  {/* Roof ribs - right gable */}
                  {Array.from({ length: 4 }, (_, i) => {
                    const t = (i + 1) / 5;
                    const x = sgValleyX + t * (sgRightPeakX - sgValleyX);
                    const y = roofTopY + t * (sgRidgeY - roofTopY);
                    return <line key={`sg-rl-${i}`} x1={x} y1={y} x2={x} y2={roofTopY} stroke="black" strokeWidth="0.3" opacity="0.15" />;
                  })}
                  {Array.from({ length: 4 }, (_, i) => {
                    const t = (i + 1) / 5;
                    const x = sgRightPeakX + t * (rightEaveX - sgRightPeakX);
                    const y = sgRidgeY + t * (roofTopY - sgRidgeY);
                    return <line key={`sg-rrr-${i}`} x1={x} y1={y} x2={x} y2={roofTopY} stroke="black" strokeWidth="0.3" opacity="0.15" />;
                  })}
                </g>
              ) : isFlatGableFlat ? (
                /* ─── FLAT-GABLE-FLAT: centre gable with flat sections on each side ─── */
                <g>
                  {/* Left flat roof section */}
                  <rect
                    x={leftEaveX}
                    y={roofTopY - 12}
                    width={fgfLeftFlatEnd - leftEaveX}
                    height={12}
                    fill="none"
                    stroke="black"
                    strokeWidth="1.5"
                  />
                  {/* Left flat roof ribs */}
                  {Array.from({ length: 4 }, (_, i) => {
                    const x = leftEaveX + ((i + 1) / 5) * (fgfLeftFlatEnd - leftEaveX);
                    return <line key={`lfr-${i}`} x1={x} y1={roofTopY - 12} x2={x} y2={roofTopY} stroke="black" strokeWidth="0.3" opacity="0.2" />;
                  })}
                  <text x={leftEaveX + (fgfLeftFlatEnd - leftEaveX) / 2} y={roofTopY - 4} fontSize="7" fill="#666" fontFamily="sans-serif" textAnchor="middle">FLAT</text>

                  {/* Right flat roof section */}
                  <rect
                    x={fgfRightFlatStart}
                    y={roofTopY - 12}
                    width={rightEaveX - fgfRightFlatStart}
                    height={12}
                    fill="none"
                    stroke="black"
                    strokeWidth="1.5"
                  />
                  {/* Right flat roof ribs */}
                  {Array.from({ length: 4 }, (_, i) => {
                    const x = fgfRightFlatStart + ((i + 1) / 5) * (rightEaveX - fgfRightFlatStart);
                    return <line key={`rfr-${i}`} x1={x} y1={roofTopY - 12} x2={x} y2={roofTopY} stroke="black" strokeWidth="0.3" opacity="0.2" />;
                  })}
                  <text x={fgfRightFlatStart + (rightEaveX - fgfRightFlatStart) / 2} y={roofTopY - 4} fontSize="7" fill="#666" fontFamily="sans-serif" textAnchor="middle">FLAT</text>

                  {/* Centre gable triangular infill */}
                  <path
                    d={`M ${fgfLeftFlatEnd} ${roofTopY} L ${fgfPeakX} ${fgfRidgeY} L ${fgfRightFlatStart} ${roofTopY} Z`}
                    fill="#e8f0f8"
                    stroke="none"
                  />
                  {/* Centre gable mullions */}
                  {Array.from({ length: 3 }, (_, i) => {
                    const t = (i + 1) / 4;
                    const x = fgfLeftFlatEnd + t * (fgfRightFlatStart - fgfLeftFlatEnd);
                    let topY: number;
                    if (x <= fgfPeakX) {
                      const tSlope = (x - fgfLeftFlatEnd) / (fgfPeakX - fgfLeftFlatEnd);
                      topY = roofTopY + tSlope * (fgfRidgeY - roofTopY);
                    } else {
                      const tSlope = (x - fgfPeakX) / (fgfRightFlatStart - fgfPeakX);
                      topY = fgfRidgeY + tSlope * (roofTopY - fgfRidgeY);
                    }
                    return <line key={`fgf-mul-${i}`} x1={x} y1={topY + 3} x2={x} y2={roofTopY} stroke="#94b8d4" strokeWidth="0.8" opacity="0.5" />;
                  })}

                  {/* Centre gable barge boards */}
                  <line x1={fgfLeftFlatEnd} y1={roofTopY} x2={fgfPeakX} y2={fgfRidgeY} stroke="black" strokeWidth="3" />
                  <line x1={fgfPeakX} y1={fgfRidgeY} x2={fgfRightFlatStart} y2={roofTopY} stroke="black" strokeWidth="3" />
                  <line x1={fgfLeftFlatEnd + 2} y1={roofTopY + 4} x2={fgfPeakX} y2={fgfRidgeY + 4} stroke="black" strokeWidth="1" opacity="0.5" />
                  <line x1={fgfPeakX} y1={fgfRidgeY + 4} x2={fgfRightFlatStart - 2} y2={roofTopY + 4} stroke="black" strokeWidth="1" opacity="0.5" />

                  {/* Ridge cap */}
                  <rect x={fgfPeakX - 10} y={fgfRidgeY - 5} width={20} height={9} fill="white" stroke="black" strokeWidth="2" rx="2" />
                  <text x={fgfPeakX} y={fgfRidgeY + 2} fontSize="6" fill="#333" fontFamily="sans-serif" textAnchor="middle">RIDGE</text>

                  {/* Transition lines (where flat meets gable) */}
                  <line x1={fgfLeftFlatEnd} y1={roofTopY - 12} x2={fgfLeftFlatEnd} y2={roofTopY} stroke="black" strokeWidth="2" />
                  <line x1={fgfRightFlatStart} y1={roofTopY - 12} x2={fgfRightFlatStart} y2={roofTopY} stroke="black" strokeWidth="2" />

                  {/* Section labels */}
                  <text x={fgfPeakX} y={roofTopY + 20} fontSize="7" fill="#555" fontFamily="sans-serif" textAnchor="middle">GABLE (centre)</text>
                </g>
              ) : isDutchGable ? (
                /* ─── DUTCH GABLE: flat top + trapezoidal gable below ─── */
                <g>
                  {/* Dutch Gable infill panel (trapezoid: flat top, sloped sides) */}
                  <path
                    d={`M ${leftEaveX} ${roofTopY} L ${peakX - dutchFlatWidth / 2} ${dutchBreakY} L ${peakX + dutchFlatWidth / 2} ${dutchBreakY} L ${rightEaveX} ${roofTopY} Z`}
                    fill="#e8f0f8"
                    stroke="none"
                  />
                  {/* Flat roof section above the gable (hip-like) */}
                  <rect
                    x={peakX - dutchFlatWidth / 2 - 10}
                    y={ridgeY - 2}
                    width={dutchFlatWidth + 20}
                    height={dutchBreakY - ridgeY + 2}
                    fill="#d4e4f0"
                    stroke="none"
                    opacity="0.7"
                  />
                  {/* Flat roof panel outline */}
                  <rect
                    x={peakX - dutchFlatWidth / 2 - 10}
                    y={ridgeY - 2}
                    width={dutchFlatWidth + 20}
                    height={dutchBreakY - ridgeY + 2}
                    fill="none"
                    stroke="black"
                    strokeWidth="1.5"
                  />
                  {/* Roof ribs on flat section */}
                  {Array.from({ length: 4 }, (_, i) => {
                    const x = (peakX - dutchFlatWidth / 2 - 10) + ((i + 1) / 5) * (dutchFlatWidth + 20);
                    return (
                      <line
                        key={`dutch-rib-${i}`}
                        x1={x}
                        y1={ridgeY - 2}
                        x2={x}
                        y2={dutchBreakY}
                        stroke="black"
                        strokeWidth="0.4"
                        opacity="0.2"
                      />
                    );
                  })}
                  {/* Ridge cap (flat section) */}
                  <line
                    x1={peakX - dutchFlatWidth / 2}
                    y1={ridgeY}
                    x2={peakX + dutchFlatWidth / 2}
                    y2={ridgeY}
                    stroke="black"
                    strokeWidth="3"
                  />
                  <text
                    x={peakX}
                    y={ridgeY - 6}
                    fontSize="7"
                    fill="#333"
                    fontFamily="sans-serif"
                    textAnchor="middle"
                  >
                    RIDGE (flat)
                  </text>

                  {/* Decorative mullions in trapezoidal gable section */}
                  {Array.from({ length: 5 }, (_, i) => {
                    const t = (i + 1) / 6;
                    const x = leftEaveX + t * (rightEaveX - leftEaveX);
                    // Calculate top Y on the trapezoid edges
                    const leftHipX = peakX - dutchFlatWidth / 2;
                    const rightHipX = peakX + dutchFlatWidth / 2;
                    let topY: number;
                    if (x <= leftHipX) {
                      const tSlope = (x - leftEaveX) / (leftHipX - leftEaveX);
                      topY = roofTopY + tSlope * (dutchBreakY - roofTopY);
                    } else if (x >= rightHipX) {
                      const tSlope = (x - rightHipX) / (rightEaveX - rightHipX);
                      topY = dutchBreakY + tSlope * (roofTopY - dutchBreakY);
                    } else {
                      topY = dutchBreakY;
                    }
                    return (
                      <line
                        key={`dg-infill-${i}`}
                        x1={x}
                        y1={topY + 4}
                        x2={x}
                        y2={roofTopY}
                        stroke="#94b8d4"
                        strokeWidth="0.8"
                        opacity="0.5"
                      />
                    );
                  })}

                  {/* Barge boards (sloped sides of trapezoid) */}
                  <line
                    x1={leftEaveX}
                    y1={roofTopY}
                    x2={peakX - dutchFlatWidth / 2}
                    y2={dutchBreakY}
                    stroke="black"
                    strokeWidth="3"
                  />
                  <line
                    x1={peakX + dutchFlatWidth / 2}
                    y1={dutchBreakY}
                    x2={rightEaveX}
                    y2={roofTopY}
                    stroke="black"
                    strokeWidth="3"
                  />
                  {/* Barge board inner edge */}
                  <line
                    x1={leftEaveX + 3}
                    y1={roofTopY + 5}
                    x2={peakX - dutchFlatWidth / 2 + 2}
                    y2={dutchBreakY + 5}
                    stroke="black"
                    strokeWidth="1"
                    opacity="0.5"
                  />
                  <line
                    x1={peakX + dutchFlatWidth / 2 - 2}
                    y1={dutchBreakY + 5}
                    x2={rightEaveX - 3}
                    y2={roofTopY + 5}
                    stroke="black"
                    strokeWidth="1"
                    opacity="0.5"
                  />

                  {/* Hip break horizontal line */}
                  <line
                    x1={peakX - dutchFlatWidth / 2}
                    y1={dutchBreakY}
                    x2={peakX + dutchFlatWidth / 2}
                    y2={dutchBreakY}
                    stroke="black"
                    strokeWidth="2"
                  />
                  <text
                    x={peakX}
                    y={dutchBreakY + 12}
                    fontSize="7"
                    fill="#555"
                    fontFamily="sans-serif"
                    textAnchor="middle"
                  >
                    HIP BREAK
                  </text>
                </g>
              ) : (
                /* ─── STANDARD GABLE: triangular infill to single apex ─── */
                <g>
                  {/* Triangular Infill Panel */}
                  <path
                    d={`M ${leftEaveX} ${roofTopY} L ${peakX} ${ridgeY} L ${rightEaveX} ${roofTopY} Z`}
                    fill="#e8f0f8"
                    stroke="none"
                  />
                  {/* Infill panel lines (decorative vertical mullions) */}
                  {Array.from({ length: 5 }, (_, i) => {
                    const t = (i + 1) / 6;
                    const x = leftEaveX + t * (rightEaveX - leftEaveX);
                    const midX = peakX;
                    let topY: number;
                    if (x <= midX) {
                      const tSlope = (x - leftEaveX) / (midX - leftEaveX);
                      topY = roofTopY + tSlope * (ridgeY - roofTopY);
                    } else {
                      const tSlope = (x - midX) / (rightEaveX - midX);
                      topY = ridgeY + tSlope * (roofTopY - ridgeY);
                    }
                    return (
                      <line
                        key={`infill-${i}`}
                        x1={x}
                        y1={topY + 4}
                        x2={x}
                        y2={roofTopY}
                        stroke="#94b8d4"
                        strokeWidth="0.8"
                        opacity="0.6"
                      />
                    );
                  })}

                  {/* Barge Boards */}
                  <line x1={leftEaveX} y1={roofTopY} x2={peakX} y2={ridgeY} stroke="black" strokeWidth="3" />
                  <line x1={peakX} y1={ridgeY} x2={rightEaveX} y2={roofTopY} stroke="black" strokeWidth="3" />
                  <line x1={leftEaveX + 3} y1={roofTopY + 5} x2={peakX} y2={ridgeY + 5} stroke="black" strokeWidth="1" opacity="0.5" />
                  <line x1={peakX} y1={ridgeY + 5} x2={rightEaveX - 3} y2={roofTopY + 5} stroke="black" strokeWidth="1" opacity="0.5" />

                  {/* Ridge Cap */}
                  <rect x={peakX - 12} y={ridgeY - 6} width={24} height={10} fill="white" stroke="black" strokeWidth="2" rx="2" />
                  <text x={peakX} y={ridgeY + 2} fontSize="6" fill="#333" fontFamily="sans-serif" textAnchor="middle">RIDGE</text>

                  {/* Roof sheet panels (left slope) */}
                  {Array.from({ length: 6 }, (_, i) => {
                    const t = (i + 1) / 7;
                    const x1 = leftEaveX + t * (peakX - leftEaveX);
                    const y1 = roofTopY + t * (ridgeY - roofTopY);
                    return (
                      <line key={`lrib-${i}`} x1={x1} y1={y1} x2={x1} y2={roofTopY} stroke="black" strokeWidth="0.3" opacity="0.15" />
                    );
                  })}
                  {/* Roof sheet panels (right slope) */}
                  {Array.from({ length: 6 }, (_, i) => {
                    const t = (i + 1) / 7;
                    const x1 = peakX + t * (rightEaveX - peakX);
                    const y1 = ridgeY + t * (roofTopY - ridgeY);
                    return (
                      <line key={`rrib-${i}`} x1={x1} y1={y1} x2={x1} y2={roofTopY} stroke="black" strokeWidth="0.3" opacity="0.15" />
                    );
                  })}
                </g>
              )}

              {/* ─── Gutter (at eave level, below barge boards) ─── */}
              <rect
                x={leftEaveX}
                y={roofTopY}
                width={rightEaveX - leftEaveX}
                height="8"
                fill="none"
                stroke="black"
                strokeWidth="1.5"
                rx="1"
              />
              <text
                x={margin + structureVisualWidth / 2}
                y={roofTopY + 7}
                fontSize="7"
                fill="#666"
                fontFamily="sans-serif"
                textAnchor="middle"
              >
                GUTTER
              </text>

              {/* ─── Beam (follows slope from ridge/break to eave on each side) ─── */}
              {isSplitGable ? (
                <g>
                  {/* Left gable beams */}
                  <line x1={margin} y1={beamTopY} x2={sgLeftPeakX} y2={sgRidgeY + 8} stroke="black" strokeWidth="2.5" />
                  <line x1={sgLeftPeakX} y1={sgRidgeY + 8} x2={sgValleyX} y2={beamTopY} stroke="black" strokeWidth="2.5" />
                  {/* Right gable beams */}
                  <line x1={sgValleyX} y1={beamTopY} x2={sgRightPeakX} y2={sgRidgeY + 8} stroke="black" strokeWidth="2.5" />
                  <line x1={sgRightPeakX} y1={sgRidgeY + 8} x2={margin + structureVisualWidth} y2={beamTopY} stroke="black" strokeWidth="2.5" />
                  <text x={margin + 30} y={beamTopY + 15} fontSize="7" fill="#666" fontFamily="sans-serif">BEAM (split gable)</text>
                </g>
              ) : isFlatGableFlat ? (
                <g>
                  {/* Left flat beam */}
                  <rect x={margin} y={beamTopY} width={fgfLeftFlatEnd - margin} height={18} fill="none" stroke="black" strokeWidth="2" />
                  {/* Centre gable beams (sloped) */}
                  <line x1={fgfLeftFlatEnd} y1={beamTopY} x2={fgfPeakX} y2={fgfRidgeY + 8} stroke="black" strokeWidth="2.5" />
                  <line x1={fgfPeakX} y1={fgfRidgeY + 8} x2={fgfRightFlatStart} y2={beamTopY} stroke="black" strokeWidth="2.5" />
                  {/* Right flat beam */}
                  <rect x={fgfRightFlatStart} y={beamTopY} width={margin + structureVisualWidth - fgfRightFlatStart} height={18} fill="none" stroke="black" strokeWidth="2" />
                  <text x={margin + 30} y={beamTopY + 13} fontSize="7" fill="#666" fontFamily="sans-serif">BEAM</text>
                  <text x={fgfPeakX} y={beamTopY + 30} fontSize="7" fill="#666" fontFamily="sans-serif" textAnchor="middle">BEAM (sloped)</text>
                </g>
              ) : isDutchGable ? (
                <g>
                  {/* Left slope beam */}
                  <line x1={margin} y1={beamTopY} x2={peakX - dutchFlatWidth / 2} y2={dutchBreakY + 8} stroke="black" strokeWidth="2.5" />
                  {/* Flat top beam */}
                  <line x1={peakX - dutchFlatWidth / 2} y1={dutchBreakY + 8} x2={peakX + dutchFlatWidth / 2} y2={dutchBreakY + 8} stroke="black" strokeWidth="2.5" />
                  {/* Right slope beam */}
                  <line x1={peakX + dutchFlatWidth / 2} y1={dutchBreakY + 8} x2={margin + structureVisualWidth} y2={beamTopY} stroke="black" strokeWidth="2.5" />
                  <text x={margin + 50} y={beamTopY + 15} fontSize="8" fill="#666" fontFamily="sans-serif">BEAM (dutch gable)</text>
                </g>
              ) : (
                <g>
                  <line x1={margin} y1={beamTopY} x2={peakX} y2={ridgeY + 8} stroke="black" strokeWidth="2.5" />
                  <line x1={peakX} y1={ridgeY + 8} x2={margin + structureVisualWidth} y2={beamTopY} stroke="black" strokeWidth="2.5" />
                  <text x={margin + 50} y={beamTopY + 15} fontSize="8" fill="#666" fontFamily="sans-serif">BEAM (follows slope)</text>
                </g>
              )}

              {/* ─── Pitch dimension indicator ─── */}
              <g>
                {(() => {
                  const pitchX = isSplitGable ? sgLeftPeakX : isFlatGableFlat ? fgfPeakX : peakX;
                  const pitchTopY = isSplitGable ? sgRidgeY : isFlatGableFlat ? fgfRidgeY : ridgeY;
                  return (
                    <>
                      <line
                        x1={pitchX}
                        y1={pitchTopY}
                        x2={pitchX}
                        y2={roofTopY}
                        stroke="black"
                        strokeWidth="0.8"
                        strokeDasharray="3 2"
                      />
                      <text
                        x={pitchX + 15}
                        y={pitchTopY + (roofTopY - pitchTopY) / 2}
                        fontSize="9"
                        fill="#333"
                        fontFamily="sans-serif"
                      >
                        {pitchDeg}°
                      </text>
                    </>
                  );
                })()}
              </g>
            </g>
          ) : (
            /* ═══════════════════════════════════════════════════════════════
               FLAT/SKILLION ROOF RENDERING (original)
            ═══════════════════════════════════════════════════════════════ */
            <g>
              {/* ─── Roof (sits on top of beam, no gap) ─── */}
              <rect
                x={margin - overhangPx}
                y={roofTopY - 12}
                width={structureVisualWidth + overhangPx * 2}
                height="12"
                fill="none"
                stroke="black"
                strokeWidth="2"
              />
              {/* Roof sheet ribs */}
              {Array.from({ length: 12 }, (_, i) => {
                const x = margin - overhangPx + ((i + 1) / 13) * (structureVisualWidth + overhangPx * 2);
                return <line key={`roof-rib-${i}`} x1={x} y1={roofTopY - 12} x2={x} y2={roofTopY} stroke="black" strokeWidth="0.4" opacity="0.3" />;
              })}

              {/* ─── Gutter (hangs below roof edge) ─── */}
              <rect
                x={margin - overhangPx}
                y={roofTopY}
                width={structureVisualWidth + overhangPx * 2}
                height="8"
                fill="none"
                stroke="black"
                strokeWidth="1.5"
                rx="1"
              />
              <text
                x={margin + structureVisualWidth / 2}
                y={roofTopY + 7}
                fontSize="7"
                fill="#666"
                fontFamily="sans-serif"
                textAnchor="middle"
              >
                GUTTER
              </text>

              {/* ─── Beam (flush with roof underside) ─── */}
              <rect
                x={margin}
                y={beamTopY}
                width={structureVisualWidth}
                height="18"
                fill="none"
                stroke="black"
                strokeWidth="2"
              />
              <text
                x={margin + structureVisualWidth / 2}
                y={beamTopY + 13}
                fontSize="9"
                fill="#666"
                fontFamily="sans-serif"
                textAnchor="middle"
              >
                BEAM
              </text>
            </g>
          )}

          {/* ─── Posts (dynamic count and position) ─── */}
          {posts.map((x, i) => (
            <g key={`post-${i}`}>
              <rect
                x={x - 7}
                y={beamTopY + (isGable ? 8 : 18)}
                width="14"
                height={floorY - beamTopY - (isGable ? 8 : 18)}
                fill="none"
                stroke="black"
                strokeWidth="2"
              />
              {/* Post label */}
              <text
                x={x}
                y={floorY + 15}
                fontSize="8"
                fill="#666"
                fontFamily="sans-serif"
                textAnchor="middle"
              >
                P{i + 1}
              </text>
            </g>
          ))}

          {/* ─── Floor Level line ─── */}
          <line x1={margin - 20} y1={floorY} x2={margin + structureVisualWidth + 20} y2={floorY} stroke="black" strokeWidth="1.5" />

          {/* ─── Dimension: Overall Width (below floor) ─── */}
          <line
            x1={margin}
            y1={floorY + 35}
            x2={margin + structureVisualWidth}
            y2={floorY + 35}
            stroke="black"
            strokeWidth="1"
            markerStart="url(#feArrowLeft)"
            markerEnd="url(#feArrowRight)"
          />
          <line x1={margin} y1={floorY + 5} x2={margin} y2={floorY + 40} stroke="black" strokeWidth="0.5" strokeDasharray="2 2" />
          <line x1={margin + structureVisualWidth} y1={floorY + 5} x2={margin + structureVisualWidth} y2={floorY + 40} stroke="black" strokeWidth="0.5" strokeDasharray="2 2" />

          {/* ─── Dimension: Beam Height (left side) ─── */}
          <line
            x1={margin - 40}
            y1={beamTopY}
            x2={margin - 40}
            y2={floorY}
            stroke="black"
            strokeWidth="1"
            markerStart="url(#feArrowUp)"
            markerEnd="url(#feArrowDown)"
          />
          <line x1={margin - 45} y1={beamTopY} x2={margin - 5} y2={beamTopY} stroke="black" strokeWidth="0.5" strokeDasharray="2 2" />
          <line x1={margin - 45} y1={floorY} x2={margin - 5} y2={floorY} stroke="black" strokeWidth="0.5" strokeDasharray="2 2" />

          {/* ─── Dimension: Post Spacing (between first two posts) ─── */}
          {numPosts >= 2 && (
            <g>
              <line
                x1={posts[0]}
                y1={isGable ? ridgeY - 15 : beamTopY - 20}
                x2={posts[1]}
                y2={isGable ? ridgeY - 15 : beamTopY - 20}
                stroke="black"
                strokeWidth="1"
                markerStart="url(#feArrowLeft)"
                markerEnd="url(#feArrowRight)"
              />
              <line x1={posts[0]} y1={isGable ? ridgeY - 20 : beamTopY - 25} x2={posts[0]} y2={isGable ? ridgeY - 5 : beamTopY - 5} stroke="black" strokeWidth="0.5" strokeDasharray="2 2" />
              <line x1={posts[1]} y1={isGable ? ridgeY - 20 : beamTopY - 25} x2={posts[1]} y2={isGable ? ridgeY - 5 : beamTopY - 5} stroke="black" strokeWidth="0.5" strokeDasharray="2 2" />
            </g>
          )}

          {/* ─── Overhang dimension (right side) ─── */}
          {overhangPx > 2 && !isGable && (
            <g>
              <line
                x1={margin + structureVisualWidth}
                y1={roofTopY - 22}
                x2={margin + structureVisualWidth + overhangPx}
                y2={roofTopY - 22}
                stroke="black"
                strokeWidth="0.8"
                markerStart="url(#feArrowLeft)"
                markerEnd="url(#feArrowRight)"
              />
            </g>
          )}

          {/* ─── Gable ridge height dimension (right side) ─── */}
          {isGable && gableRisePx > 5 && (
            <g>
              <line
                x1={margin + structureVisualWidth + 30}
                y1={ridgeY}
                x2={margin + structureVisualWidth + 30}
                y2={roofTopY}
                stroke="black"
                strokeWidth="1"
                markerStart="url(#feArrowUp)"
                markerEnd="url(#feArrowDown)"
              />
              <line x1={margin + structureVisualWidth + 25} y1={ridgeY} x2={margin + structureVisualWidth + 35} y2={ridgeY} stroke="black" strokeWidth="0.5" strokeDasharray="2 2" />
              <line x1={margin + structureVisualWidth + 25} y1={roofTopY} x2={margin + structureVisualWidth + 35} y2={roofTopY} stroke="black" strokeWidth="0.5" strokeDasharray="2 2" />
              <text
                x={margin + structureVisualWidth + 42}
                y={(ridgeY + roofTopY) / 2 + 3}
                fontSize="8"
                fill="black"
                fontFamily="sans-serif"
              >
                Rise
              </text>
            </g>
          )}

          {/* ─── Labels ─── */}
          <text x="15" y={(beamTopY + floorY) / 2 - 5} fontSize="11" fontWeight="bold" fill="black" fontFamily="sans-serif">Beam</text>
          <text x="15" y={(beamTopY + floorY) / 2 + 9} fontSize="11" fontWeight="bold" fill="black" fontFamily="sans-serif">Height</text>
          <text x={margin + structureVisualWidth / 2 - 30} y={floorY + 50} fontSize="11" fontWeight="bold" fill="black" fontFamily="sans-serif">Structure Width</text>
          <text x={(posts[0] + posts[1]) / 2 - 25} y={isGable ? ridgeY - 22 : beamTopY - 28} fontSize="10" fontWeight="bold" fill="black" fontFamily="sans-serif">Post Spacing</text>
          {!isGable && <text x={margin + structureVisualWidth + 15} y={roofTopY - 6} fontSize="10" fontWeight="bold" fill="black" fontFamily="sans-serif">Overhang</text>}
          <text x={margin + structureVisualWidth + 15} y={beamTopY + 13} fontSize="10" fontWeight="bold" fill="black" fontFamily="sans-serif">Beam Size</text>
          <text x={posts[numPosts - 1] + 20} y={(beamTopY + floorY) / 2 + 4} fontSize="10" fontWeight="bold" fill="black" fontFamily="sans-serif">Post Size</text>
          <text x={margin + structureVisualWidth + 15} y={roofTopY + 6} fontSize="10" fontWeight="bold" fill="black" fontFamily="sans-serif">Gutter</text>
        </svg>
      </div>

      {/* ─── RIGHT: Fields Table ─── */}
      <div className="w-full lg:w-[280px] shrink-0">
        <div className="border rounded-md overflow-hidden">
          <div className="bg-slate-50 px-3 py-2 border-b">
            <span className="text-xs font-semibold text-slate-700 uppercase tracking-wide">Parameters</span>
          </div>
          <div className="divide-y">
            {/* Post Count */}
            <div className="flex items-center gap-2 px-3 py-2">
              <label className="text-xs text-slate-600 w-24 shrink-0 flex items-center gap-1">Posts <ParamTip tip="Number of vertical support posts across the front span" /></label>
              {readOnly ? (
                <span className="text-xs font-medium">{postCount || "—"} posts</span>
              ) : (
                <Select value={postCount} onValueChange={onPostCountChange}>
                  <SelectTrigger className="h-7 text-xs flex-1">
                    <SelectValue placeholder="Posts" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="2">2 Posts</SelectItem>
                    <SelectItem value="3">3 Posts</SelectItem>
                    <SelectItem value="4">4 Posts</SelectItem>
                    <SelectItem value="5">5 Posts</SelectItem>
                    <SelectItem value="6">6 Posts</SelectItem>
                    <SelectItem value="7">7 Posts</SelectItem>
                    <SelectItem value="8">8 Posts</SelectItem>
                  </SelectContent>
                </Select>
              )}
            </div>

            {/* Structure Width */}
            <div className="flex items-center gap-2 px-3 py-2">
              <label className="text-xs text-slate-600 w-24 shrink-0 flex items-center gap-1">Span Width <ParamTip tip="Overall width of the structure from left post to right post (mm)" /></label>
              {readOnly ? (
                <span className="text-xs font-medium">{structureWidth || "—"} mm</span>
              ) : (
                <Input
                  className="h-7 text-xs flex-1"
                  value={structureWidth}
                  onChange={(e) => onStructureWidthChange(e.target.value)}
                  placeholder="mm"
                />
              )}
            </div>

            {/* Beam Height */}
            <div className="flex items-center gap-2 px-3 py-2">
              <label className="text-xs text-slate-600 w-24 shrink-0 flex items-center gap-1">Beam Height <ParamTip tip="Height from finished floor level to the underside of the beam (mm)" /></label>
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

            {/* Post Spacing */}
            <div className="flex items-center gap-2 px-3 py-2">
              <label className="text-xs text-slate-600 w-24 shrink-0 flex items-center gap-1">Post Spacing <ParamTip tip="Centre-to-centre distance between adjacent posts (mm)" /></label>
              {readOnly ? (
                <span className="text-xs font-medium">{postSpacing || "—"} mm</span>
              ) : (
                <Input
                  className="h-7 text-xs flex-1"
                  value={postSpacing}
                  onChange={(e) => onPostSpacingChange(e.target.value)}
                  placeholder="mm"
                />
              )}
            </div>

            {/* Roof Overhang */}
            <div className="flex items-center gap-2 px-3 py-2">
              <label className="text-xs text-slate-600 w-24 shrink-0 flex items-center gap-1">Overhang <ParamTip tip="Distance the roof extends beyond the outer beam/post line (mm)" /></label>
              {readOnly ? (
                <span className="text-xs font-medium">{roofOverhang || "—"} mm</span>
              ) : (
                <Input
                  className="h-7 text-xs flex-1"
                  value={roofOverhang}
                  onChange={(e) => onRoofOverhangChange(e.target.value)}
                  placeholder="mm"
                />
              )}
            </div>

            {/* Beam Size */}
            <div className="flex items-center gap-2 px-3 py-2">
              <label className="text-xs text-slate-600 w-24 shrink-0 flex items-center gap-1">Beam Size <ParamTip tip="Cross-section dimensions of the main beam (width × depth in mm)" /></label>
              {readOnly ? (
                <span className="text-xs font-medium">{beamSize || "—"}</span>
              ) : (
                <Select value={beamSize} onValueChange={onBeamSizeChange}>
                  <SelectTrigger className="h-7 text-xs flex-1">
                    <SelectValue placeholder="Size" />
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
            </div>

            {/* Post Size */}
            <div className="flex items-center gap-2 px-3 py-2">
              <label className="text-xs text-slate-600 w-24 shrink-0 flex items-center gap-1">Post Size <ParamTip tip="Cross-section dimensions of the support posts (square section in mm)" /></label>
              {readOnly ? (
                <span className="text-xs font-medium">{postSize || "—"}</span>
              ) : (
                <Select value={postSize} onValueChange={onPostSizeChange}>
                  <SelectTrigger className="h-7 text-xs flex-1">
                    <SelectValue placeholder="Size" />
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
              <label className="text-xs text-slate-600 w-24 shrink-0 flex items-center gap-1">Gutter <ParamTip tip="Gutter profile type along the front edge of the roof" /></label>
              {readOnly ? (
                <span className="text-xs font-medium">{gutterType || "—"}</span>
              ) : (
                <Select value={gutterType} onValueChange={onGutterTypeChange}>
                  <SelectTrigger className="h-7 text-xs flex-1">
                    <SelectValue placeholder="Type" />
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
          </div>
        </div>
      </div>
      </div>

      <p className="text-[10px] text-muted-foreground mt-2">
        {readOnly
          ? "Values from the original spec sheet. Post positions and beam height reflect entered measurements."
          : isGable
            ? "Gable roof: triangular infill panel, barge boards, and ridge cap shown. Beams follow the roof slope."
            : "Fill in the fields on the right. Post positions and beam height adjust dynamically as you enter values."}
      </p>
    </div>
  );
}
