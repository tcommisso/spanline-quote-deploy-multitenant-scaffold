import { useState, useMemo } from "react";
import {
  validateStructure,
  getAllBeamOptions,
  getAllPostOptions,
  getEnclosureOptions,
  getWindRegionOptions,
  type ValidationInput,
  type ValidationResult,
  type WindRegion,
  type EnclosureCondition,
  type BeamSize,
  type BeamType,
  type PostSize,
} from "../../../shared/rb100-validation";
import {
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Shield,
  ChevronDown,
  ChevronUp,
  Info,
  Lock,
  Unlock,
} from "lucide-react";
import { toast } from "sonner";

interface PatioValidationPanelProps {
  // Dimensions from the patio planner
  structureWidth: number; // mm
  roofProjection: number; // mm
  postHeight: number; // mm
  postCount: number;
  beamSpan: number; // mm (distance between posts along beam)
  // Selections
  windRegion: WindRegion;
  enclosure: EnclosureCondition;
  beamSize: BeamSize;
  beamType: BeamType;
  postSize: PostSize;
  // Lock state
  isLocked: boolean;
  onLockChange: (locked: boolean) => void;
  // Callbacks for changing selections
  onWindRegionChange: (v: WindRegion) => void;
  onEnclosureChange: (v: EnclosureCondition) => void;
  onBeamSizeChange: (v: BeamSize) => void;
  onBeamTypeChange: (v: BeamType) => void;
  onPostSizeChange: (v: PostSize) => void;
}

