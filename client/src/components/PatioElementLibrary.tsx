import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus } from "lucide-react";

// ─── Types ─────────────────────────────────────────────────────────────────────

export type ElementType =
  | "sliding-door"
  | "bi-fold"
  | "stacking-door"
  | "fixed-window"
  | "awning-window"
  | "louvre-window";

export type ScreenType = "Fly" | "Pet" | "Diamond" | "Security" | "Invis-gard" | "N/A";

export interface PatioElement {
  id: string;
  type: ElementType;
  label: string;
  width: number; // mm
  height: number; // mm
  screen: ScreenType;
  // Position on the canvas (percentage of container)
  x: number;
  y: number;
}

export const ELEMENT_TYPES: { value: ElementType; label: string; defaultWidth: number; defaultHeight: number }[] = [
  { value: "sliding-door", label: "Sliding Door", defaultWidth: 2400, defaultHeight: 2100 },
  { value: "bi-fold", label: "Bi-Fold Door", defaultWidth: 3600, defaultHeight: 2100 },
  { value: "stacking-door", label: "Stacking Door", defaultWidth: 4800, defaultHeight: 2100 },
  { value: "fixed-window", label: "Fixed Window", defaultWidth: 1200, defaultHeight: 1200 },
  { value: "awning-window", label: "Awning Window", defaultWidth: 900, defaultHeight: 900 },
  { value: "louvre-window", label: "Louvre Window", defaultWidth: 600, defaultHeight: 1200 },
];

export const SCREEN_TYPES: ScreenType[] = ["Fly", "Pet", "Diamond", "Security", "Invis-gard", "N/A"];

// ─── SVG Rendering for each element type ───────────────────────────────────────

interface ElementSvgProps {
  type: ElementType;
  width?: number;
  height?: number;
  selected?: boolean;
}

export function ElementSvg({ type, width = 60, height = 50, selected = false }: ElementSvgProps) {
  const stroke = selected ? "#2563eb" : "#374151";
  const fill = selected ? "#dbeafe" : "#f9fafb";
  const strokeWidth = selected ? 2 : 1;

  switch (type) {
    case "sliding-door":
      return (
        <svg width={width} height={height} viewBox="0 0 60 50">
          <rect x={2} y={2} width={56} height={46} fill={fill} stroke={stroke} strokeWidth={strokeWidth} rx={1} />
          {/* Two panels with arrow showing slide direction */}
          <line x1={30} y1={4} x2={30} y2={46} stroke={stroke} strokeWidth={0.8} />
          <line x1={16} y1={25} x2={26} y2={25} stroke={stroke} strokeWidth={1.5} markerEnd="url(#arrowR)" />
          {/* Frame lines */}
          <rect x={4} y={4} width={24} height={42} fill="none" stroke={stroke} strokeWidth={0.5} />
          <rect x={32} y={4} width={24} height={42} fill="none" stroke={stroke} strokeWidth={0.5} />
        </svg>
      );
    case "bi-fold":
      return (
        <svg width={width} height={height} viewBox="0 0 60 50">
          <rect x={2} y={2} width={56} height={46} fill={fill} stroke={stroke} strokeWidth={strokeWidth} rx={1} />
          {/* Multiple folding panels */}
          {[0, 1, 2, 3].map((i) => (
            <g key={i}>
              <rect x={4 + i * 13} y={4} width={12} height={42} fill="none" stroke={stroke} strokeWidth={0.5} />
              {/* Fold indicator (diagonal line) */}
              {i < 3 && <line x1={16 + i * 13} y1={4} x2={17 + i * 13} y2={46} stroke={stroke} strokeWidth={0.3} strokeDasharray="2,2" />}
            </g>
          ))}
        </svg>
      );
    case "stacking-door":
      return (
        <svg width={width} height={height} viewBox="0 0 60 50">
          <rect x={2} y={2} width={56} height={46} fill={fill} stroke={stroke} strokeWidth={strokeWidth} rx={1} />
          {/* Three stacking panels */}
          {[0, 1, 2].map((i) => (
            <rect key={i} x={4 + i * 18} y={4} width={16} height={42} fill="none" stroke={stroke} strokeWidth={0.5} />
          ))}
          {/* Stacking arrows */}
          <line x1={10} y1={25} x2={18} y2={25} stroke={stroke} strokeWidth={1} />
          <line x1={28} y1={25} x2={36} y2={25} stroke={stroke} strokeWidth={1} />
          <polygon points="18,22 18,28 21,25" fill={stroke} />
          <polygon points="36,22 36,28 39,25" fill={stroke} />
        </svg>
      );
    case "fixed-window":
      return (
        <svg width={width} height={height} viewBox="0 0 60 50">
          <rect x={2} y={2} width={56} height={46} fill={fill} stroke={stroke} strokeWidth={strokeWidth} rx={1} />
          {/* Single fixed pane with cross */}
          <rect x={6} y={6} width={48} height={38} fill="none" stroke={stroke} strokeWidth={0.5} />
          <line x1={30} y1={6} x2={30} y2={44} stroke={stroke} strokeWidth={0.3} strokeDasharray="3,3" />
          <line x1={6} y1={25} x2={54} y2={25} stroke={stroke} strokeWidth={0.3} strokeDasharray="3,3" />
        </svg>
      );
    case "awning-window":
      return (
        <svg width={width} height={height} viewBox="0 0 60 50">
          <rect x={2} y={2} width={56} height={46} fill={fill} stroke={stroke} strokeWidth={strokeWidth} rx={1} />
          {/* Awning opening indicator (hinged at top) */}
          <rect x={6} y={6} width={48} height={38} fill="none" stroke={stroke} strokeWidth={0.5} />
          {/* Hinge at top, opens outward at bottom */}
          <line x1={6} y1={6} x2={30} y2={30} stroke={stroke} strokeWidth={0.5} strokeDasharray="2,2" />
          <line x1={54} y1={6} x2={30} y2={30} stroke={stroke} strokeWidth={0.5} strokeDasharray="2,2" />
          {/* Arrow showing opening direction */}
          <line x1={30} y1={20} x2={30} y2={38} stroke={stroke} strokeWidth={1} />
          <polygon points="27,35 33,35 30,40" fill={stroke} />
        </svg>
      );
    case "louvre-window":
      return (
        <svg width={width} height={height} viewBox="0 0 60 50">
          <rect x={2} y={2} width={56} height={46} fill={fill} stroke={stroke} strokeWidth={strokeWidth} rx={1} />
          {/* Horizontal louvre blades */}
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <line key={i} x1={8} y1={8 + i * 7} x2={52} y2={8 + i * 7} stroke={stroke} strokeWidth={1.5} />
          ))}
          {/* Angled blade indicator */}
          {[0, 1, 2, 3, 4].map((i) => (
            <line key={`a${i}`} x1={8} y1={8 + i * 7} x2={10} y2={12 + i * 7} stroke={stroke} strokeWidth={0.5} opacity={0.5} />
          ))}
        </svg>
      );
    default:
      return null;
  }
}

