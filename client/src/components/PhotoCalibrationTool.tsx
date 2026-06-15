import { useState, useCallback, useRef, useEffect, createContext, useContext } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Ruler, X, Check } from "lucide-react";

export interface CalibrationData {
  point1: { x: number; y: number }; // percentage of container (0-100)
  point2: { x: number; y: number };
  realDistanceMm: number;
}

// ─── Shared calibration state via context ────────────────────────────────────
interface CalibrationCtx {
  isCalibrating: boolean;
  step: "point1" | "point2" | "distance";
  tempPoint1: { x: number; y: number } | null;
  tempPoint2: { x: number; y: number } | null;
  distanceInput: string;
  startCalibration: () => void;
  cancelCalibration: () => void;
  confirmCalibration: () => void;
  clearCalibration: () => void;
  setDistanceInput: (v: string) => void;
  calibrationData: CalibrationData | null;
}

const CalibrationContext = createContext<CalibrationCtx | null>(null);

interface CalibrationProviderProps {
  containerRef: React.RefObject<HTMLDivElement | null>;
  calibrationData: CalibrationData | null;
  onCalibrationChange: (data: CalibrationData | null) => void;
  onAutoScale: (pixelsPerMm: number) => void;
  photoUrl?: string | null;
  children: React.ReactNode;
}

/**
 * CalibrationProvider — wraps the canvas area and provides shared calibration
 * state to both the toolbar controls and the SVG overlay.
 */
