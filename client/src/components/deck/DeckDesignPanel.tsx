/**
 * DeckDesignPanel — Wraps the subfloor calculation engine + SVG Schematic
 * with input controls and Bill of Materials display.
 * Designed to be embedded as an accordion section inside DeckQuoteEditor.
 */
import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Minus, Plus, RotateCcw, Pencil, Expand, Download, RotateCw, ChevronDown, Printer } from "lucide-react";
import { generateCuttingListPdf } from "../../lib/deckCuttingListPdf";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import DeckSchematic from "./DeckSchematic";
import InteractiveDeckSchematic from "./InteractiveDeckSchematic";
import FramingCuttingList from "./FramingCuttingList";
import DeckBoardLayout from "./DeckBoardLayout";
import DeckSideView from "./DeckSideView";
import DeckBoardProfile from "./DeckBoardProfile";
import { DeckStairDesign } from "./DeckStairDesign";
import { logClientDownload } from "@/lib/userActivity";
import {
  calculateSubfloor,
  computeDesignArea,
  computeDesignPerimeter,
  DEFAULT_INPUTS,
  DEFAULT_BOARD_LAYOUT,
  DEFAULT_JOIST_CENTRES,
  formatMM,
  formatAUD,
  type SubfloorInputs,
  type OptionResult,
  type FramingSystem,
  type PricingOverrides,
  type BoardLayoutInputs,
  type BoardDirection,
  type PictureFrame,
  type BreakerBoard,
  type BreakerDirection,
  type StaggerPattern,
  type FasciaMaterial,
  type InfillType,
} from "../../../../shared/subfloor-calc";
import { calculateBoardCutPlan, calculateOptimisedCutPlan, calculateFramingCutPlan } from "../../../../shared/boardCutPlan";

export interface DesignChangePayload {
  inputs: SubfloorInputs;
  areaM2: number;
  perimeterM: number;
  /** Which option is currently active (A or B) */
  activeOption: "A" | "B";
  /** Number of fascia boards needed (from board cut plan) */
  fasciaBoardCount?: number;
  /** Number of edge boards needed (from board cut plan) */
  edgeBoardCount?: number;
}

interface Props {
  /** Pre-fill from the quote's deck dimensions (metres) */
  deckWidthM?: number;
  deckProjectionM?: number;
  deckShape?: string;
  deckHeightMm?: number;
  /** Initial SubfloorInputs to restore full design state (takes priority over individual props) */
  initialInputs?: SubfloorInputs;
  /** Called whenever design inputs change — parent should use this as source of truth */
  onDesignChange?: (payload: DesignChangePayload) => void;
  /** Pricing overrides from Sales Data (deck_framing table) */
  pricingOverrides?: PricingOverrides;
  /** Board specs auto-populated from selected decking product */
  productBoardSpecs?: { boardWidth: number; boardGap: number; boardLength: number };
  /** Product name for board layout label */
  productName?: string;
  /** Colour name for board layout label */
  colourName?: string;
  /** Whether stairs are required (from Add-Ons checkbox) */
  stairsRequired?: boolean;
  /** Callback when stair design changes — parent receives full StairResult */
  onStairChange?: (result: import("../../../../shared/stairCalc").StairResult) => void;
  /** Whether the current user is an admin (controls visibility of BOM/Post Schedule) */
  isAdmin?: boolean;
  /** Quote number for cutting list PDF header */
  quoteNumber?: string;
  /** Client name for cutting list PDF header */
  clientName?: string;
  /** Site address for cutting list PDF header */
  siteAddress?: string;
}

const SHAPE_OPTIONS = [
  { value: "rectangle", label: "Rectangle" },
  { value: "l-shape", label: "L-shape" },
  { value: "u-shape", label: "U-shape" },
] as const;

const WALL_OPTIONS = [
  { value: "wall-mounted" as const, label: "Wall mounted" },
  { value: "free-standing" as const, label: "Free standing" },
];

const CONNECTOR_OPTIONS = [
  { value: "flush-finish" as const, label: "Flush finish" },
  { value: "over-the-top" as const, label: "Over the top" },
];

const JOIST_CENTRE_OPTIONS = [300, 400, 450, 600];

const FRAMING_SYSTEM_OPTIONS: { value: FramingSystem; label: string }[] = [
  { value: "spanmor", label: "Spanmor (Aluminium)" },
  { value: "sfs01", label: "Spanline RFB (Steel)" },
  { value: "clickdeck", label: "ClickDeck (Modular)" },
];

function StepperInput({
  label: lbl,
  value,
  onChange,
  step = 100,
  min = 0,
  suffix = "mm",
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
  suffix?: string;
}) {
  return (
    <div>
      <Label className="text-xs">{lbl}</Label>
      <div className="flex items-center gap-1 mt-1">
        <Input
          type="number"
          value={value}
          onChange={(e) => onChange(Math.max(min, parseInt(e.target.value) || min))}
          className="h-8 text-sm text-center font-mono"
        />
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8 flex-shrink-0"
          onClick={() => onChange(Math.max(min, value - step))}
        >
          <Minus className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8 flex-shrink-0"
          onClick={() => onChange(value + step)}
        >
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>
      <p className="text-[10px] text-muted-foreground mt-0.5">
        {(value / 1000).toFixed(2)} m
      </p>
    </div>
  );
}

