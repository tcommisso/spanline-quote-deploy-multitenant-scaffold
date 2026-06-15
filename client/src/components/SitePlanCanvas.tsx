import { useEffect, useRef, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import ConfirmDeleteDialog from "@/components/ConfirmDeleteDialog";
import {
  Pencil, Square, Circle, Minus, Type, Undo2, Redo2, Trash2, Download, Upload, Move, MousePointer, Eraser,
} from "lucide-react";
import { Canvas, Rect, Circle as FabricCircle, Line, IText, PencilBrush, FabricObject } from "fabric";

type Tool = "select" | "pencil" | "rect" | "circle" | "line" | "text" | "eraser";

interface SitePlanCanvasProps {
  initialData?: string | null; // JSON string from DB
  onSave?: (dataJson: string, dataUrl: string) => void;
  width?: number;
  height?: number;
  readOnly?: boolean;
}

export default function SitePlanCanvas({
  initialData,
  onSave,
  width = 800,
  height = 500,
  readOnly = false,
}: SitePlanCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fabricRef = useRef<Canvas | null>(null);
  const [activeTool, setActiveTool] = useState<Tool>("select");
  const [strokeColor, setStrokeColor] = useState("#1e40af");
  const [strokeWidth, setStrokeWidth] = useState(2);
  const [history, setHistory] = useState<string[]>([]);
  const [historyIdx, setHistoryIdx] = useState(-1);
  const isDrawingShape = useRef(false);
  const shapeStart = useRef({ x: 0, y: 0 });

  // Initialize canvas
  useEffect(() => {
    if (!canvasRef.current) return;
    const canvas = new Canvas(canvasRef.current, {
      width,
      height,
      backgroundColor: "#ffffff",
      selection: true,
    });
    fabricRef.current = canvas;

    // Load initial data
    if (initialData) {
      try {
        canvas.loadFromJSON(JSON.parse(initialData)).then(() => {
          canvas.renderAll();
          saveHistory();
        });
      } catch (e) {
        console.warn("Failed to load site plan data:", e);
      }
    } else {
      saveHistory();
    }

    // Listen for object modifications
    canvas.on("object:modified", saveHistory);
    canvas.on("object:added", saveHistory);
    canvas.on("object:removed", saveHistory);

    return () => {
      canvas.dispose();
      fabricRef.current = null;
    };
  }, []);

  const saveHistory = useCallback(() => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    const json = JSON.stringify(canvas.toJSON());
    setHistory((prev) => {
      const newHistory = prev.slice(0, historyIdx + 1);
      newHistory.push(json);
      setHistoryIdx(newHistory.length - 1);
      return newHistory;
    });
  }, [historyIdx]);

  const undo = useCallback(() => {
    if (historyIdx <= 0) return;
    const canvas = fabricRef.current;
    if (!canvas) return;
    const newIdx = historyIdx - 1;
    canvas.loadFromJSON(JSON.parse(history[newIdx])).then(() => {
      canvas.renderAll();
      setHistoryIdx(newIdx);
    });
  }, [history, historyIdx]);

  const redo = useCallback(() => {
    if (historyIdx >= history.length - 1) return;
    const canvas = fabricRef.current;
    if (!canvas) return;
    const newIdx = historyIdx + 1;
    canvas.loadFromJSON(JSON.parse(history[newIdx])).then(() => {
      canvas.renderAll();
      setHistoryIdx(newIdx);
    });
  }, [history, historyIdx]);

  // Tool switching
  useEffect(() => {
    const canvas = fabricRef.current;
    if (!canvas) return;

    // Reset drawing mode
    canvas.isDrawingMode = false;
    canvas.selection = true;
    canvas.defaultCursor = "default";

    if (activeTool === "pencil") {
      canvas.isDrawingMode = true;
      canvas.freeDrawingBrush = new PencilBrush(canvas);
      canvas.freeDrawingBrush.color = strokeColor;
      canvas.freeDrawingBrush.width = strokeWidth;
    } else if (activeTool === "eraser") {
      canvas.isDrawingMode = false;
      canvas.defaultCursor = "crosshair";
    } else if (activeTool === "select") {
      canvas.selection = true;
    } else {
      canvas.selection = false;
      canvas.defaultCursor = "crosshair";
    }
  }, [activeTool, strokeColor, strokeWidth]);

  // Shape drawing handlers
  useEffect(() => {
    const canvas = fabricRef.current;
    if (!canvas) return;

    const handleMouseDown = (opt: any) => {
      if (activeTool === "eraser") {
        const target = canvas.findTarget(opt.e);
        if (target) {
          canvas.remove(target);
          canvas.renderAll();
        }
        return;
      }
      if (!["rect", "circle", "line", "text"].includes(activeTool)) return;

      if (activeTool === "text") {
        const pointer = canvas.getScenePoint(opt.e);
        const text = new IText("Text", {
          left: pointer.x,
          top: pointer.y,
          fontSize: 16,
          fill: strokeColor,
          fontFamily: "Arial",
        });
        canvas.add(text);
        canvas.setActiveObject(text);
        text.enterEditing();
        setActiveTool("select");
        return;
      }

      isDrawingShape.current = true;
      const pointer = canvas.getScenePoint(opt.e);
      shapeStart.current = { x: pointer.x, y: pointer.y };
    };

    const handleMouseUp = (opt: any) => {
      if (!isDrawingShape.current) return;
      isDrawingShape.current = false;
      const pointer = canvas.getScenePoint(opt.e);
      const { x: sx, y: sy } = shapeStart.current;
      const ex = pointer.x;
      const ey = pointer.y;

      if (activeTool === "rect") {
        const rect = new Rect({
          left: Math.min(sx, ex),
          top: Math.min(sy, ey),
          width: Math.abs(ex - sx) || 20,
          height: Math.abs(ey - sy) || 20,
          fill: "transparent",
          stroke: strokeColor,
          strokeWidth,
        });
        canvas.add(rect);
      } else if (activeTool === "circle") {
        const radius = Math.sqrt(Math.pow(ex - sx, 2) + Math.pow(ey - sy, 2)) / 2;
        const circle = new FabricCircle({
          left: Math.min(sx, ex),
          top: Math.min(sy, ey),
          radius: radius || 10,
          fill: "transparent",
          stroke: strokeColor,
          strokeWidth,
        });
        canvas.add(circle);
      } else if (activeTool === "line") {
        const line = new Line([sx, sy, ex, ey], {
          stroke: strokeColor,
          strokeWidth,
        });
        canvas.add(line);
      }
      canvas.renderAll();
    };

    canvas.on("mouse:down", handleMouseDown);
    canvas.on("mouse:up", handleMouseUp);

    return () => {
      canvas.off("mouse:down", handleMouseDown);
      canvas.off("mouse:up", handleMouseUp);
    };
  }, [activeTool, strokeColor, strokeWidth]);

  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const handleClear = () => {
    setShowClearConfirm(true);
  };
  const confirmClear = () => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    canvas.clear();
    canvas.backgroundColor = "#ffffff";
    canvas.renderAll();
    setShowClearConfirm(false);
  };

  const handleExportPNG = () => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    const dataUrl = canvas.toDataURL({ format: "png", multiplier: 2 });
    const link = document.createElement("a");
    link.download = "site-plan.png";
    link.href = dataUrl;
    link.click();
  };

  const handleSave = () => {
    const canvas = fabricRef.current;
    if (!canvas || !onSave) return;
    const json = JSON.stringify(canvas.toJSON());
    const dataUrl = canvas.toDataURL({ format: "png", multiplier: 2 });
    onSave(json, dataUrl);
  };

  const getDataUrl = (): string => {
    const canvas = fabricRef.current;
    if (!canvas) return "";
    return canvas.toDataURL({ format: "png", multiplier: 2 });
  };

  // Expose getDataUrl for parent
  useEffect(() => {
    (window as any).__sitePlanGetDataUrl = getDataUrl;
    return () => { delete (window as any).__sitePlanGetDataUrl; };
  });

  const tools: { tool: Tool; icon: any; label: string }[] = [
    { tool: "select", icon: MousePointer, label: "Select" },
    { tool: "pencil", icon: Pencil, label: "Draw" },
    { tool: "line", icon: Minus, label: "Line" },
    { tool: "rect", icon: Square, label: "Rectangle" },
    { tool: "circle", icon: Circle, label: "Circle" },
    { tool: "text", icon: Type, label: "Text" },
    { tool: "eraser", icon: Eraser, label: "Eraser" },
  ];

  return (
    <div className="space-y-3">
      {!readOnly && (
        <div className="flex flex-wrap items-center gap-2 p-2 bg-muted/50 rounded-lg border">
          {/* Tool buttons */}
          {tools.map(({ tool, icon: Icon, label }) => (
            <Button
              key={tool}
              variant={activeTool === tool ? "default" : "ghost"}
              size="sm"
              onClick={() => setActiveTool(tool)}
              title={label}
              className="h-8 w-8 p-0"
            >
              <Icon className="w-4 h-4" />
            </Button>
          ))}
          <Separator orientation="vertical" className="h-6" />
          {/* Color picker */}
          <div className="flex items-center gap-1">
            <input
              type="color"
              value={strokeColor}
              onChange={(e) => setStrokeColor(e.target.value)}
              className="w-7 h-7 rounded border cursor-pointer"
              title="Stroke color"
            />
          </div>
          {/* Stroke width */}
          <div className="flex items-center gap-1">
            <Label className="text-xs">W:</Label>
            <Input
              type="number"
              min={1}
              max={20}
              value={strokeWidth}
              onChange={(e) => setStrokeWidth(parseInt(e.target.value) || 2)}
              className="w-14 h-7 text-xs"
            />
          </div>
          <Separator orientation="vertical" className="h-6" />
          {/* Actions */}
          <Button variant="ghost" size="sm" onClick={undo} title="Undo" className="h-8 w-8 p-0">
            <Undo2 className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={redo} title="Redo" className="h-8 w-8 p-0">
            <Redo2 className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={handleClear} title="Clear all" className="h-8 w-8 p-0">
            <Trash2 className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={handleExportPNG} title="Export PNG" className="h-8 w-8 p-0">
            <Download className="w-4 h-4" />
          </Button>
          {onSave && (
            <Button variant="outline" size="sm" onClick={handleSave} className="h-8 ml-auto">
              Save Drawing
            </Button>
          )}
        </div>
      )}
      <div className="border rounded-lg overflow-hidden bg-white" style={{ width, height }}>
        <canvas ref={canvasRef} />
      </div>
      <ConfirmDeleteDialog
        open={showClearConfirm}
        onOpenChange={setShowClearConfirm}
        onConfirm={confirmClear}
        title="Clear Drawing?"
        description="This will erase the entire site plan drawing. This action cannot be undone."
      />
    </div>
  );
}
