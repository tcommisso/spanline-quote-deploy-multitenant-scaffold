import { useState, useCallback, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { X, GripVertical } from "lucide-react";
import { ElementSvg, SCREEN_TYPES, type PatioElement, type ScreenType } from "./PatioElementLibrary";

interface PatioPlacedElementsProps {
  elements: PatioElement[];
  onChange: (elements: PatioElement[]) => void;
  readOnly?: boolean;
  structureWidth?: number; // mm - for proportional scaling
  structureHeight?: number; // mm - for proportional scaling
}

export default function PatioPlacedElements({
  elements,
  onChange,
  readOnly = false,
  structureWidth = 6000,
  structureHeight = 2700,
}: PatioPlacedElementsProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const dragOffset = useRef({ x: 0, y: 0 });

  // Drag start
  const handleDragStart = useCallback(
    (e: React.MouseEvent | React.TouchEvent, elementId: string) => {
      if (readOnly) return;
      e.preventDefault();
      e.stopPropagation();
      const container = containerRef.current;
      if (!container) return;

      const rect = container.getBoundingClientRect();
      const element = elements.find((el) => el.id === elementId);
      if (!element) return;

      const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
      const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;

      // Current position in pixels
      const currentPx = {
        x: (element.x / 100) * rect.width,
        y: (element.y / 100) * rect.height,
      };

      dragOffset.current = {
        x: clientX - rect.left - currentPx.x,
        y: clientY - rect.top - currentPx.y,
      };

      setDraggingId(elementId);
      setSelectedId(elementId);
    },
    [elements, readOnly]
  );

  // Drag move
  useEffect(() => {
    if (!draggingId) return;

    const handleMove = (e: MouseEvent | TouchEvent) => {
      const container = containerRef.current;
      if (!container) return;

      const rect = container.getBoundingClientRect();
      const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
      const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;

      const newX = clientX - rect.left - dragOffset.current.x;
      const newY = clientY - rect.top - dragOffset.current.y;

      // Convert to percentage and clamp
      const pctX = Math.max(0, Math.min(100, (newX / rect.width) * 100));
      const pctY = Math.max(0, Math.min(100, (newY / rect.height) * 100));

      onChange(
        elements.map((el) =>
          el.id === draggingId ? { ...el, x: pctX, y: pctY } : el
        )
      );
    };

    const handleUp = () => {
      setDraggingId(null);
    };

    document.addEventListener("mousemove", handleMove);
    document.addEventListener("mouseup", handleUp);
    document.addEventListener("touchmove", handleMove);
    document.addEventListener("touchend", handleUp);

    return () => {
      document.removeEventListener("mousemove", handleMove);
      document.removeEventListener("mouseup", handleUp);
      document.removeEventListener("touchmove", handleMove);
      document.removeEventListener("touchend", handleUp);
    };
  }, [draggingId, elements, onChange]);

  // Delete element
  const handleDelete = useCallback(
    (id: string) => {
      onChange(elements.filter((el) => el.id !== id));
      if (selectedId === id) setSelectedId(null);
    },
    [elements, onChange, selectedId]
  );

  // Update screen type
  const handleScreenChange = useCallback(
    (id: string, screen: ScreenType) => {
      onChange(elements.map((el) => (el.id === id ? { ...el, screen } : el)));
    },
    [elements, onChange]
  );

  // Compute scaled pixel dimensions for an element
  const getScaledSize = (element: PatioElement) => {
    const scaleFactor = element.width / structureWidth;
    const pxWidth = Math.max(32, Math.min(160, scaleFactor * 300));
    const pxHeight = Math.max(24, Math.min(120, (element.height / element.width) * pxWidth));
    return { pxWidth, pxHeight };
  };

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 pointer-events-none z-10"
    >
      {elements.map((element) => {
        const isSelected = selectedId === element.id;
        const isDragging = draggingId === element.id;
        const { pxWidth, pxHeight } = getScaledSize(element);

        return (
          <div
            key={element.id}
            className={`absolute pointer-events-auto group transition-shadow ${
              isDragging ? "z-50" : "z-20"
            } ${isSelected ? "ring-2 ring-primary ring-offset-1" : ""}`}
            style={{
              left: `${element.x}%`,
              top: `${element.y}%`,
              transform: "translate(-50%, -50%)",
              cursor: readOnly ? "default" : isDragging ? "grabbing" : "grab",
            }}
            onClick={(e) => {
              e.stopPropagation();
              setSelectedId(isSelected ? null : element.id);
            }}
            onMouseDown={(e) => handleDragStart(e, element.id)}
            onTouchStart={(e) => handleDragStart(e, element.id)}
          >
            {/* Element visual - scaled proportionally to structure */}
            <div className={`relative bg-white/90 rounded shadow-sm border ${isSelected ? "border-primary" : "border-gray-300"} p-0.5`}>
              <ElementSvg type={element.type} width={pxWidth} height={pxHeight} selected={isSelected} />

              {/* Label */}
              <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 whitespace-nowrap">
                <span className="text-[8px] bg-black/70 text-white px-1 py-0.5 rounded font-medium">
                  {element.width}×{element.height}
                </span>
              </div>

              {/* Drag handle (visible on hover) */}
              {!readOnly && (
                <div className="absolute -top-2 -left-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <GripVertical className="h-3 w-3 text-muted-foreground" />
                </div>
              )}

              {/* Delete button - always visible on hover, not just when selected */}
              {!readOnly && (
                <button
                  className={`absolute -top-2 -right-2 bg-destructive text-destructive-foreground rounded-full w-4 h-4 flex items-center justify-center shadow-sm hover:scale-110 transition-all ${
                    isSelected ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                  }`}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete(element.id);
                  }}
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              )}
            </div>

            {/* Screen type indicator */}
            {element.screen !== "N/A" && (
              <div className="absolute -bottom-7 left-1/2 -translate-x-1/2 whitespace-nowrap">
                <span className="text-[7px] bg-blue-600/80 text-white px-1 py-0.5 rounded">
                  {element.screen}
                </span>
              </div>
            )}
          </div>
        );
      })}

      {/* Selected element controls panel - shows at bottom when an element is selected */}
      {selectedId && !readOnly && (
        <SelectedElementPanel
          element={elements.find((el) => el.id === selectedId)!}
          onScreenChange={(screen) => handleScreenChange(selectedId, screen)}
          onDelete={() => handleDelete(selectedId)}
        />
      )}
    </div>
  );
}

