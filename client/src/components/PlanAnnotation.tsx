import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Pen, Eraser, Undo2, Download, X, Circle, Square, Type, Minus } from "lucide-react";
import { toast } from "sonner";

type Tool = "pen" | "line" | "circle" | "rectangle" | "eraser";
type DrawAction = {
  tool: Tool;
  color: string;
  lineWidth: number;
  points: { x: number; y: number }[];
};

interface PlanAnnotationProps {
  open: boolean;
  onClose: () => void;
  imageUrl: string;
  planTitle: string;
  onSave?: (annotatedImageBase64: string) => void;
}

const COLORS = ["#ef4444", "#f97316", "#eab308", "#22c55e", "#3b82f6", "#8b5cf6", "#000000"];
const LINE_WIDTHS = [2, 4, 6, 8];

export function PlanAnnotation({ open, onClose, imageUrl, planTitle, onSave }: PlanAnnotationProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [tool, setTool] = useState<Tool>("pen");
  const [color, setColor] = useState("#ef4444");
  const [lineWidth, setLineWidth] = useState(4);
  const [actions, setActions] = useState<DrawAction[]>([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentPoints, setCurrentPoints] = useState<{ x: number; y: number }[]>([]);
  const [imageLoaded, setImageLoaded] = useState(false);
  const imgRef = useRef<HTMLImageElement | null>(null);

  // Load image
  useEffect(() => {
    if (!open) return;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      imgRef.current = img;
      setImageLoaded(true);
    };
    img.onerror = () => toast.error("Failed to load plan image for annotation");
    img.src = imageUrl;
  }, [open, imageUrl]);

  // Setup canvas dimensions
  useEffect(() => {
    if (!imageLoaded || !imgRef.current || !canvasRef.current || !overlayCanvasRef.current || !containerRef.current) return;
    const container = containerRef.current;
    const img = imgRef.current;
    const maxW = container.clientWidth - 32;
    const maxH = container.clientHeight - 32;
    const scale = Math.min(maxW / img.width, maxH / img.height, 1);
    const w = Math.floor(img.width * scale);
    const h = Math.floor(img.height * scale);

    canvasRef.current.width = w;
    canvasRef.current.height = h;
    overlayCanvasRef.current.width = w;
    overlayCanvasRef.current.height = h;

    redraw();
  }, [imageLoaded, actions]);

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    // Replay all actions
    for (const action of actions) {
      drawAction(ctx, action);
    }
  }, [actions]);

  const drawAction = (ctx: CanvasRenderingContext2D, action: DrawAction) => {
    ctx.strokeStyle = action.tool === "eraser" ? "#ffffff" : action.color;
    ctx.lineWidth = action.tool === "eraser" ? action.lineWidth * 3 : action.lineWidth;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    if (action.points.length < 2) return;

    if (action.tool === "pen" || action.tool === "eraser") {
      ctx.beginPath();
      ctx.moveTo(action.points[0].x, action.points[0].y);
      for (let i = 1; i < action.points.length; i++) {
        ctx.lineTo(action.points[i].x, action.points[i].y);
      }
      ctx.stroke();
    } else if (action.tool === "line") {
      const start = action.points[0];
      const end = action.points[action.points.length - 1];
      ctx.beginPath();
      ctx.moveTo(start.x, start.y);
      ctx.lineTo(end.x, end.y);
      ctx.stroke();
    } else if (action.tool === "circle") {
      const start = action.points[0];
      const end = action.points[action.points.length - 1];
      const rx = Math.abs(end.x - start.x) / 2;
      const ry = Math.abs(end.y - start.y) / 2;
      const cx = (start.x + end.x) / 2;
      const cy = (start.y + end.y) / 2;
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      ctx.stroke();
    } else if (action.tool === "rectangle") {
      const start = action.points[0];
      const end = action.points[action.points.length - 1];
      ctx.beginPath();
      ctx.strokeRect(start.x, start.y, end.x - start.x, end.y - start.y);
    }
  };

  const getCanvasPoint = (e: React.MouseEvent | React.TouchEvent): { x: number; y: number } | null => {
    const canvas = overlayCanvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    let clientX: number, clientY: number;
    if ("touches" in e) {
      if (e.touches.length === 0) return null;
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }
    return {
      x: clientX - rect.left,
      y: clientY - rect.top,
    };
  };

  const handlePointerDown = (e: React.MouseEvent | React.TouchEvent) => {
    const point = getCanvasPoint(e);
    if (!point) return;
    setIsDrawing(true);
    setCurrentPoints([point]);
  };

  const handlePointerMove = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing) return;
    const point = getCanvasPoint(e);
    if (!point) return;
    const newPoints = [...currentPoints, point];
    setCurrentPoints(newPoints);

    // Draw preview on overlay canvas
    const overlay = overlayCanvasRef.current;
    if (!overlay) return;
    const ctx = overlay.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, overlay.width, overlay.height);
    drawAction(ctx, { tool, color, lineWidth, points: newPoints });
  };

  const handlePointerUp = () => {
    if (!isDrawing) return;
    setIsDrawing(false);
    if (currentPoints.length >= 2) {
      setActions(prev => [...prev, { tool, color, lineWidth, points: currentPoints }]);
    }
    setCurrentPoints([]);
    // Clear overlay
    const overlay = overlayCanvasRef.current;
    if (overlay) {
      const ctx = overlay.getContext("2d");
      if (ctx) ctx.clearRect(0, 0, overlay.width, overlay.height);
    }
  };

  const handleUndo = () => {
    setActions(prev => prev.slice(0, -1));
  };

  const handleDownload = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const link = document.createElement("a");
    link.download = `${planTitle}-annotated.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
    toast.success("Annotated plan downloaded");
  };

  const handleSave = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const base64 = canvas.toDataURL("image/png").split(",")[1];
    onSave?.(base64);
    onClose();
    toast.success("Annotation saved");
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-[95vw] w-[95vw] max-h-[95vh] h-[95vh] p-0 flex flex-col">
        <DialogHeader className="px-4 py-3 border-b flex-shrink-0">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-base">Annotate: {planTitle}</DialogTitle>
            <Button variant="ghost" size="sm" onClick={onClose}><X className="h-4 w-4" /></Button>
          </div>
        </DialogHeader>

        {/* Toolbar */}
        <div className="px-4 py-2 border-b flex items-center gap-3 flex-wrap flex-shrink-0">
          {/* Tools */}
          <div className="flex items-center gap-1 border rounded-md p-0.5">
            <Button variant={tool === "pen" ? "default" : "ghost"} size="sm" className="h-7 w-7 p-0" onClick={() => setTool("pen")} title="Pen">
              <Pen className="h-3.5 w-3.5" />
            </Button>
            <Button variant={tool === "line" ? "default" : "ghost"} size="sm" className="h-7 w-7 p-0" onClick={() => setTool("line")} title="Line">
              <Minus className="h-3.5 w-3.5" />
            </Button>
            <Button variant={tool === "circle" ? "default" : "ghost"} size="sm" className="h-7 w-7 p-0" onClick={() => setTool("circle")} title="Circle">
              <Circle className="h-3.5 w-3.5" />
            </Button>
            <Button variant={tool === "rectangle" ? "default" : "ghost"} size="sm" className="h-7 w-7 p-0" onClick={() => setTool("rectangle")} title="Rectangle">
              <Square className="h-3.5 w-3.5" />
            </Button>
            <Button variant={tool === "eraser" ? "default" : "ghost"} size="sm" className="h-7 w-7 p-0" onClick={() => setTool("eraser")} title="Eraser">
              <Eraser className="h-3.5 w-3.5" />
            </Button>
          </div>

          {/* Colors */}
          <div className="flex items-center gap-1">
            {COLORS.map(c => (
              <button
                key={c}
                className={`h-6 w-6 rounded-full border-2 ${color === c ? "border-foreground scale-110" : "border-transparent"}`}
                style={{ backgroundColor: c }}
                onClick={() => setColor(c)}
              />
            ))}
          </div>

          {/* Line width */}
          <div className="flex items-center gap-1">
            {LINE_WIDTHS.map(w => (
              <button
                key={w}
                className={`h-7 w-7 rounded flex items-center justify-center border ${lineWidth === w ? "border-foreground bg-accent" : "border-transparent"}`}
                onClick={() => setLineWidth(w)}
              >
                <div className="rounded-full bg-foreground" style={{ width: w + 2, height: w + 2 }} />
              </button>
            ))}
          </div>

          <div className="flex-1" />

          {/* Actions */}
          <Button variant="outline" size="sm" onClick={handleUndo} disabled={actions.length === 0}>
            <Undo2 className="h-3.5 w-3.5 mr-1" /> Undo
          </Button>
          <Button variant="outline" size="sm" onClick={handleDownload}>
            <Download className="h-3.5 w-3.5 mr-1" /> Download
          </Button>
          {onSave && (
            <Button size="sm" onClick={handleSave} disabled={actions.length === 0}>
              Save Annotation
            </Button>
          )}
        </div>

        {/* Canvas area */}
        <div ref={containerRef} className="flex-1 overflow-auto flex items-center justify-center bg-muted/30 p-4">
          {!imageLoaded ? (
            <p className="text-muted-foreground">Loading plan image...</p>
          ) : (
            <div className="relative inline-block">
              <canvas
                ref={canvasRef}
                className="border rounded shadow-sm"
              />
              <canvas
                ref={overlayCanvasRef}
                className="absolute top-0 left-0 cursor-crosshair"
                onMouseDown={handlePointerDown}
                onMouseMove={handlePointerMove}
                onMouseUp={handlePointerUp}
                onMouseLeave={handlePointerUp}
                onTouchStart={handlePointerDown}
                onTouchMove={handlePointerMove}
                onTouchEnd={handlePointerUp}
              />
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
