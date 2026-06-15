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

interface CrossSectionDiagramProps {
  roofPitch: string;
  houseRoofType: string;
  cutBackEave: string;
  removeGutterFlash: string;
  houseWallType: string;
  fallOnGround: string;
  groundLevel: string;
  onRoofPitchChange: (v: string) => void;
  onHouseRoofTypeChange: (v: string) => void;
  onCutBackEaveChange: (v: string) => void;
  onRemoveGutterFlashChange: (v: string) => void;
  onHouseWallTypeChange: (v: string) => void;
  onFallOnGroundChange: (v: string) => void;
  onGroundLevelChange: (v: string) => void;
  readOnly?: boolean;
  /** Connection type code for the bracket annotation (FLY, BCH, WFX, GBL, FSS, POP) */
  connectionType?: string;
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

export default function CrossSectionDiagram({
  roofPitch,
  houseRoofType,
  cutBackEave,
  removeGutterFlash,
  houseWallType,
  fallOnGround,
  groundLevel,
  onRoofPitchChange,
  onHouseRoofTypeChange,
  onCutBackEaveChange,
  onRemoveGutterFlashChange,
  onHouseWallTypeChange,
  onFallOnGroundChange,
  onGroundLevelChange,
  readOnly = false,
  connectionType,
}: CrossSectionDiagramProps) {
  // Dynamic roof angle based on pitch value
  const pitchDeg = useMemo(() => {
    return Math.min(35, Math.max(3, parseFloat(roofPitch) || 10));
  }, [roofPitch]);

  // Dynamic ground fall
  const fallPx = useMemo(() => {
    const mm = parseFloat(fallOnGround) || 0;
    return Math.min(30, Math.max(0, mm / 8));
  }, [fallOnGround]);

  // Dynamic ground level drop
  const groundDropPx = useMemo(() => {
    const mm = parseFloat(groundLevel) || 150;
    return Math.min(80, Math.max(30, (mm / 400) * 80));
  }, [groundLevel]);

  // Calculate roof line end points based on pitch
  const pitchRad = (pitchDeg * Math.PI) / 180;
  const wallTopX = 380;
  const wallTopY = 180;
  const roofRunH = 180;
  const roofRise = Math.tan(pitchRad) * roofRunH;
  const roofStartX = wallTopX - roofRunH;
  const roofStartY = wallTopY - roofRise;

  // Eave extends right from wall top to fascia
  const fasciaX = wallTopX + 70;

  // The EAVE LEVEL is where the fascia bottom sits — the new beam connects HERE
  // Previously the beam was at wallTopY + 70 (below the eave), now it aligns with the eave bottom
  const eaveBottomY = wallTopY + 20; // Bottom of the eave/fascia — this is where the new roof connects
  const beamY = eaveBottomY; // Beam connects at eave level
  const beamLeftX = wallTopX + 6;
  // Connection callout circle centre
  const connCx = wallTopX + 3;
  const connCy = beamY + 10;
  const connRadius = 28;

  // Determine if we should show the connection annotation
  const showConnection = !!connectionType && connectionType !== "FSS";

  return (
    <div className="w-full border rounded-lg bg-white p-3 sm:p-4 overflow-hidden">
      <Label className="text-xs font-medium text-muted-foreground mb-3 block">
        Cross-Section Diagram {readOnly ? "(from spec sheet)" : "(fillable)"}
      </Label>

      <div className="flex flex-col lg:flex-row gap-4">
      {/* ─── LEFT: SVG Diagram ─── */}
      <div className="flex-1 min-w-0">
        <svg
          viewBox="0 0 600 700"
          className="w-full h-auto"
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* ─── Arrow markers ─── */}
          <defs>
            <marker id="csArrR" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
              <polygon points="0 0, 8 3, 0 6" fill="black" />
            </marker>
            <marker id="csArrL" markerWidth="8" markerHeight="6" refX="0" refY="3" orient="auto">
              <polygon points="8 0, 0 3, 8 6" fill="black" />
            </marker>
            <marker id="csArrU" markerWidth="6" markerHeight="8" refX="3" refY="0" orient="auto">
              <polygon points="0 8, 3 0, 6 8" fill="black" />
            </marker>
            <marker id="csArrD" markerWidth="6" markerHeight="8" refX="3" refY="8" orient="auto">
              <polygon points="0 0, 3 8, 6 0" fill="black" />
            </marker>
          </defs>

          {/* ═══ HOUSE ROOF ═══ */}
          <line
            x1={roofStartX}
            y1={roofStartY}
            x2={wallTopX}
            y2={wallTopY}
            stroke="black"
            strokeWidth="3"
          />
          {/* Roof continues to eave */}
          <line
            x1={wallTopX}
            y1={wallTopY}
            x2={fasciaX - 5}
            y2={wallTopY + 3}
            stroke="black"
            strokeWidth="2"
          />

          {/* ═══ EAVE / FASCIA ═══ */}
          <line x1={fasciaX} y1={wallTopY - 5} x2={fasciaX} y2={eaveBottomY + 4} stroke="black" strokeWidth="3.5" />
          {/* Eave soffit (dashed) — underside of eave from wall to fascia */}
          <line x1={wallTopX + 5} y1={eaveBottomY} x2={fasciaX - 2} y2={eaveBottomY} stroke="black" strokeWidth="1" strokeDasharray="4 3" />

          {/* Cut Back Eave dimension arrows */}
          <line x1={wallTopX + 5} y1={eaveBottomY + 16} x2={fasciaX - 2} y2={eaveBottomY + 16} stroke="black" strokeWidth="1" markerStart="url(#csArrL)" markerEnd="url(#csArrR)" />
          <line x1={wallTopX + 5} y1={eaveBottomY + 4} x2={wallTopX + 5} y2={eaveBottomY + 22} stroke="black" strokeWidth="0.5" strokeDasharray="2 2" />
          <line x1={fasciaX} y1={eaveBottomY + 4} x2={fasciaX} y2={eaveBottomY + 22} stroke="black" strokeWidth="0.5" strokeDasharray="2 2" />

          {/* Gutter/Flash rectangles — positioned at fascia */}
          <rect x={fasciaX + 12} y={wallTopY - 6} width="40" height="12" fill="none" stroke="black" strokeWidth="1.5" />
          <rect x={fasciaX + 12} y={wallTopY + 10} width="40" height="12" fill="none" stroke="black" strokeWidth="1.5" />

          {/* ═══ HOUSE WALL ═══ */}
          <rect x={wallTopX - 12} y={wallTopY} width="18" height="380" fill="none" stroke="black" strokeWidth="2.5" />

          {/* ═══ BEAM — connects at eave level ═══ */}
          <rect x={wallTopX + 6} y={beamY} width="160" height="20" fill="none" stroke="black" strokeWidth="2" />

          {/* Beam dimension arrow */}
          <line x1={wallTopX + 6} y1={beamY - 10} x2={wallTopX + 166} y2={beamY - 10} stroke="black" strokeWidth="1" markerStart="url(#csArrL)" markerEnd="url(#csArrR)" />

          {/* ═══ CONNECTION DETAIL ANNOTATION ═══ */}
          {showConnection && (
            <g>
              {/* Highlight circle around the connection point (beam-to-wall junction) */}
              <circle
                cx={connCx}
                cy={connCy}
                r={connRadius}
                fill="none"
                stroke="#e63946"
                strokeWidth="2"
                strokeDasharray="5 3"
              />

              {/* Leader line from circle to callout */}
              <line
                x1={connCx - connRadius * 0.7}
                y1={connCy - connRadius * 0.7}
                x2={120}
                y2={beamY - 30}
                stroke="#e63946"
                strokeWidth="1.5"
              />

              {/* Callout box */}
              <rect
                x={20}
                y={beamY - 55}
                width="140"
                height="52"
                rx="4"
                fill="white"
                stroke="#e63946"
                strokeWidth="1.5"
              />

              {/* Callout text */}
              <text x={90} y={beamY - 38} fontSize="10" fontWeight="bold" fill="#e63946" fontFamily="sans-serif" textAnchor="middle">
                CONNECTION DETAIL
              </text>
              <text x={90} y={beamY - 22} fontSize="9" fill="#333" fontFamily="sans-serif" textAnchor="middle">
                {connectionLabel(connectionType)}
              </text>
              <text x={90} y={beamY - 10} fontSize="8" fill="#666" fontFamily="sans-serif" textAnchor="middle">
                ({connectionType})
              </text>

              {/* Small bracket icon at the junction */}
              {connectionType === "FLY" && (
                <g>
                  {/* Fly-over: bracket goes over the fascia */}
                  <path
                    d={`M ${fasciaX - 4} ${beamY + 2} L ${fasciaX - 4} ${beamY - 15} L ${fasciaX + 8} ${beamY - 15} L ${fasciaX + 8} ${beamY + 2}`}
                    fill="none"
                    stroke="#e63946"
                    strokeWidth="2.5"
                  />
                  <circle cx={fasciaX - 4} cy={beamY + 2} r="2" fill="#e63946" />
                  <circle cx={fasciaX + 8} cy={beamY + 2} r="2" fill="#e63946" />
                </g>
              )}
              {connectionType === "BCH" && (
                <g>
                  {/* Fascia bracket: L-bracket on fascia face */}
                  <path
                    d={`M ${fasciaX} ${beamY - 5} L ${fasciaX} ${beamY + 15} L ${fasciaX + 14} ${beamY + 15}`}
                    fill="none"
                    stroke="#e63946"
                    strokeWidth="2.5"
                  />
                  <circle cx={fasciaX} cy={beamY - 5} r="2" fill="#e63946" />
                  <circle cx={fasciaX + 14} cy={beamY + 15} r="2" fill="#e63946" />
                </g>
              )}
              {connectionType === "WFX" && (
                <g>
                  {/* Wall fix: bracket bolted to wall face */}
                  <path
                    d={`M ${wallTopX + 4} ${beamY} L ${wallTopX + 4} ${beamY + 20} L ${wallTopX + 18} ${beamY + 20}`}
                    fill="none"
                    stroke="#e63946"
                    strokeWidth="2.5"
                  />
                  <circle cx={wallTopX + 4} cy={beamY} r="2" fill="#e63946" />
                  <circle cx={wallTopX + 4} cy={beamY + 12} r="2" fill="#e63946" />
                </g>
              )}
              {connectionType === "GBL" && (
                <g>
                  {/* Gable bracket: triangular bracket */}
                  <path
                    d={`M ${wallTopX + 4} ${beamY - 8} L ${wallTopX + 4} ${beamY + 18} L ${wallTopX + 20} ${beamY + 18} Z`}
                    fill="none"
                    stroke="#e63946"
                    strokeWidth="2"
                  />
                  <circle cx={wallTopX + 4} cy={beamY - 8} r="2" fill="#e63946" />
                </g>
              )}
              {connectionType === "POP" && (
                <g>
                  {/* Pop-up bracket: vertical bracket above fascia */}
                  <rect
                    x={fasciaX - 3}
                    y={beamY - 20}
                    width="8"
                    height="22"
                    fill="none"
                    stroke="#e63946"
                    strokeWidth="2"
                  />
                  <circle cx={fasciaX + 1} cy={beamY - 10} r="2" fill="#e63946" />
                  <circle cx={fasciaX + 1} cy={beamY - 2} r="2" fill="#e63946" />
                </g>
              )}
            </g>
          )}

          {/* ═══ POST ═══ */}
          <line x1={wallTopX + 163} y1={beamY + 20} x2={wallTopX + 163} y2={wallTopY + 380} stroke="black" strokeWidth="2.5" />

          {/* ═══ FLOOR LEVEL ═══ */}
          <line x1={wallTopX - 25} y1={wallTopY + 380} x2={wallTopX + 190} y2={wallTopY + 380} stroke="black" strokeWidth="2" />

          {/* ═══ GROUND LEVEL ═══ */}
          <line
            x1={wallTopX + 60}
            y1={wallTopY + 380 + groundDropPx}
            x2={wallTopX + 220}
            y2={wallTopY + 380 + groundDropPx + fallPx}
            stroke="black"
            strokeWidth="2"
          />

          {/* Ground level vertical dimension */}
          <line
            x1={wallTopX + 150}
            y1={wallTopY + 380}
            x2={wallTopX + 150}
            y2={wallTopY + 380 + groundDropPx + (fallPx / 2)}
            stroke="black"
            strokeWidth="1"
            markerStart="url(#csArrU)"
            markerEnd="url(#csArrD)"
          />

          {/* ═══ LABELS ═══ */}
          <text x="80" y="50" fontSize="13" fontWeight="bold" fill="black" fontFamily="sans-serif">Roof Pitch</text>
          <text x={roofStartX + 60} y={roofStartY + 15} fontSize="12" fontWeight="bold" fill="black" fontFamily="sans-serif">Roof Type</text>
          <text x={wallTopX - 70} y={eaveBottomY + 12} fontSize="11" fontWeight="bold" fill="black" fontFamily="sans-serif">Cut Back</text>
          <text x={wallTopX - 70} y={eaveBottomY + 25} fontSize="11" fontWeight="bold" fill="black" fontFamily="sans-serif">Eave</text>
          <text x={fasciaX + 60} y={wallTopY - 2} fontSize="11" fontWeight="bold" fill="black" fontFamily="sans-serif">Remove gutter &amp;</text>
          <text x={fasciaX + 60} y={wallTopY + 12} fontSize="11" fontWeight="bold" fill="black" fontFamily="sans-serif">flash</text>
          <text x="60" y={wallTopY + 200} fontSize="13" fontWeight="bold" fill="black" fontFamily="sans-serif">Wall</text>
          <text x="60" y={wallTopY + 216} fontSize="13" fontWeight="bold" fill="black" fontFamily="sans-serif">Type</text>
          <text x={wallTopX + 40} y={wallTopY + 310} fontSize="11" fontWeight="bold" fill="black" fontFamily="sans-serif">Fall on Ground from</text>
          <text x={wallTopX + 40} y={wallTopY + 324} fontSize="11" fontWeight="bold" fill="black" fontFamily="sans-serif">wall to Posts</text>
          <text x={wallTopX - 20} y={wallTopY + 398} fontSize="11" fill="black" fontFamily="sans-serif">Floor level</text>
          <text x={wallTopX + 160} y={wallTopY + 390 + groundDropPx + (fallPx / 2)} fontSize="11" fontWeight="bold" fill="black" fontFamily="sans-serif">Ground level</text>
        </svg>
      </div>

      {/* ─── RIGHT: Fields Table ─── */}
      <div className="w-full lg:w-[280px] shrink-0">
        <div className="border rounded-md overflow-hidden">
          <div className="bg-slate-50 px-3 py-2 border-b">
            <span className="text-xs font-semibold text-slate-700 uppercase tracking-wide">Parameters</span>
          </div>
          <div className="divide-y">
            {/* Roof Pitch */}
            <div className="flex items-center gap-2 px-3 py-2">
              <label className="text-xs text-slate-600 w-24 shrink-0 flex items-center gap-1">Roof Pitch <ParamTip tip="Pitch angle of the existing house roof in degrees" /></label>
              {readOnly ? (
                <span className="text-xs font-medium">{roofPitch || "—"}°</span>
              ) : (
                <Input
                  className="h-7 text-xs flex-1"
                  value={roofPitch}
                  onChange={(e) => onRoofPitchChange(e.target.value)}
                  placeholder="e.g. 15°"
                />
              )}
            </div>

            {/* House Roof Type */}
            <div className="flex items-center gap-2 px-3 py-2">
              <label className="text-xs text-slate-600 w-24 shrink-0 flex items-center gap-1">Roof Type <ParamTip tip="Material type of the existing house roof (affects connection method)" /></label>
              {readOnly ? (
                <span className="text-xs font-medium">{houseRoofType || "—"}</span>
              ) : (
                <Select value={houseRoofType} onValueChange={onHouseRoofTypeChange}>
                  <SelectTrigger className="h-7 text-xs flex-1">
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Tile">Tile</SelectItem>
                    <SelectItem value="Metal">Metal</SelectItem>
                    <SelectItem value="Flat">Flat</SelectItem>
                    <SelectItem value="Concrete">Concrete</SelectItem>
                    <SelectItem value="Slate">Slate</SelectItem>
                    <SelectItem value="Other">Other</SelectItem>
                  </SelectContent>
                </Select>
              )}
            </div>

            {/* Cut Back Eave */}
            <div className="flex items-center gap-2 px-3 py-2">
              <label className="text-xs text-slate-600 w-24 shrink-0 flex items-center gap-1">Cut Back Eave <ParamTip tip="Distance the existing eave is cut back to allow the new structure to connect" /></label>
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

            {/* Remove Gutter & Flash */}
            <div className="flex items-center gap-2 px-3 py-2">
              <label className="text-xs text-slate-600 w-24 shrink-0 flex items-center gap-1">Remove Gutter <ParamTip tip="Whether the existing house gutter and flashing need to be removed for the connection" /></label>
              {readOnly ? (
                <span className="text-xs font-medium">{removeGutterFlash || "—"}</span>
              ) : (
                <Select value={removeGutterFlash} onValueChange={onRemoveGutterFlashChange}>
                  <SelectTrigger className="h-7 text-xs flex-1">
                    <SelectValue placeholder="Y/N" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Yes">Yes</SelectItem>
                    <SelectItem value="No">No</SelectItem>
                    <SelectItem value="Partial">Partial</SelectItem>
                  </SelectContent>
                </Select>
              )}
            </div>

            {/* Wall Type */}
            <div className="flex items-center gap-2 px-3 py-2">
              <label className="text-xs text-slate-600 w-24 shrink-0 flex items-center gap-1">Wall Type <ParamTip tip="Construction type of the existing house wall at the connection point" /></label>
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
                    <SelectItem value="Rendered">Rendered</SelectItem>
                    <SelectItem value="Weatherboard">Weatherboard</SelectItem>
                    <SelectItem value="Hebel">Hebel</SelectItem>
                    <SelectItem value="Cladding">Cladding</SelectItem>
                    <SelectItem value="Concrete Block">Concrete Block</SelectItem>
                    <SelectItem value="Other">Other</SelectItem>
                  </SelectContent>
                </Select>
              )}
            </div>

            {/* Fall on Ground */}
            <div className="flex items-center gap-2 px-3 py-2">
              <label className="text-xs text-slate-600 w-24 shrink-0 flex items-center gap-1">Ground Fall <ParamTip tip="Height difference between ground level at the wall vs at the posts (slope away from house)" /></label>
              {readOnly ? (
                <span className="text-xs font-medium">{fallOnGround || "—"} mm</span>
              ) : (
                <Input
                  className="h-7 text-xs flex-1"
                  value={fallOnGround}
                  onChange={(e) => onFallOnGroundChange(e.target.value)}
                  placeholder="mm"
                />
              )}
            </div>

            {/* Ground Level */}
            <div className="flex items-center gap-2 px-3 py-2">
              <label className="text-xs text-slate-600 w-24 shrink-0 flex items-center gap-1">Ground Level <ParamTip tip="Distance from finished floor level down to natural ground level (mm)" /></label>
              {readOnly ? (
                <span className="text-xs font-medium">{groundLevel || "—"} mm</span>
              ) : (
                <Input
                  className="h-7 text-xs flex-1"
                  value={groundLevel}
                  onChange={(e) => onGroundLevelChange(e.target.value)}
                  placeholder="mm"
                />
              )}
            </div>

            {/* Connection Type (read-only display) */}
            {connectionType && connectionType !== "FSS" && (
              <div className="flex items-center gap-2 px-3 py-2 bg-red-50">
                <label className="text-xs text-red-700 w-24 shrink-0 font-medium">Connection</label>
                <span className="text-xs font-medium text-red-800">{connectionLabel(connectionType)} ({connectionType})</span>
              </div>
            )}
          </div>
        </div>
      </div>
      </div>

      <p className="text-[10px] text-muted-foreground mt-2">
        {readOnly
          ? "Values from the original spec sheet. Roof angle and ground slope reflect entered measurements."
          : "Fill in the fields on the right. The roof angle and ground slope update dynamically."}
      </p>
    </div>
  );
}
