import { useState, useMemo, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, CheckCircle2, Info } from "lucide-react";
import {
  type StairInputs,
  type StairResult,
  type StairType,
  type TreadMaterial,
  type RiserStyle,
  type StringerMaterial,
  type HandrailStyle,
  DEFAULT_STAIR_INPUTS,
  STAIR_LIMITS,
  calculateStairs,
} from "../../../../shared/stairCalc";
import { DeckStairSideView } from "./DeckStairSideView";

interface StepperInputProps {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
}

function StepperInput({ label, value, onChange, min = 0, max = 10000, step = 10, unit = "mm" }: StepperInputProps) {
  return (
    <div>
      <Label className="text-[10px] text-muted-foreground">{label}</Label>
      <div className="flex items-center gap-1 mt-0.5">
        <Button
          variant="outline"
          size="sm"
          className="h-6 w-6 p-0 text-xs"
          onClick={() => onChange(Math.max(min, value - step))}
        >
          −
        </Button>
        <span className="text-xs font-mono w-14 text-center">{value}{unit}</span>
        <Button
          variant="outline"
          size="sm"
          className="h-6 w-6 p-0 text-xs"
          onClick={() => onChange(Math.min(max, value + step))}
        >
          +
        </Button>
      </div>
    </div>
  );
}

interface DeckStairDesignProps {
  /** Deck height above ground (mm) — used as default totalRise */
  deckHeightMm?: number;
  /** Board width from selected decking product (mm) */
  boardWidth?: number;
  /** Board gap from selected product (mm) */
  boardGap?: number;
  /** Initial stair inputs (from persisted state) */
  initialInputs?: Partial<StairInputs>;
  /** Callback when stair design changes */
  onStairChange?: (result: StairResult) => void;
}