export function PatioValidationPanel({
  structureWidth,
  roofProjection,
  postHeight,
  postCount,
  beamSpan,
  windRegion,
  enclosure,
  beamSize,
  beamType,
  postSize,
  isLocked,
  onLockChange,
  onWindRegionChange,
  onEnclosureChange,
  onBeamSizeChange,
  onBeamTypeChange,
  onPostSizeChange,
}: PatioValidationPanelProps) {
  const [expanded, setExpanded] = useState(true);
  const [showDetails, setShowDetails] = useState<string | null>(null);

  const validationInput: ValidationInput = {
    windRegion,
    enclosure,
    beamSize,
    beamType,
    beamSpan,
    roofProjection,
    postSize,
    postHeight,
    postCount,
    structureWidth,
  };

  const results = useMemo(() => validateStructure(validationInput), [
    windRegion, enclosure, beamSize, beamType, beamSpan,
    roofProjection, postSize, postHeight, postCount, structureWidth,
  ]);

  const failCount = results.filter(r => r.severity === "fail").length;
  const warnCount = results.filter(r => r.severity === "warning").length;
  const passCount = results.filter(r => r.severity === "pass").length;

  const overallStatus = failCount > 0 ? "fail" : warnCount > 0 ? "warning" : "pass";

  const windRegionOptions = getWindRegionOptions();
  const enclosureOptions = getEnclosureOptions();
  const beamOptions = getAllBeamOptions();
  const postOptions = getAllPostOptions();

  const handleLock = () => {
    if (failCount > 0) {
      toast.error("Cannot lock engineering — resolve all failures first");
      return;
    }
    onLockChange(true);
    toast.success("Engineering locked — parameters are now read-only");
  };

  const handleUnlock = () => {
    if (confirm("Unlock engineering parameters? This will allow changes to the validated configuration.")) {
      onLockChange(false);
      toast.info("Engineering unlocked — parameters are editable");
    }
  };

  return (
    <div className={`border rounded-lg overflow-hidden bg-card ${isLocked ? "ring-2 ring-green-500/30" : ""}`}>
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-3 hover:bg-muted/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Shield className={`h-5 w-5 ${
            overallStatus === "pass" ? "text-green-500" :
            overallStatus === "warning" ? "text-amber-500" : "text-red-500"
          }`} />
          <span className="font-semibold text-sm">RB100 Engineering Validation</span>
          {isLocked && (
            <span className="bg-green-100 text-green-700 text-[10px] font-semibold px-1.5 py-0.5 rounded flex items-center gap-0.5">
              <Lock className="h-2.5 w-2.5" />
              LOCKED
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {failCount > 0 && (
            <span className="bg-red-100 text-red-700 text-xs font-medium px-2 py-0.5 rounded-full">
              {failCount} fail
            </span>
          )}
          {warnCount > 0 && (
            <span className="bg-amber-100 text-amber-700 text-xs font-medium px-2 py-0.5 rounded-full">
              {warnCount} warn
            </span>
          )}
          {passCount > 0 && failCount === 0 && warnCount === 0 && (
            <span className="bg-green-100 text-green-700 text-xs font-medium px-2 py-0.5 rounded-full">
              All pass
            </span>
          )}
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </div>
      </button>

      {expanded && (
        <div className="border-t">
          {/* Lock/Unlock Action Bar */}
          <div className="p-2 border-b bg-muted/20 flex items-center justify-between">
            {isLocked ? (
              <>
                <span className="text-xs text-green-700 flex items-center gap-1">
                  <Lock className="h-3 w-3" />
                  Engineering parameters locked after validation
                </span>
                <button
                  onClick={handleUnlock}
                  className="text-xs text-amber-600 hover:text-amber-700 font-medium flex items-center gap-1 px-2 py-1 rounded hover:bg-amber-50 transition-colors"
                >
                  <Unlock className="h-3 w-3" />
                  Unlock
                </button>
              </>
            ) : (
              <>
                <span className="text-xs text-muted-foreground">
                  {failCount === 0 ? "Ready to lock" : "Resolve failures to lock"}
                </span>
                <button
                  onClick={handleLock}
                  disabled={failCount > 0}
                  className={`text-xs font-medium flex items-center gap-1 px-2 py-1 rounded transition-colors ${
                    failCount > 0
                      ? "text-muted-foreground cursor-not-allowed"
                      : "text-green-600 hover:text-green-700 hover:bg-green-50"
                  }`}
                >
                  <Lock className="h-3 w-3" />
                  Lock Engineering
                </button>
              </>
            )}
          </div>

          {/* Engineering Parameters */}
          <div className="p-3 border-b bg-muted/30">
            <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-2">Engineering Parameters</h4>
            <div className="grid grid-cols-2 gap-2">
              {/* Wind Region */}
              <div>
                <label className="text-xs text-muted-foreground">Wind Region</label>
                <select
                  value={windRegion}
                  onChange={e => onWindRegionChange(e.target.value as WindRegion)}
                  disabled={isLocked}
                  className={`w-full text-xs border rounded px-2 py-1 bg-background ${isLocked ? "opacity-60 cursor-not-allowed" : ""}`}
                >
                  {windRegionOptions.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>

              {/* Enclosure */}
              <div>
                <label className="text-xs text-muted-foreground">Enclosure</label>
                <select
                  value={enclosure}
                  onChange={e => onEnclosureChange(e.target.value as EnclosureCondition)}
                  disabled={isLocked}
                  className={`w-full text-xs border rounded px-2 py-1 bg-background ${isLocked ? "opacity-60 cursor-not-allowed" : ""}`}
                >
                  {enclosureOptions.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label} (Cp'n {opt.cpn})</option>
                  ))}
                </select>
              </div>

              {/* Beam Size */}
              <div>
                <label className="text-xs text-muted-foreground">Beam Size</label>
                <select
                  value={beamSize}
                  onChange={e => onBeamSizeChange(e.target.value as BeamSize)}
                  disabled={isLocked}
                  className={`w-full text-xs border rounded px-2 py-1 bg-background ${isLocked ? "opacity-60 cursor-not-allowed" : ""}`}
                >
                  {beamOptions.map(opt => (
                    <option key={opt.size} value={opt.size}>{opt.label} {opt.grade}</option>
                  ))}
                </select>
              </div>

              {/* Beam Type */}
              <div>
                <label className="text-xs text-muted-foreground">Beam Type</label>
                <select
                  value={beamType}
                  onChange={e => onBeamTypeChange(e.target.value as BeamType)}
                  disabled={isLocked}
                  className={`w-full text-xs border rounded px-2 py-1 bg-background ${isLocked ? "opacity-60 cursor-not-allowed" : ""}`}
                >
                  <option value="edge-single">Edge Single</option>
                  <option value="central-double">Central Double</option>
                </select>
              </div>

              {/* Post Size */}
              <div className="col-span-2">
                <label className="text-xs text-muted-foreground">Post Size</label>
                <select
                  value={postSize}
                  onChange={e => onPostSizeChange(e.target.value as PostSize)}
                  disabled={isLocked}
                  className={`w-full text-xs border rounded px-2 py-1 bg-background ${isLocked ? "opacity-60 cursor-not-allowed" : ""}`}
                >
                  <optgroup label="Steel (Duragal)">
                    {postOptions.filter(p => p.material === "steel").map(p => (
                      <option key={p.size} value={p.size}>{p.label} ({p.capacityKN}kN, max {p.maxHeight}mm)</option>
                    ))}
                  </optgroup>
                  <optgroup label="Aluminium">
                    {postOptions.filter(p => p.material === "aluminium").map(p => (
                      <option key={p.size} value={p.size}>{p.label} ({p.capacityKN}kN, max {p.maxHeight}mm)</option>
                    ))}
                  </optgroup>
                  <optgroup label="Timber">
                    {postOptions.filter(p => p.material === "timber").map(p => (
                      <option key={p.size} value={p.size}>{p.label} ({p.capacityKN}kN, max {p.maxHeight}mm)</option>
                    ))}
                  </optgroup>
                </select>
              </div>
            </div>

            {/* Current Dimensions Summary */}
            <div className="mt-2 grid grid-cols-5 gap-1">
              <div className="text-center p-1 bg-background rounded">
                <div className="text-[10px] text-muted-foreground">Width</div>
                <div className="text-xs font-medium">{structureWidth}mm</div>
              </div>
              <div className="text-center p-1 bg-background rounded">
                <div className="text-[10px] text-muted-foreground">Projection</div>
                <div className="text-xs font-medium">{roofProjection}mm</div>
              </div>
              <div className="text-center p-1 bg-background rounded">
                <div className="text-[10px] text-muted-foreground">Post Ht</div>
                <div className="text-xs font-medium">{postHeight}mm</div>
              </div>
              <div className="text-center p-1 bg-background rounded">
                <div className="text-[10px] text-muted-foreground">Beam Span</div>
                <div className="text-xs font-medium">{beamSpan}mm</div>
              </div>
              <div className="text-center p-1 bg-background rounded">
                <div className="text-[10px] text-muted-foreground">Posts</div>
                <div className="text-xs font-medium">{postCount}</div>
              </div>
            </div>
          </div>

          {/* Validation Results */}
          <div className="p-3 space-y-2">
            <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-1">Compliance Results</h4>
            {results.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">Enter dimensions to validate</p>
            ) : (
              results.map(result => (
                <div key={result.id} className="space-y-1">
                  <button
                    onClick={() => setShowDetails(showDetails === result.id ? null : result.id)}
                    className="w-full flex items-start gap-2 text-left hover:bg-muted/30 rounded p-1.5 transition-colors"
                  >
                    {result.severity === "pass" && <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />}
                    {result.severity === "warning" && <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />}
                    {result.severity === "fail" && <XCircle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />}
                    <span className={`text-xs ${
                      result.severity === "fail" ? "text-red-700 font-medium" :
                      result.severity === "warning" ? "text-amber-700" : "text-foreground"
                    }`}>
                      {result.message}
                    </span>
                    {(result.detail || result.suggestion) && (
                      <Info className="h-3 w-3 text-muted-foreground ml-auto shrink-0 mt-0.5" />
                    )}
                  </button>

                  {showDetails === result.id && (result.detail || result.suggestion) && (
                    <div className="ml-6 p-2 bg-muted/50 rounded text-xs space-y-1">
                      {result.detail && (
                        <p className="text-muted-foreground">{result.detail}</p>
                      )}
                      {result.suggestion && (
                        <p className="text-blue-600 font-medium">
                          💡 {result.suggestion}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>

          {/* Disclaimer */}
          <div className="p-2 border-t bg-muted/20">
            <p className="text-[10px] text-muted-foreground italic text-center">
              Validation based on Altaspan RB100 tables. Always verify with qualified engineer for final design.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