// ─── Element Library Panel ─────────────────────────────────────────────────────

interface PatioElementLibraryProps {
  onAddElement: (element: Omit<PatioElement, "id" | "x" | "y">) => void;
}

export default function PatioElementLibrary({ onAddElement }: PatioElementLibraryProps) {
  const [selectedType, setSelectedType] = useState<ElementType>("sliding-door");
  const [customWidth, setCustomWidth] = useState<number>(
    ELEMENT_TYPES.find((t) => t.value === "sliding-door")!.defaultWidth
  );
  const [customHeight, setCustomHeight] = useState<number>(
    ELEMENT_TYPES.find((t) => t.value === "sliding-door")!.defaultHeight
  );
  const [screen, setScreen] = useState<ScreenType>("N/A");

  const handleTypeChange = (type: ElementType) => {
    setSelectedType(type);
    const def = ELEMENT_TYPES.find((t) => t.value === type)!;
    setCustomWidth(def.defaultWidth);
    setCustomHeight(def.defaultHeight);
  };

  const handleAdd = () => {
    const def = ELEMENT_TYPES.find((t) => t.value === selectedType)!;
    onAddElement({
      type: selectedType,
      label: def.label,
      width: customWidth,
      height: customHeight,
      screen,
    });
  };

  return (
    <Card>
      <CardHeader className="py-2 px-3">
        <CardTitle className="text-xs">Windows & Doors</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 px-3 pb-3">
        {/* Element type grid */}
        <div className="grid grid-cols-3 gap-1.5">
          {ELEMENT_TYPES.map((et) => (
            <button
              key={et.value}
              onClick={() => handleTypeChange(et.value)}
              className={`flex flex-col items-center gap-0.5 p-1.5 rounded border transition-colors ${
                selectedType === et.value
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-primary/40"
              }`}
            >
              <ElementSvg type={et.value} width={40} height={32} selected={selectedType === et.value} />
              <span className="text-[9px] leading-tight text-center font-medium">{et.label}</span>
            </button>
          ))}
        </div>

        {/* Dimensions */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="text-[10px]">Width (mm)</Label>
            <Input
              type="number"
              value={customWidth}
              onChange={(e) => setCustomWidth(Number(e.target.value))}
              className="h-7 text-xs"
              step={100}
            />
          </div>
          <div>
            <Label className="text-[10px]">Height (mm)</Label>
            <Input
              type="number"
              value={customHeight}
              onChange={(e) => setCustomHeight(Number(e.target.value))}
              className="h-7 text-xs"
              step={100}
            />
          </div>
        </div>

        {/* Screen type */}
        <div>
          <Label className="text-[10px]">Screen Type</Label>
          <Select value={screen} onValueChange={(v) => setScreen(v as ScreenType)}>
            <SelectTrigger className="h-7 text-xs mt-0.5">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SCREEN_TYPES.map((s) => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Add button */}
        <Button size="sm" className="w-full" onClick={handleAdd}>
          <Plus className="h-3 w-3 mr-1" />
          Add to Canvas
        </Button>

        {/* Size presets */}
        <div className="pt-1 border-t">
          <p className="text-[9px] text-muted-foreground font-medium mb-1">Quick Sizes</p>
          <div className="flex flex-wrap gap-1">
            {[
              { w: 1800, h: 2100, label: "1.8m" },
              { w: 2400, h: 2100, label: "2.4m" },
              { w: 3000, h: 2100, label: "3.0m" },
              { w: 3600, h: 2100, label: "3.6m" },
              { w: 4800, h: 2100, label: "4.8m" },
            ].map((preset) => (
              <Badge
                key={preset.label}
                variant="outline"
                className="cursor-pointer text-[9px] hover:bg-primary/10"
                onClick={() => { setCustomWidth(preset.w); setCustomHeight(preset.h); }}
              >
                {preset.label}
              </Badge>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