export default function DeckDesignPanel({
  deckWidthM,
  deckProjectionM,
  deckShape,
  deckHeightMm,
  initialInputs,
  onDesignChange,
  pricingOverrides,
  productBoardSpecs,
  productName,
  colourName,
  stairsRequired,
  onStairChange,
  isAdmin,
  quoteNumber,
  clientName,
  siteAddress,
}: Props) {
  const [expandedView, setExpandedView] = useState<"plan" | "board" | null>(null);
  const expandedContainerRef = useRef<HTMLDivElement>(null);

  // Save SVG as PNG
  const handleSaveAsPng = useCallback(() => {
    const container = expandedContainerRef.current;
    if (!container) return;
    const svg = container.querySelector("svg");
    if (!svg) return;
    const svgData = new XMLSerializer().serializeToString(svg);
    const svgBlob = new Blob([svgData], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(svgBlob);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const scale = 3; // High-res export
      canvas.width = img.naturalWidth * scale;
      canvas.height = img.naturalHeight * scale;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.scale(scale, scale);
      ctx.drawImage(img, 0, 0);
      canvas.toBlob((blob) => {
        if (!blob) return;
        const a = document.createElement("a");
        const filename = `deck-${expandedView === "plan" ? "plan-view" : "board-layout"}-${Date.now()}.png`;
        a.href = URL.createObjectURL(blob);
        a.download = filename;
        a.click();
        URL.revokeObjectURL(a.href);
        logClientDownload({
          filename,
          source: "deck_design_image_export",
          entityType: "deck_quote",
          mimeType: "image/png",
          metadata: { view: expandedView },
        });
      }, "image/png");
      URL.revokeObjectURL(url);
    };
    img.src = url;
  }, [expandedView]);

  // Initialise from saved SubfloorInputs if available, otherwise from simple props
  const [inputs, setInputs] = useState<SubfloorInputs>(() => {
    if (initialInputs) return { ...initialInputs };
    const base = { ...DEFAULT_INPUTS };
    if (deckWidthM && deckWidthM > 0) base.length = Math.round(deckWidthM * 1000);
    if (deckProjectionM && deckProjectionM > 0) base.width = Math.round(deckProjectionM * 1000);
    if (deckShape === "l-shape") base.shape = "l-shape";
    else if (deckShape === "wraparound") base.shape = "u-shape";
    if (deckHeightMm && deckHeightMm > 0) {
      base.minHeight = Math.round(deckHeightMm * 0.5);
      base.maxHeight = deckHeightMm;
    }
    return base;
  });

  const [activeOption, setActiveOption] = useState<"A" | "B">("A");
  const [editMode, setEditMode] = useState(false);

  // Auto-populate board specs from selected product
  useEffect(() => {
    if (!productBoardSpecs) return;
    setInputs((prev) => ({
      ...prev,
      boardLayout: {
        ...(prev.boardLayout || DEFAULT_BOARD_LAYOUT),
        boardWidth: productBoardSpecs.boardWidth,
        boardGap: productBoardSpecs.boardGap,
        boardLength: productBoardSpecs.boardLength,
      },
    }));
  }, [productBoardSpecs?.boardWidth, productBoardSpecs?.boardGap, productBoardSpecs?.boardLength]);

  // Emit design changes to parent whenever inputs or active option changes
  useEffect(() => {
    if (!onDesignChange) return;
    const areaM2 = computeDesignArea(inputs);
    const perimeterM = computeDesignPerimeter(inputs);
    const cutPlan = calculateBoardCutPlan(inputs);
    onDesignChange({
      inputs,
      areaM2,
      perimeterM,
      activeOption,
      fasciaBoardCount: cutPlan.fasciaBoardStockBoards || undefined,
      edgeBoardCount: cutPlan.infillBoardStockBoards || undefined,
    });
  }, [inputs, activeOption, onDesignChange]);

  const updateInput = useCallback(
    <K extends keyof SubfloorInputs>(key: K, value: SubfloorInputs[K]) => {
      setInputs((prev) => ({ ...prev, [key]: value }));
    },
    []
  );

  const result = useMemo(() => calculateSubfloor(inputs, pricingOverrides), [inputs, pricingOverrides]);
  const option = activeOption === "A" ? result.optionA : result.optionB;

  const handleReset = () => setInputs({ ...DEFAULT_INPUTS });

  return (
    <div className="space-y-4 overflow-x-hidden">
      {/* Warnings */}
      {result.warnings.length > 0 && (
        <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg p-3 space-y-1">
          {result.warnings.map((w, i) => (
            <p key={i} className="text-xs text-amber-800 dark:text-amber-200">
              ⚠ {w}
            </p>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4">
        {/* Input Controls (moved first to match mobile order) */}
        <div className="space-y-3">
        {/* Shape */}
          <Card>
            <CardContent className="pt-4 space-y-3">
              <div>
                <Label className="text-xs font-semibold">Deck Shape</Label>
                <div className="grid grid-cols-3 gap-1 mt-1">
                  {SHAPE_OPTIONS.map((s) => (
                    <Button
                      key={s.value}
                      variant={inputs.shape === s.value ? "default" : "outline"}
                      size="sm"
                      className="text-xs h-7"
                      onClick={() => updateInput("shape", s.value)}
                    >
                      {s.label}
                    </Button>
                  ))}
                </div>
              </div>

              {/* Dimensions */}
              <div className="grid grid-cols-2 gap-2">
                <StepperInput
                  label="Length"
                  value={inputs.length}
                  onChange={(v) => updateInput("length", v)}
                  min={500}
                />
                <StepperInput
                  label="Width"
                  value={inputs.width}
                  onChange={(v) => updateInput("width", v)}
                  min={500}
                />
              </div>

              {/* Cutout dimensions for L/U shape */}
              {(inputs.shape === "l-shape" || inputs.shape === "u-shape") && (
                <div className="grid grid-cols-2 gap-2 pt-2 border-t">
                  <StepperInput
                    label="Cut Length"
                    value={inputs.cutLength}
                    onChange={(v) => updateInput("cutLength", v)}
                    min={100}
                  />
                  <StepperInput
                    label="Cut Width"
                    value={inputs.cutWidth}
                    onChange={(v) => updateInput("cutWidth", v)}
                    min={100}
                  />
                </div>
              )}
              {inputs.shape === "u-shape" && (
                <div className="grid grid-cols-2 gap-2">
                  <StepperInput
                    label="Cut 2 Length"
                    value={inputs.cut2Length}
                    onChange={(v) => updateInput("cut2Length", v)}
                    min={100}
                  />
                  <StepperInput
                    label="Cut 2 Width"
                    value={inputs.cut2Width}
                    onChange={(v) => updateInput("cut2Width", v)}
                    min={100}
                  />
                </div>
              )}

              {/* Heights */}
              <div className="grid grid-cols-2 gap-2 pt-2 border-t">
                <StepperInput
                  label="Min Height"
                  value={inputs.minHeight}
                  onChange={(v) => updateInput("minHeight", v)}
                  min={50}
                  step={50}
                />
                <StepperInput
                  label="Max Height"
                  value={inputs.maxHeight}
                  onChange={(v) => updateInput("maxHeight", v)}
                  min={50}
                  step={50}
                />
              </div>

              {/* Framing System */}
              <div className="pt-2 border-t space-y-2">
                <div>
                  <Label className="text-xs font-semibold">Framing System</Label>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {FRAMING_SYSTEM_OPTIONS.map((fs) => (
                      <Button
                        key={fs.value}
                        variant={(inputs.framingSystem || "spanmor") === fs.value ? "default" : "outline"}
                        size="sm"
                        className="text-xs h-7 px-2"
                        onClick={() => updateInput("framingSystem", fs.value)}
                      >
                        {fs.label}
                      </Button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Wall / Connector */}
              <div className="pt-2 border-t space-y-2">
                <div>
                  <Label className="text-xs font-semibold">Wall Config</Label>
                  <div className="grid grid-cols-2 gap-1 mt-1">
                    {WALL_OPTIONS.map((w) => (
                      <Button
                        key={w.value}
                        variant={inputs.wall === w.value ? "default" : "outline"}
                        size="sm"
                        className="text-xs h-7"
                        onClick={() => updateInput("wall", w.value)}
                      >
                        {w.label}
                      </Button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Board Layout */}
              <div className="pt-2 border-t space-y-2">
                <Label className="text-xs font-semibold">Board Layout</Label>
                {/* Board Direction */}
                <div>
                  <Label className="text-[10px] text-muted-foreground">Board Direction</Label>
                  <div className="grid grid-cols-3 gap-1 mt-1">
                    {(["parallel", "perpendicular", "diagonal"] as BoardDirection[]).map((dir) => (
                      <Button
                        key={dir}
                        variant={(inputs.boardLayout?.boardDirection || "parallel") === dir ? "default" : "outline"}
                        size="sm"
                        className="text-[10px] h-6 capitalize"
                        onClick={() => {
                          const layout = { ...(inputs.boardLayout || DEFAULT_BOARD_LAYOUT), boardDirection: dir };
                          updateInput("boardLayout", layout);
                        }}
                      >
                        {dir === "parallel" ? "Parallel" : dir === "perpendicular" ? "90\u00b0" : "Diagonal"}
                      </Button>
                    ))}
                  </div>
                  {inputs.boardLayout?.boardDirection === "diagonal" && (
                    <div className="mt-1">
                      <Label className="text-[10px] text-muted-foreground">Angle: {inputs.boardLayout.diagonalAngle || 45}\u00b0</Label>
                      <input
                        type="range"
                        min={30}
                        max={60}
                        step={5}
                        value={inputs.boardLayout.diagonalAngle || 45}
                        onChange={(e) => {
                          const layout = { ...(inputs.boardLayout || DEFAULT_BOARD_LAYOUT), diagonalAngle: parseInt(e.target.value) };
                          updateInput("boardLayout", layout);
                        }}
                        className="w-full h-1.5 mt-1"
                      />
                    </div>
                  )}
                </div>
                {/* Picture Frame */}
                <div>
                  <Label className="text-[10px] text-muted-foreground">Picture Frame</Label>
                  <div className="grid grid-cols-3 gap-1 mt-1">
                    {(["none", "single", "double"] as PictureFrame[]).map((pf) => (
                      <Button
                        key={pf}
                        variant={(inputs.boardLayout?.pictureFrame || "none") === pf ? "default" : "outline"}
                        size="sm"
                        className="text-[10px] h-6 capitalize"
                        onClick={() => {
                          const layout = { ...(inputs.boardLayout || DEFAULT_BOARD_LAYOUT), pictureFrame: pf };
                          updateInput("boardLayout", layout);
                        }}
                      >
                        {pf === "none" ? "None" : pf === "single" ? "Single" : "Double"}
                      </Button>
                    ))}
                  </div>
                </div>
                {/* Breaker Board */}
                <div>
                  <Label className="text-[10px] text-muted-foreground">Breaker Board</Label>
                  <div className="grid grid-cols-3 gap-1 mt-1">
                    {(["none", "single", "double"] as BreakerBoard[]).map((bb) => (
                      <Button
                        key={bb}
                        variant={(inputs.boardLayout?.breakerBoard || "none") === bb ? "default" : "outline"}
                        size="sm"
                        className="text-[10px] h-6 capitalize"
                        onClick={() => {
                          const layout = { ...(inputs.boardLayout || DEFAULT_BOARD_LAYOUT), breakerBoard: bb };
                          updateInput("boardLayout", layout);
                        }}
                      >
                        {bb === "none" ? "None" : bb === "single" ? "Single" : "Double"}
                      </Button>
                    ))}
                  </div>
                </div>
                {/* Breaker Direction — only show when breaker board is not "none" */}
                {(inputs.boardLayout?.breakerBoard || "none") !== "none" && (
                  <div>
                    <Label className="text-[10px] text-muted-foreground">Breaker Direction</Label>
                    <div className="grid grid-cols-2 gap-1 mt-1">
                      {(["along-width", "along-length"] as BreakerDirection[]).map((bd) => (
                        <Button
                          key={bd}
                          variant={(inputs.boardLayout?.breakerDirection || "along-width") === bd ? "default" : "outline"}
                          size="sm"
                          className="text-[10px] h-6"
                          onClick={() => {
                            const layout = { ...(inputs.boardLayout || DEFAULT_BOARD_LAYOUT), breakerDirection: bd };
                            updateInput("boardLayout", layout);
                          }}
                        >
                          {bd === "along-width" ? "Along Width" : "Along Length"}
                        </Button>
                      ))}
                    </div>
                  </div>
                )}
                {/* Stagger Pattern */}
                <div>
                  <Label className="text-[10px] text-muted-foreground">Stagger Pattern</Label>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {(["none", "random", "equal", "third", "quarter"] as StaggerPattern[]).map((sp) => (
                      <Button
                        key={sp}
                        variant={(inputs.boardLayout?.staggerPattern || "random") === sp ? "default" : "outline"}
                        size="sm"
                        className="text-[10px] h-6 capitalize"
                        onClick={() => {
                          const layout = { ...(inputs.boardLayout || DEFAULT_BOARD_LAYOUT), staggerPattern: sp };
                          updateInput("boardLayout", layout);
                        }}
                      >
                        {sp === "none" ? "None" : sp === "random" ? "Random" : sp === "equal" ? "Equal" : sp === "third" ? "⅓ Offset" : "¼ Offset"}
                      </Button>
                    ))}
                  </div>
                </div>

                {/* Fascia Boards */}
                <div>
                  <Label className="text-[10px] text-muted-foreground">Fascia Boards</Label>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {(["none", "matching"] as FasciaMaterial[]).map((fm) => (
                      <Button
                        key={fm}
                        variant={(inputs.boardLayout?.fascia || "none") === fm ? "default" : "outline"}
                        size="sm"
                        className="text-[10px] h-6 capitalize"
                        onClick={() => {
                          const layout = { ...(inputs.boardLayout || DEFAULT_BOARD_LAYOUT), fascia: fm };
                          updateInput("boardLayout", layout);
                        }}
                      >
                        {fm === "matching" ? "Yes" : "None"}
                      </Button>
                    ))}
                  </div>
                  {(inputs.boardLayout?.fascia || "none") !== "none" && (
                    <div className="mt-1">
                      <Label className="text-[10px]">Fascia Height (mm)</Label>
                      <Input
                        type="number"
                        value={inputs.boardLayout?.fasciaHeightMm || 150}
                        onChange={(e) => {
                          const layout = { ...(inputs.boardLayout || DEFAULT_BOARD_LAYOUT), fasciaHeightMm: parseInt(e.target.value) || 150 };
                          updateInput("boardLayout", layout);
                        }}
                        className="h-6 text-[10px] text-center w-24"
                      />
                    </div>
                  )}
                </div>
                {/* Infill */}
                <div>
                  <Label className="text-[10px] text-muted-foreground">Side Infill</Label>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {(["none", "matching", "lattice", "vertical-slats", "horizontal-slats", "sheet-cladding"] as InfillType[]).map((it) => (
                      <Button
                        key={it}
                        variant={(inputs.boardLayout?.infill || "none") === it ? "default" : "outline"}
                        size="sm"
                        className="text-[10px] h-6 px-2 capitalize"
                        onClick={() => {
                          const layout = { ...(inputs.boardLayout || DEFAULT_BOARD_LAYOUT), infill: it };
                          updateInput("boardLayout", layout);
                        }}
                      >
                        {it === "matching" ? "Match Deck" : it === "none" ? "None" : it === "vertical-slats" ? "V-Slats" : it === "horizontal-slats" ? "H-Slats" : it === "sheet-cladding" ? "Sheet" : it.charAt(0).toUpperCase() + it.slice(1)}
                      </Button>
                    ))}
                  </div>
                </div>
                {/* Board Specs (collapsible) */}
                <details className="text-xs">
                  <summary className="cursor-pointer text-muted-foreground hover:text-foreground">Board Specs</summary>
                  <div className="grid grid-cols-3 gap-2 mt-2">
                    <div>
                      <Label className="text-[10px]">Width (mm)</Label>
                      <Input
                        type="number"
                        value={inputs.boardLayout?.boardWidth || 138}
                        onChange={(e) => {
                          const layout = { ...(inputs.boardLayout || DEFAULT_BOARD_LAYOUT), boardWidth: parseInt(e.target.value) || 138 };
                          updateInput("boardLayout", layout);
                        }}
                        className="h-6 text-[10px] text-center"
                      />
                    </div>
                    <div>
                      <Label className="text-[10px]">Gap (mm)</Label>
                      <Input
                        type="number"
                        step="0.5"
                        value={inputs.boardLayout?.boardGap ?? 5.5}
                        onChange={(e) => {
                          const layout = { ...(inputs.boardLayout || DEFAULT_BOARD_LAYOUT), boardGap: parseFloat(e.target.value) || 5.5 };
                          updateInput("boardLayout", layout);
                        }}
                        className="h-6 text-[10px] text-center"
                      />
                    </div>
                    <div>
                      <Label className="text-[10px]">Length (mm)</Label>
                      <Input
                        type="number"
                        value={inputs.boardLayout?.boardLength || 5400}
                        onChange={(e) => {
                          const layout = { ...(inputs.boardLayout || DEFAULT_BOARD_LAYOUT), boardLength: parseInt(e.target.value) || 5400 };
                          updateInput("boardLayout", layout);
                        }}
                        className="h-6 text-[10px] text-center"
                      />
                    </div>
                  </div>
                </details>
                {/* Framing impact note */}
                {inputs.boardLayout && inputs.boardLayout.boardDirection !== "parallel" && (
                  <p className="text-[10px] text-blue-600 dark:text-blue-400">
                    ℹ Board direction affects joist orientation{inputs.boardLayout.boardDirection === "diagonal" ? " and reduces joist spacing" : ""}.
                  </p>
                )}
                {inputs.boardLayout && (inputs.boardLayout.pictureFrame !== "none" || inputs.boardLayout.breakerBoard !== "none") && (
                  <p className="text-[10px] text-blue-600 dark:text-blue-400">
                    ℹ Extra framing members added for {inputs.boardLayout.pictureFrame !== "none" ? "picture frame" : ""}{inputs.boardLayout.pictureFrame !== "none" && inputs.boardLayout.breakerBoard !== "none" ? " + " : ""}{inputs.boardLayout.breakerBoard !== "none" ? "breaker board" : ""}.
                  </p>
                )}
                {/* Board Layout Diagram */}
                <div className="relative">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="absolute top-0 right-0 h-6 w-6 p-0 z-10"
                    onClick={() => setExpandedView("board")}
                    title="Expand board layout"
                  >
                    <Expand className="h-3.5 w-3.5" />
                  </Button>
                  <DeckBoardLayout
                    lengthMm={inputs.length}
                    widthMm={inputs.width}
                    boardLayout={inputs.boardLayout}
                    productName={productName}
                    colourName={colourName}
                  />
                </div>

                {/* Optimised Board Cut Plan Summary */}
                {(() => {
                  const cutPlan = calculateBoardCutPlan(inputs);
                  const optimised = calculateOptimisedCutPlan(inputs);
                  const boardSummary = optimised.materialSummaries.find(m => m.materialKey === "board");
                  const savings = boardSummary ? cutPlan.totalStockBoards - boardSummary.stockCount : 0;
                  return (
                    <div className="bg-muted/50 rounded p-2 space-y-2">
                      <p className="text-[10px] font-semibold">Cut Plan Summary (Optimised)</p>
                      <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[10px]">
                        <span className="text-muted-foreground">Stock boards (optimised):</span>
                        <span className="font-mono font-semibold text-green-600">
                          {boardSummary?.stockCount ?? cutPlan.totalStockBoards}
                          {savings > 0 && <span className="text-[9px] ml-1">(↓{savings} saved)</span>}
                        </span>
                        <span className="text-muted-foreground">Stock boards (naive):</span>
                        <span className="font-mono text-muted-foreground">{cutPlan.totalStockBoards}</span>
                        <span className="text-muted-foreground">Total LM:</span>
                        <span className="font-mono">{cutPlan.totalLinearM.toFixed(1)} m</span>
                        <span className="text-muted-foreground">Coverage:</span>
                        <span className="font-mono">{cutPlan.coverageAreaM2.toFixed(2)} m²</span>
                        <span className="text-muted-foreground">Waste (optimised):</span>
                        <span className="font-mono font-semibold text-green-600">
                          {boardSummary ? boardSummary.wastePercent.toFixed(1) : cutPlan.wastePercent.toFixed(1)}%
                          {boardSummary && <span className="text-[9px] ml-1">({(boardSummary.totalWaste / 1000).toFixed(1)} m)</span>}
                        </span>
                        {boardSummary && boardSummary.usableOffcuts > 0 && (<>
                          <span className="text-muted-foreground">Usable offcuts:</span>
                          <span className="font-mono text-blue-600">{boardSummary.usableOffcuts} pcs ({(boardSummary.usableOffcutLength / 1000).toFixed(1)} m)</span>
                        </>)}
                        {cutPlan.pictureFrameBoards > 0 && (<>
                          <span className="text-muted-foreground">Picture frame:</span>
                          <span className="font-mono">incl. in optimised count</span>
                        </>)}
                        {cutPlan.breakerBoardPieces > 0 && (<>
                          <span className="text-muted-foreground">Breaker:</span>
                          <span className="font-mono">incl. in optimised count</span>
                        </>)}
                        {cutPlan.fasciaBoardStockBoards > 0 && (<>
                          <span className="text-muted-foreground">Fascia:</span>
                          <span className="font-mono">incl. in optimised count</span>
                        </>)}
                        {cutPlan.infillBoardStockBoards > 0 && (<>
                          <span className="text-muted-foreground">Infill:</span>
                          <span className="font-mono">incl. in optimised count</span>
                        </>)}
                      </div>
                      {/* Per-stock cut breakdown (collapsible) */}
                      <Collapsible>
                        <CollapsibleTrigger className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground cursor-pointer">
                          <ChevronDown className="h-3 w-3 transition-transform [[data-state=open]_&]:rotate-180" />
                          View cut breakdown ({boardSummary?.stockCount ?? 0} stock pieces)
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          <div className="mt-1 max-h-48 overflow-y-auto space-y-0.5">
                            {optimised.stockPieces.map((sp) => (
                              <div key={sp.index} className="flex items-center gap-1 text-[9px] font-mono border-b border-border/30 py-0.5">
                                <span className="text-muted-foreground w-6">#{sp.index}</span>
                                <div className="flex-1 flex flex-wrap gap-0.5">
                                  {sp.cuts.map((c, ci) => (
                                    <span key={ci} className={`px-1 rounded ${
                                      c.component === "deck-field" ? "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200" :
                                      c.component === "picture-frame" ? "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200" :
                                      c.component === "fascia" ? "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200" :
                                      c.component === "infill" ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" :
                                      "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200"
                                    }`}>
                                      {c.cutLength}mm
                                    </span>
                                  ))}
                                </div>
                                <span className={`text-[8px] ${sp.offcutUsable ? "text-blue-600" : "text-muted-foreground"}`}>
                                  {sp.offcut > 0 ? `${sp.offcut}mm ${sp.offcutUsable ? "✓" : "waste"}` : "full"}
                                </span>
                              </div>
                            ))}
                          </div>
                        </CollapsibleContent>
                      </Collapsible>
                    </div>
                  );
                })()}

                {/* Framing Cut Plan Summary */}
                {(() => {
                  const framingResult = calculateFramingCutPlan(option, inputs);
                  const postSummary = framingResult.materialSummaries.find(m => m.materialKey === "post");
                  const joistSummary = framingResult.materialSummaries.find(m => m.materialKey === "joist");
                  const bearerSummary = framingResult.materialSummaries.find(m => m.materialKey === "bearer");
                  const totals = framingResult.totals;
                  return (
                    <div className="bg-muted/50 rounded p-2 space-y-2">
                      <p className="text-[10px] font-semibold">Framing Cut Plan (Posts / Joists / Bearers)</p>
                      <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[10px]">
                        {postSummary && (<>
                          <span className="text-muted-foreground">Posts ({postSummary.stockLength}mm stock):</span>
                          <span className="font-mono font-semibold text-orange-600">{postSummary.stockCount} pcs — {postSummary.wastePercent.toFixed(1)}% waste</span>
                        </>)}
                        {joistSummary && (<>
                          <span className="text-muted-foreground">Joists ({joistSummary.stockLength}mm stock):</span>
                          <span className="font-mono font-semibold text-blue-600">{joistSummary.stockCount} pcs — {joistSummary.wastePercent.toFixed(1)}% waste</span>
                        </>)}
                        {bearerSummary && (<>
                          <span className="text-muted-foreground">Bearers ({bearerSummary.stockLength}mm stock):</span>
                          <span className="font-mono font-semibold text-green-600">{bearerSummary.stockCount} pcs — {bearerSummary.wastePercent.toFixed(1)}% waste</span>
                        </>)}
                        <span className="text-muted-foreground">Total stock pieces:</span>
                        <span className="font-mono">{totals.totalStockPieces}</span>
                        <span className="text-muted-foreground">Overall waste:</span>
                        <span className="font-mono font-semibold text-green-600">{totals.overallWastePercent.toFixed(1)}% ({(totals.totalWaste / 1000).toFixed(1)} m)</span>
                        {totals.usableOffcutCount > 0 && (<>
                          <span className="text-muted-foreground">Usable offcuts:</span>
                          <span className="font-mono text-blue-600">{totals.usableOffcutCount} pcs ({(totals.usableOffcutLength / 1000).toFixed(1)} m)</span>
                        </>)}
                      </div>
                      {/* Per-stock cut breakdown (collapsible) */}
                      <Collapsible>
                        <CollapsibleTrigger className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground cursor-pointer">
                          <ChevronDown className="h-3 w-3 transition-transform [[data-state=open]_&]:rotate-180" />
                          View framing cut breakdown ({totals.totalStockPieces} stock pieces)
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          <div className="mt-1 max-h-48 overflow-y-auto space-y-0.5">
                            {framingResult.stockPieces.map((sp) => (
                              <div key={sp.index} className="flex items-center gap-1 text-[9px] font-mono border-b border-border/30 py-0.5">
                                <span className={`w-6 ${
                                  sp.materialKey === "post" ? "text-orange-600" :
                                  sp.materialKey === "joist" ? "text-blue-600" :
                                  "text-green-600"
                                }`}>#{sp.index}</span>
                                <span className={`text-[8px] w-10 ${
                                  sp.materialKey === "post" ? "text-orange-500" :
                                  sp.materialKey === "joist" ? "text-blue-500" :
                                  "text-green-500"
                                }`}>{sp.materialKey}</span>
                                <div className="flex-1 flex flex-wrap gap-0.5">
                                  {sp.cuts.map((c, ci) => (
                                    <span key={ci} className={`px-1 rounded ${
                                      c.component === "post" ? "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200" :
                                      c.component === "joist" ? "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200" :
                                      "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                                    }`}>
                                      {c.cutLength}mm
                                    </span>
                                  ))}
                                </div>
                                <span className={`text-[8px] ${sp.offcutUsable ? "text-blue-600" : "text-muted-foreground"}`}>
                                  {sp.offcut > 0 ? `${sp.offcut}mm ${sp.offcutUsable ? "\u2713" : "waste"}` : "full"}
                                </span>
                              </div>
                            ))}
                          </div>
                        </CollapsibleContent>
                      </Collapsible>
                    </div>
                  );
                })()}

                {/* NTW-style Framing Cutting List */}
                <FramingCuttingList option={option} inputs={inputs} />

                {/* Print Cutting List PDF button */}
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full text-xs gap-1.5"
                  onClick={() => {
                    generateCuttingListPdf({
                      quoteNumber: quoteNumber || "DRAFT",
                      clientName: clientName || "—",
                      siteAddress: siteAddress || undefined,
                      deckWidthM: inputs.length / 1000,
                      deckProjectionM: inputs.width / 1000,
                      productName: productName || undefined,
                      colourName: colourName || undefined,
                      subfloorResult: result,
                      subfloorInputs: inputs,
                      activeOption,
                    });
                  }}
                >
                  <Printer className="h-3 w-3" /> Print Cutting List
                </Button>

              </div>

              <Button
                variant="ghost"
                size="sm"
                className="w-full text-xs"
                onClick={handleReset}
              >
                <RotateCcw className="h-3 w-3 mr-1" /> Reset to defaults
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* SVG Plan View (after input controls to match mobile order) */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle className="text-sm">Plan View — Top-Down</CardTitle>
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-1.5">
                  <Pencil className="h-3 w-3 text-muted-foreground" />
                  <span className="text-[10px] text-muted-foreground">Edit</span>
                  <Switch checked={editMode} onCheckedChange={setEditMode} className="scale-75" />
                </div>
                <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => setExpandedView("plan")} title="Expand plan view">
                  <Expand className="h-3.5 w-3.5" />
                </Button>
                <Badge variant="outline" className="text-[10px] font-mono">
                  1 sq = 12 mm (display)
                </Badge>
                <Badge variant="secondary" className="text-[10px]">
                  Option {activeOption} active
                </Badge>
                <Badge variant="outline" className="text-[10px] font-mono">
                  {result.loadCondition} kPa
                </Badge>
                <Badge variant="outline" className="text-[10px]">
                  {option.profile.label}
                </Badge>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="bg-white dark:bg-zinc-950 border rounded-lg p-2 min-h-[300px] overflow-hidden">
              {editMode ? (
                <InteractiveDeckSchematic
                  inputs={inputs}
                  option={option}
                  editable
                  snapGridMM={50}
                />
              ) : (
                <DeckSchematic inputs={inputs} option={option} />
              )}
            </div>
            <p className="text-[10px] text-muted-foreground mt-2 italic text-center">
              {editMode
                ? "Interactive mode — drag posts to reposition. Ctrl+Z to undo."
                : "For illustrative purposes only — not a render of the finished structure."}
            </p>
          </CardContent>
        </Card>

        {/* Side Views / Cross-Sections (desktop only) */}
        <div className="space-y-3 hidden lg:block">
          <Card>
            <CardContent className="pt-4 space-y-3">
              <Label className="text-xs font-semibold">Side View / Cross-Section</Label>
              <DeckSideView
                inputs={inputs}
                boardLayout={inputs.boardLayout}
                framingLabel={`${inputs.framingSystem === "spanmor" ? "Spanmor" : inputs.framingSystem === "sfs01" ? "SFS01" : "ClickDeck"} framing`}
              />
              <div className="pt-2 border-t">
                <Label className="text-xs font-semibold">Board Profile</Label>
                <DeckBoardProfile
                  boardLayout={inputs.boardLayout}
                  productName={productName}
                />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Bill of Materials — admin only */}
      {isAdmin && (<div className="grid md:grid-cols-2 gap-4">
        <OptionCard
          option={result.optionA}
          isActive={activeOption === "A"}
          onSelect={() => setActiveOption("A")}
        />
        <OptionCard
          option={result.optionB}
          isActive={activeOption === "B"}
          onSelect={() => setActiveOption("B")}
        />
      </div>)}

      {/* Post Schedule — admin only */}
      {isAdmin && (
      <Collapsible>
        <Card>
          <CardHeader className="pb-2">
            <CollapsibleTrigger className="flex items-center gap-2 w-full cursor-pointer">
              <CardTitle className="text-sm">
                Post Schedule — Option {activeOption}{" "}
                <Badge variant="outline" className="ml-2 font-mono">
                  {option.postCount} posts
                </Badge>
              </CardTitle>
              <ChevronDown className="h-4 w-4 ml-auto text-muted-foreground transition-transform [[data-state=open]_&]:rotate-180" />
            </CollapsibleTrigger>
          </CardHeader>
          <CollapsibleContent>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-1.5 pr-4 font-semibold text-primary">Label</th>
                      <th className="text-left py-1.5 pr-4 text-muted-foreground">Bearer</th>
                      <th className="text-right py-1.5 pr-4">X (mm)</th>
                      <th className="text-right py-1.5">Y (mm)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {option.bearerLines.flatMap((bl) =>
                      bl.posts.map((post) => (
                        <tr key={post.label} className="border-b border-border/50">
                          <td className="py-1.5 pr-4 font-semibold text-primary font-mono">
                            {post.label}
                          </td>
                          <td className="py-1.5 pr-4 text-muted-foreground">
                            B{bl.index + 1}
                            {bl.isWallAttached ? " (wall)" : ""}
                          </td>
                          <td className="py-1.5 pr-4 text-right font-mono">
                            {post.x.toLocaleString()}
                          </td>
                          <td className="py-1.5 text-right font-mono">
                            {post.y.toLocaleString()}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>)}

      {/* Stair Design — only shown when stairs checkbox is ticked */}
      {stairsRequired && (
        <DeckStairDesign
          deckHeightMm={inputs.maxHeight}
          boardWidth={inputs.boardLayout?.boardWidth || 138}
          boardGap={inputs.boardLayout?.boardGap || 5}
          onStairChange={onStairChange}
        />
      )}

      <p className="text-[10px] text-muted-foreground text-center italic">
        Estimates are indicative only. Joist centres are held at{" "}
        {inputs.joistCentresOverride || DEFAULT_JOIST_CENTRES} mm; a 20 mm board
        allowance is applied. For spans, post layouts and final pricing, please
        consult the supplier's published span tables.
      </p>

      {/* Expanded View Dialog */}
      <Dialog open={expandedView !== null} onOpenChange={(open) => !open && setExpandedView(null)}>
        <DialogContent className="max-w-[95vw] max-h-[95vh] w-full h-full flex flex-col p-4">
          <div className="flex items-center justify-between gap-2">
            <DialogTitle className="text-sm font-semibold">
              {expandedView === "plan" ? "Plan View \u2014 Top-Down" : "Board Layout"}
            </DialogTitle>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs gap-1"
                onClick={() => handleSaveAsPng()}
              >
                <Download className="h-3 w-3" /> Save PNG
              </Button>
              <span className="text-[10px] text-muted-foreground hidden sm:inline ml-2">
                <RotateCw className="h-3 w-3 inline mr-0.5" />Rotate device for best view
              </span>
            </div>
          </div>
          <div
            ref={expandedContainerRef}
            className="flex-1 min-h-0 overflow-auto bg-white dark:bg-zinc-950 border rounded-lg p-4 touch-pan-x touch-pan-y"
            style={{ touchAction: "pan-x pan-y pinch-zoom" }}
          >
            {expandedView === "plan" && (
              <DeckSchematic inputs={inputs} option={option} />
            )}
            {expandedView === "board" && (
              <DeckBoardLayout
                lengthMm={inputs.length}
                widthMm={inputs.width}
                boardLayout={inputs.boardLayout}
                productName={productName}
                colourName={colourName}
              />
            )}
          </div>
          <p className="text-[9px] text-muted-foreground text-center mt-1">
            Pinch to zoom \u2022 Drag to pan
          </p>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Option Card ────────────────────────────────────────────────────────────

function OptionCard({
  option,
  isActive,
  onSelect,
}: {
  option: OptionResult;
  isActive: boolean;
  onSelect: () => void;
}) {
  return (
    <Card
      className={`cursor-pointer transition-all ${
        isActive
          ? "ring-2 ring-primary border-primary"
          : "hover:border-muted-foreground/30"
      }`}
      onClick={onSelect}
    >
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm">
            {option.label}{" "}
            <span className="font-normal text-muted-foreground">
              {option.profile.label}
            </span>
          </CardTitle>
          <Badge variant={isActive ? "default" : "outline"} className="text-[10px]">
            {isActive ? "DRAWN" : "COMPARE"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        <p className="text-xs text-muted-foreground">{option.description}</p>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Joists</span>
            <span className="font-mono">{option.joistCount}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Joist length</span>
            <span className="font-mono">{formatMM(option.joistLength)} mm</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Joist centres</span>
            <span className="font-mono">{option.joistCentres} mm</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Bearers</span>
            <span className="font-mono">{option.bearerCount}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Bearer length</span>
            <span className="font-mono">{formatMM(option.bearerLength)} mm</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Posts</span>
            <span className="font-mono">{option.postCount}</span>
          </div>
        </div>
        <div className="flex items-center justify-between pt-2 border-t text-xs">
          <div>
            <span className="text-muted-foreground">Joists </span>
            <span className="font-semibold">{formatAUD(option.joistsCost)}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Bearers </span>
            <span className="font-semibold">{formatAUD(option.bearersCost)}</span>
          </div>
          <div className="text-primary font-bold text-base">
            {formatAUD(option.totalCost)}
          </div>
        </div>
        <p className="text-[10px] text-muted-foreground italic">
          {option.labourNote}
        </p>
      </CardContent>
    </Card>
  );
}