// ─── Selected Element Panel ────────────────────────────────────────────────────

function SelectedElementPanel({
  element,
  onScreenChange,
  onDelete,
}: {
  element: PatioElement;
  onScreenChange: (screen: ScreenType) => void;
  onDelete: () => void;
}) {
  if (!element) return null;

  return (
    <div className="absolute bottom-2 left-2 right-2 pointer-events-auto bg-white/95 backdrop-blur rounded-lg shadow-lg border p-2 flex items-center gap-2 z-50">
      <ElementSvg type={element.type} width={32} height={24} />
      <div className="flex-1 min-w-0">
        <p className="text-[10px] font-semibold truncate">{element.label}</p>
        <p className="text-[9px] text-muted-foreground">{element.width}mm × {element.height}mm</p>
      </div>
      <Select value={element.screen} onValueChange={(v) => onScreenChange(v as ScreenType)}>
        <SelectTrigger className="h-6 w-24 text-[10px]">
          <SelectValue placeholder="Screen" />
        </SelectTrigger>
        <SelectContent>
          {SCREEN_TYPES.map((s) => (
            <SelectItem key={s} value={s} className="text-xs">{s}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button variant="destructive" size="sm" className="h-6 px-2 text-[10px]" onClick={onDelete}>
        <X className="h-3 w-3" /> Delete
      </Button>
    </div>
  );
}