export function CalibrationProvider({
  containerRef,
  calibrationData,
  onCalibrationChange,
  onAutoScale,
  photoUrl,
  children,
}: CalibrationProviderProps) {
  const [isCalibrating, setIsCalibrating] = useState(false);
  const [tempPoint1, setTempPoint1] = useState<{ x: number; y: number } | null>(null);
  const [tempPoint2, setTempPoint2] = useState<{ x: number; y: number } | null>(null);
  const [distanceInput, setDistanceInput] = useState("");
  const [step, setStep] = useState<"point1" | "point2" | "distance">("point1");
  const clickHandlerRef = useRef<((e: MouseEvent | TouchEvent) => void) | null>(null);
  const prevPhotoUrlRef = useRef<string | null | undefined>(photoUrl);

  // Clear calibration when photo changes (reference points are no longer valid)
  useEffect(() => {
    if (prevPhotoUrlRef.current !== undefined && prevPhotoUrlRef.current !== photoUrl && calibrationData) {
      onCalibrationChange(null);
    }
    prevPhotoUrlRef.current = photoUrl;
  }, [photoUrl, calibrationData, onCalibrationChange]);

  // Recalculate overlay scale on canvas resize when calibration exists
  useEffect(() => {
    if (!calibrationData || !containerRef.current) return;
    const el = containerRef.current;
    const observer = new ResizeObserver(() => {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      const px1 = (calibrationData.point1.x / 100) * rect.width;
      const py1 = (calibrationData.point1.y / 100) * rect.height;
      const px2 = (calibrationData.point2.x / 100) * rect.width;
      const py2 = (calibrationData.point2.y / 100) * rect.height;
      const pixelDist = Math.sqrt((px2 - px1) ** 2 + (py2 - py1) ** 2);
      const pixelsPerMm = pixelDist / calibrationData.realDistanceMm;
      onAutoScale(pixelsPerMm);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [calibrationData, containerRef, onAutoScale]);

  useEffect(() => {
    return () => {
      if (clickHandlerRef.current && containerRef.current) {
        containerRef.current.removeEventListener("click", clickHandlerRef.current);
        containerRef.current.removeEventListener("touchend", clickHandlerRef.current);
      }
    };
  }, [containerRef]);

  const startCalibration = useCallback(() => {
    setIsCalibrating(true);
    setTempPoint1(null);
    setTempPoint2(null);
    setDistanceInput(calibrationData?.realDistanceMm?.toString() || "");
    setStep("point1");

    if (clickHandlerRef.current && containerRef.current) {
      containerRef.current.removeEventListener("click", clickHandlerRef.current);
      containerRef.current.removeEventListener("touchend", clickHandlerRef.current);
    }

    let p1: { x: number; y: number } | null = null;

    const handler = (e: MouseEvent | TouchEvent) => {
      e.preventDefault();
      e.stopPropagation();

      let clientX: number, clientY: number;
      if ("changedTouches" in e) {
        const touch = (e as TouchEvent).changedTouches[0];
        clientX = touch.clientX;
        clientY = touch.clientY;
      } else {
        clientX = (e as MouseEvent).clientX;
        clientY = (e as MouseEvent).clientY;
      }

      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const pos = {
        x: Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100)),
        y: Math.max(0, Math.min(100, ((clientY - rect.top) / rect.height) * 100)),
      };

      if (!p1) {
        p1 = pos;
        setTempPoint1(pos);
        setStep("point2");
      } else {
        setTempPoint2(pos);
        setStep("distance");
        if (containerRef.current) {
          containerRef.current.removeEventListener("click", handler);
          containerRef.current.removeEventListener("touchend", handler);
        }
        clickHandlerRef.current = null;
      }
    };

    clickHandlerRef.current = handler;
    setTimeout(() => {
      if (containerRef.current) {
        containerRef.current.addEventListener("click", handler);
        containerRef.current.addEventListener("touchend", handler, { passive: false });
      }
    }, 150);
  }, [containerRef, calibrationData]);

  const cancelCalibration = useCallback(() => {
    setIsCalibrating(false);
    setTempPoint1(null);
    setTempPoint2(null);
    setStep("point1");
    if (clickHandlerRef.current && containerRef.current) {
      containerRef.current.removeEventListener("click", clickHandlerRef.current);
      containerRef.current.removeEventListener("touchend", clickHandlerRef.current);
      clickHandlerRef.current = null;
    }
  }, [containerRef]);

  const confirmCalibration = useCallback(() => {
    if (!tempPoint1 || !tempPoint2) return;
    const dist = parseFloat(distanceInput);
    if (!dist || dist <= 0) return;

    const data: CalibrationData = {
      point1: tempPoint1,
      point2: tempPoint2,
      realDistanceMm: dist,
    };
    onCalibrationChange(data);

    // Calculate pixels per mm and auto-scale
    const rect = containerRef.current?.getBoundingClientRect();
    if (rect) {
      const px1 = (tempPoint1.x / 100) * rect.width;
      const py1 = (tempPoint1.y / 100) * rect.height;
      const px2 = (tempPoint2.x / 100) * rect.width;
      const py2 = (tempPoint2.y / 100) * rect.height;
      const pixelDist = Math.sqrt((px2 - px1) ** 2 + (py2 - py1) ** 2);
      const pixelsPerMm = pixelDist / dist;
      onAutoScale(pixelsPerMm);
    }

    setIsCalibrating(false);
    setTempPoint1(null);
    setTempPoint2(null);
    setStep("point1");
  }, [tempPoint1, tempPoint2, distanceInput, onCalibrationChange, onAutoScale, containerRef]);

  const clearCalibration = useCallback(() => {
    onCalibrationChange(null);
  }, [onCalibrationChange]);

  const ctx: CalibrationCtx = {
    isCalibrating,
    step,
    tempPoint1,
    tempPoint2,
    distanceInput,
    startCalibration,
    cancelCalibration,
    confirmCalibration,
    clearCalibration,
    setDistanceInput,
    calibrationData,
  };

  return (
    <CalibrationContext.Provider value={ctx}>
      {children}
    </CalibrationContext.Provider>
  );
}

// ─── Toolbar Controls ────────────────────────────────────────────────────────

/** Renders the Calibrate button + instruction bar in the toolbar area */
export function CalibrationToolbarControls() {
  const ctx = useContext(CalibrationContext);
  if (!ctx) return null;

  const {
    isCalibrating,
    step,
    calibrationData,
    distanceInput,
    startCalibration,
    cancelCalibration,
    confirmCalibration,
    clearCalibration,
    setDistanceInput,
  } = ctx;

  if (isCalibrating) {
    return (
      <div className="flex items-center gap-2 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-md px-2 py-1 sm:px-3 sm:py-1.5 text-xs sm:text-sm">
        <Ruler className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-blue-600 shrink-0" />
        {step === "point1" && (
          <span className="text-blue-800 dark:text-blue-200 font-medium">
            Tap the <strong>first point</strong> of a known reference on the photo
          </span>
        )}
        {step === "point2" && (
          <span className="text-blue-800 dark:text-blue-200 font-medium">
            Tap the <strong>second point</strong> of the reference
          </span>
        )}
        {step === "distance" && (
          <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
            <Label className="text-blue-800 dark:text-blue-200 font-medium whitespace-nowrap text-xs sm:text-sm">
              Distance (mm):
            </Label>
            <Input
              type="number"
              value={distanceInput}
              onChange={(e) => setDistanceInput(e.target.value)}
              placeholder="e.g. 2400"
              className="h-7 w-20 sm:w-24 text-xs"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") confirmCalibration();
              }}
            />
            <Button
              variant="default"
              size="sm"
              className="h-7 px-2 bg-blue-600 hover:bg-blue-700"
              onClick={confirmCalibration}
              disabled={!distanceInput || parseFloat(distanceInput) <= 0}
            >
              <Check className="h-3 w-3 mr-1" />
              Apply
            </Button>
          </div>
        )}
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0 ml-auto text-blue-600"
          onClick={cancelCalibration}
          title="Cancel calibration"
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <Button
        variant={calibrationData ? "default" : "outline"}
        size="sm"
        className="h-8 px-2 sm:h-9 sm:px-3"
        onClick={startCalibration}
        title="Calibrate photo scale — draw a reference line and enter a known distance"
      >
        <Ruler className="h-3.5 w-3.5 sm:h-4 sm:w-4 sm:mr-1" />
        <span className="hidden sm:inline">{calibrationData ? "Re-calibrate" : "Calibrate"}</span>
      </Button>
      {calibrationData && (
        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0 sm:h-9 sm:w-9 text-muted-foreground"
          onClick={clearCalibration}
          title="Clear calibration"
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  );
}

// ─── Canvas Overlay ──────────────────────────────────────────────────────────

/** SVG overlay that draws the calibration reference line and endpoint markers */
export function CalibrationCanvasOverlay() {
  const ctx = useContext(CalibrationContext);
  if (!ctx) return null;

  const { isCalibrating, tempPoint1, tempPoint2, distanceInput, calibrationData } = ctx;

  const point1 = isCalibrating ? tempPoint1 : calibrationData?.point1 ?? null;
  const point2 = isCalibrating ? tempPoint2 : calibrationData?.point2 ?? null;
  const realDistanceMm = isCalibrating
    ? distanceInput ? parseFloat(distanceInput) || 0 : 0
    : calibrationData?.realDistanceMm ?? 0;
  const isActive = isCalibrating;

  if (!point1) return null;

  const color = isActive ? "#3b82f6" : "#22c55e";
  const labelColor = isActive ? "#1d4ed8" : "#15803d";

  return (
    <svg
      className="absolute inset-0 w-full h-full pointer-events-none z-20"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
    >
      {/* Point 1 marker */}
      <circle cx={point1.x} cy={point1.y} r={0.8} fill={color} stroke="white" strokeWidth={0.2} />
      <circle cx={point1.x} cy={point1.y} r={1.5} fill="none" stroke={color} strokeWidth={0.15} opacity={0.6} />

      {point2 && (
        <>
          {/* Point 2 marker */}
          <circle cx={point2.x} cy={point2.y} r={0.8} fill={color} stroke="white" strokeWidth={0.2} />
          <circle cx={point2.x} cy={point2.y} r={1.5} fill="none" stroke={color} strokeWidth={0.15} opacity={0.6} />

          {/* Reference line */}
          <line
            x1={point1.x}
            y1={point1.y}
            x2={point2.x}
            y2={point2.y}
            stroke={color}
            strokeWidth={0.25}
            strokeDasharray="0.8,0.4"
          />

          {/* Distance label */}
          {realDistanceMm > 0 && (
            <>
              <rect
                x={(point1.x + point2.x) / 2 - 5}
                y={(point1.y + point2.y) / 2 - 1.8}
                width={10}
                height={3}
                rx={0.5}
                fill="white"
                opacity={0.9}
              />
              <text
                x={(point1.x + point2.x) / 2}
                y={(point1.y + point2.y) / 2 + 0.5}
                textAnchor="middle"
                fontSize={1.8}
                fill={labelColor}
                fontWeight="bold"
                fontFamily="monospace"
              >
                {realDistanceMm >= 1000
                  ? `${(realDistanceMm / 1000).toFixed(1)}m`
                  : `${realDistanceMm}mm`}
              </text>
            </>
          )}

          {/* End tick marks (perpendicular to line) */}
          {(() => {
            const dx = point2.x - point1.x;
            const dy = point2.y - point1.y;
            const len = Math.sqrt(dx * dx + dy * dy);
            if (len === 0) return null;
            const nx = -dy / len;
            const ny = dx / len;
            const tickLen = 0.8;
            return (
              <>
                <line
                  x1={point1.x - nx * tickLen}
                  y1={point1.y - ny * tickLen}
                  x2={point1.x + nx * tickLen}
                  y2={point1.y + ny * tickLen}
                  stroke={color}
                  strokeWidth={0.2}
                />
                <line
                  x1={point2.x - nx * tickLen}
                  y1={point2.y - ny * tickLen}
                  x2={point2.x + nx * tickLen}
                  y2={point2.y + ny * tickLen}
                  stroke={color}
                  strokeWidth={0.2}
                />
              </>
            );
          })()}
        </>
      )}
    </svg>
  );
}