export function DeckStairDesign({
  deckHeightMm,
  boardWidth = 138,
  boardGap = 5,
  initialInputs,
  onStairChange,
}: DeckStairDesignProps) {
  const [inputs, setInputs] = useState<StairInputs>(() => ({
    ...DEFAULT_STAIR_INPUTS,
    totalRise: deckHeightMm || DEFAULT_STAIR_INPUTS.totalRise,
    boardWidth,
    boardGap,
    ...initialInputs,
  }));

  const result = useMemo(() => calculateStairs(inputs), [inputs]);

  const updateInput = useCallback(<K extends keyof StairInputs>(key: K, value: StairInputs[K]) => {
    setInputs((prev) => {
      const next = { ...prev, [key]: value };
      // Auto-set flights for stair type
      if (key === "stairType") {
        next.flights = value === "straight" ? 1 : value === "l-shape" ? 2 : 2;
      }
      return next;
    });
  }, []);

  // Emit changes
  useMemo(() => {
    onStairChange?.(result);
  }, [result, onStairChange]);

  const { validation, geometry, bom } = result;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          Stair Design
          {validation.valid ? (
            <Badge variant="secondary" className="text-[10px]">
              <CheckCircle2 className="h-3 w-3 mr-1" /> NCC Compliant
            </Badge>
          ) : (
            <Badge variant="destructive" className="text-[10px]">
              <AlertCircle className="h-3 w-3 mr-1" /> Check Errors
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Stair Type */}
        <div>
          <Label className="text-[10px] text-muted-foreground">Stair Type</Label>
          <div className="grid grid-cols-3 gap-1 mt-1">
            {([
              { value: "straight", label: "Straight" },
              { value: "l-shape", label: "L-Shape" },
              { value: "u-shape", label: "U-Shape" },
            ] as { value: StairType; label: string }[]).map((opt) => (
              <Button
                key={opt.value}
                variant={inputs.stairType === opt.value ? "default" : "outline"}
                size="sm"
                className="text-[10px] h-6"
                onClick={() => updateInput("stairType", opt.value)}
              >
                {opt.label}
              </Button>
            ))}
          </div>
        </div>

        {/* Dimensions */}
        <div className="grid grid-cols-2 gap-2">
          <StepperInput
            label="Total Rise"
            value={inputs.totalRise}
            onChange={(v) => updateInput("totalRise", v)}
            min={100}
            max={4000}
            step={50}
          />
          <StepperInput
            label="Stair Width"
            value={inputs.stairWidth}
            onChange={(v) => updateInput("stairWidth", v)}
            min={600}
            max={2000}
            step={50}
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <StepperInput
            label="Riser Height"
            value={inputs.targetRiser}
            onChange={(v) => updateInput("targetRiser", v)}
            min={STAIR_LIMITS.riserMin}
            max={STAIR_LIMITS.riserMax}
            step={5}
          />
          <StepperInput
            label="Going Depth"
            value={inputs.targetGoing}
            onChange={(v) => updateInput("targetGoing", v)}
            min={STAIR_LIMITS.goingMin}
            max={STAIR_LIMITS.goingMax}
            step={10}
          />
        </div>

        <StepperInput
          label="Nosing Overhang"
          value={inputs.nosing}
          onChange={(v) => updateInput("nosing", v)}
          min={0}
          max={40}
          step={5}
        />

        {/* Landing depth for L/U */}
        {inputs.stairType !== "straight" && (
          <StepperInput
            label="Landing Depth"
            value={inputs.landingDepth}
            onChange={(v) => updateInput("landingDepth", v)}
            min={750}
            max={2000}
            step={50}
          />
        )}

        {/* Materials */}
        <div className="pt-2 border-t space-y-2">
          <Label className="text-xs font-semibold">Materials</Label>

          <div>
            <Label className="text-[10px] text-muted-foreground">Tread Material</Label>
            <div className="grid grid-cols-3 gap-1 mt-1">
              {([
                { value: "matching", label: "Matching" },
                { value: "timber", label: "Timber" },
                { value: "aluminium", label: "Aluminium" },
              ] as { value: TreadMaterial; label: string }[]).map((opt) => (
                <Button
                  key={opt.value}
                  variant={inputs.treadMaterial === opt.value ? "default" : "outline"}
                  size="sm"
                  className="text-[10px] h-6"
                  onClick={() => updateInput("treadMaterial", opt.value)}
                >
                  {opt.label}
                </Button>
              ))}
            </div>
          </div>

          <div>
            <Label className="text-[10px] text-muted-foreground">Riser Style</Label>
            <div className="grid grid-cols-2 gap-1 mt-1">
              {([
                { value: "open", label: "Open" },
                { value: "closed", label: "Closed" },
              ] as { value: RiserStyle; label: string }[]).map((opt) => (
                <Button
                  key={opt.value}
                  variant={inputs.riserStyle === opt.value ? "default" : "outline"}
                  size="sm"
                  className="text-[10px] h-6"
                  onClick={() => updateInput("riserStyle", opt.value)}
                >
                  {opt.label}
                </Button>
              ))}
            </div>
          </div>

          <div>
            <Label className="text-[10px] text-muted-foreground">Stringer Material</Label>
            <div className="grid grid-cols-3 gap-1 mt-1">
              {([
                { value: "timber", label: "Timber" },
                { value: "steel", label: "Steel" },
                { value: "aluminium", label: "Aluminium" },
              ] as { value: StringerMaterial; label: string }[]).map((opt) => (
                <Button
                  key={opt.value}
                  variant={inputs.stringerMaterial === opt.value ? "default" : "outline"}
                  size="sm"
                  className="text-[10px] h-6"
                  onClick={() => updateInput("stringerMaterial", opt.value)}
                >
                  {opt.label}
                </Button>
              ))}
            </div>
          </div>

          <div>
            <Label className="text-[10px] text-muted-foreground">Handrail</Label>
            <div className="grid grid-cols-3 gap-1 mt-1">
              {([
                { value: "none", label: "None" },
                { value: "one-side", label: "One Side" },
                { value: "both-sides", label: "Both" },
              ] as { value: HandrailStyle; label: string }[]).map((opt) => (
                <Button
                  key={opt.value}
                  variant={inputs.handrailStyle === opt.value ? "default" : "outline"}
                  size="sm"
                  className="text-[10px] h-6"
                  onClick={() => updateInput("handrailStyle", opt.value)}
                  disabled={opt.value === "none" && geometry.handrailRequired}
                  title={opt.value === "none" && geometry.handrailRequired ? "Handrail required by code (rise > 1000mm)" : undefined}
                >
                  {opt.label}
                </Button>
              ))}
            </div>
            {geometry.handrailRequired && (
              <p className="text-[10px] text-amber-600 mt-1">⚠ Handrail required (total rise &gt; 1000mm)</p>
            )}
          </div>
        </div>

        {/* Geometry Summary */}
        <div className="pt-2 border-t">
          <Label className="text-xs font-semibold">Geometry</Label>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-1 text-[10px]">
            <span className="text-muted-foreground">Risers:</span>
            <span className="font-mono">{geometry.numberOfRisers}</span>
            <span className="text-muted-foreground">Actual riser:</span>
            <span className="font-mono">{geometry.actualRiser}mm</span>
            <span className="text-muted-foreground">Goings (treads):</span>
            <span className="font-mono">{geometry.numberOfGoings}</span>
            <span className="text-muted-foreground">Going depth:</span>
            <span className="font-mono">{geometry.going}mm</span>
            <span className="text-muted-foreground">2R + G:</span>
            <span className={`font-mono ${geometry.slopeValue < STAIR_LIMITS.slopeMin || geometry.slopeValue > STAIR_LIMITS.slopeMax ? "text-red-600" : "text-green-600"}`}>
              {geometry.slopeValue}mm
            </span>
            <span className="text-muted-foreground">Stair angle:</span>
            <span className="font-mono">{geometry.stairAngle}°</span>
            <span className="text-muted-foreground">Stringer length:</span>
            <span className="font-mono">{geometry.stringerLength}mm</span>
            <span className="text-muted-foreground">Total run:</span>
            <span className="font-mono">{geometry.totalGoing}mm</span>
            <span className="text-muted-foreground">Tread depth:</span>
            <span className="font-mono">{geometry.treadDepth}mm ({geometry.boardsPerTread} boards)</span>
          </div>
        </div>

        {/* BOM Summary */}
        <div className="pt-2 border-t">
          <Label className="text-xs font-semibold">Bill of Materials</Label>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-1 text-[10px]">
            <span className="text-muted-foreground">Stringers:</span>
            <span className="font-mono">{bom.stringerCount} × {bom.stringerLengthMm}mm</span>
            <span className="text-muted-foreground">Tread boards:</span>
            <span className="font-mono">{bom.treadBoards} × {bom.treadCutLength}mm</span>
            {bom.riserBoards > 0 && (<>
              <span className="text-muted-foreground">Riser boards:</span>
              <span className="font-mono">{bom.riserBoards} × {bom.riserCutLength}mm</span>
            </>)}
            {bom.handrailLength > 0 && (<>
              <span className="text-muted-foreground">Handrail:</span>
              <span className="font-mono">{bom.handrailLength}mm total</span>
            </>)}
            {bom.balustradePosts > 0 && (<>
              <span className="text-muted-foreground">Posts:</span>
              <span className="font-mono">{bom.balustradePosts}</span>
            </>)}
            {bom.landingBoards > 0 && (<>
              <span className="text-muted-foreground">Landing boards:</span>
              <span className="font-mono">{bom.landingBoards}</span>
            </>)}
          </div>
        </div>

        {/* Validation Messages */}
        {(validation.errors.length > 0 || validation.warnings.length > 0) && (
          <div className="pt-2 border-t space-y-1">
            {validation.errors.map((e, i) => (
              <p key={`e-${i}`} className="text-[10px] text-red-600 flex items-start gap-1">
                <AlertCircle className="h-3 w-3 mt-0.5 shrink-0" /> {e}
              </p>
            ))}
            {validation.warnings.map((w, i) => (
              <p key={`w-${i}`} className="text-[10px] text-amber-600 flex items-start gap-1">
                <Info className="h-3 w-3 mt-0.5 shrink-0" /> {w}
              </p>
            ))}
          </div>
        )}

        {/* Side View SVG */}
        <div className="pt-2 border-t">
          <Label className="text-xs font-semibold mb-1 block">Side View</Label>
          <div className="bg-white dark:bg-zinc-950 border rounded p-2">
            <DeckStairSideView
              geometry={geometry}
              inputs={inputs}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
