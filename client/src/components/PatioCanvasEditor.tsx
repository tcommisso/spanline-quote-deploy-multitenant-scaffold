import { useState, useRef, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Upload, RotateCcw, RotateCw, ZoomIn, ZoomOut, Move, Download } from "lucide-react";
import { CalibrationProvider, CalibrationToolbarControls, CalibrationCanvasOverlay, type CalibrationData } from "./PhotoCalibrationTool";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { PatioStructureOverlay, type RoofStyle, type StructureType, type GutterStyle, type DownpipeStyle } from "./PatioStructureOverlay";
import { COLORBOND_COLOURS, type ColorbondColour } from "@/lib/colorbondColours";
import { compressImage, formatFileSize } from "@/lib/imageCompression";
import { logClientDownload } from "@/lib/userActivity";
import type { ReactNode } from "react";

interface PatioCanvasEditorProps {
  projectId: number;
  photoUrl: string | null;
  overlayState: {
    x: number;
    y: number;
    scale: number;
    rotation: number;
    opacity: number;
  };
  structureState: {
    roofStyle: RoofStyle;
    width: number;
    projection: number;
    roofPitch: number;
    beamHeight: number;
    postHeight: number;
    floorToGround: number;
    postCount: number;
  };
  colours: {
    roof: ColorbondColour;
    beam: ColorbondColour;
    post: ColorbondColour;
    gutter: ColorbondColour;
    fascia: ColorbondColour;
  };
  onOverlayChange: (state: PatioCanvasEditorProps["overlayState"]) => void;
  onStructureChange: (state: PatioCanvasEditorProps["structureState"]) => void;
  onColoursChange: (colours: PatioCanvasEditorProps["colours"]) => void;
  onPhotoUploaded?: (url: string) => void;
  flipped?: boolean;
  structureType?: StructureType;
  gutterStyle?: GutterStyle;
  downpipeStyle?: DownpipeStyle;
  calibrationData?: CalibrationData | null;
  onCalibrationChange?: (data: CalibrationData | null) => void;
  children?: ReactNode;
}

const DISCLAIMER_TEXT = "FOR ILLUSTRATIVE PURPOSES ONLY — NOT A RENDER OF THE FINISHED STRUCTURE";

export default function PatioCanvasEditor({
  projectId,
  photoUrl,
  overlayState,
  structureState,
  colours,
  onOverlayChange,
  onStructureChange,
  onColoursChange,
  onPhotoUploaded,
  flipped,
  structureType,
  gutterStyle,
  downpipeStyle,
  calibrationData,
  onCalibrationChange,
  children,
}: PatioCanvasEditorProps) {

  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [dragMode, setDragMode] = useState<"move" | "idle">("idle");

  const uploadPhoto = trpc.patioPlanner.uploadPhoto.useMutation();

  // Handle photo upload with compression
  const handlePhotoUpload = useCallback(async (file: File) => {
    if (file.size > 20 * 1024 * 1024) {
      toast.error("File too large — maximum 20MB");
      return;
    }
    try {
      const compressed = await compressImage(file, {
        maxDimension: 2048,
        quality: 0.8,
        maxFileSize: 1.5 * 1024 * 1024,
      });

      if (compressed.originalSize > compressed.compressedSize) {
        const savings = ((1 - compressed.compressionRatio) * 100).toFixed(0);
        toast.info(
          `Compressed: ${formatFileSize(compressed.originalSize)} → ${formatFileSize(compressed.compressedSize)} (${savings}% smaller)`
        );
      }

      const uploaded = await uploadPhoto.mutateAsync({
        id: projectId,
        base64: compressed.base64,
        mimeType: "image/jpeg",
        fileName: file.name.replace(/\.[^.]+$/, ".jpg"),
      });
      onPhotoUploaded?.(uploaded.url);
      toast.success("Photo uploaded");
    } catch (e: any) {
      toast.error(`Upload failed: ${e.message}`);
    }
  }, [projectId, uploadPhoto, onPhotoUploaded]);

  // Drag handlers
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (dragMode !== "move") return;
    e.preventDefault();
    setIsDragging(true);
    setDragStart({ x: e.clientX - overlayState.x, y: e.clientY - overlayState.y });
  }, [dragMode, overlayState.x, overlayState.y]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging) return;
    const containerRect = canvasContainerRef.current?.getBoundingClientRect();
    if (!containerRect) return;
    const newX = e.clientX - dragStart.x;
    const newY = e.clientY - dragStart.y;
    onOverlayChange({ ...overlayState, x: newX, y: newY });
  }, [isDragging, dragStart, overlayState, onOverlayChange]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  // Touch handlers for mobile
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (dragMode !== "move") return;
    const touch = e.touches[0];
    setIsDragging(true);
    setDragStart({ x: touch.clientX - overlayState.x, y: touch.clientY - overlayState.y });
  }, [dragMode, overlayState.x, overlayState.y]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isDragging) return;
    const touch = e.touches[0];
    const newX = touch.clientX - dragStart.x;
    const newY = touch.clientY - dragStart.y;
    onOverlayChange({ ...overlayState, x: newX, y: newY });
  }, [isDragging, dragStart, overlayState, onOverlayChange]);

  // Export as composite image
  const handleExport = useCallback(async () => {
    const container = canvasContainerRef.current;
    if (!container) return;

    const canvas = document.createElement("canvas");
    const rect = container.getBoundingClientRect();
    canvas.width = rect.width * 2;
    canvas.height = rect.height * 2;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(2, 2);

    if (photoUrl) {
      const img = new Image();
      img.crossOrigin = "anonymous";
      await new Promise<void>((resolve) => {
        img.onload = () => {
          ctx.drawImage(img, 0, 0, rect.width, rect.height);
          resolve();
        };
        img.onerror = () => resolve();
        img.src = photoUrl;
      });
    } else {
      ctx.fillStyle = "#f0f0f0";
      ctx.fillRect(0, 0, rect.width, rect.height);
    }

    ctx.save();
    ctx.globalAlpha = 0.7;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, rect.height - 36, rect.width, 36);
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#fff";
    ctx.font = "bold 11px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(DISCLAIMER_TEXT, rect.width / 2, rect.height - 14);
    ctx.restore();

    const link = document.createElement("a");
    const filename = `patio-planner-${projectId}.png`;
    link.download = filename;
    link.href = canvas.toDataURL("image/png");
    link.click();
    logClientDownload({
      filename,
      source: "patio_planner_image_export",
      entityType: "patio_project",
      entityId: projectId,
      mimeType: "image/png",
    });
    toast.success("Image exported with disclaimer");
  }, [photoUrl, projectId]);

  const handleAutoScale = useCallback((pixelsPerMm: number) => {
    // SVG uses SCALE = 0.08 (1mm = 0.08 SVG px)
    // overlayScale adjusts the CSS transform scale
    // We want: overlayScale * SVG_SCALE = pixelsPerMm
    const SVG_SCALE = 0.08;
    const newScale = pixelsPerMm / SVG_SCALE;
    const clampedScale = Math.max(0.1, Math.min(5, newScale));
    onOverlayChange({ ...overlayState, scale: clampedScale });
    toast.success(`Scale calibrated: ${pixelsPerMm.toFixed(3)} px/mm — overlay auto-scaled to ${Math.round(clampedScale * 100)}%`);
  }, [overlayState, onOverlayChange]);

  const showCalibration = !!photoUrl && !!onCalibrationChange;

  const canvasContent = (
    <div className="flex flex-col lg:flex-row gap-4 h-full">
      {/* Canvas Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 p-2 bg-muted/50 rounded-t-lg border border-b-0">
          <Button
            variant={dragMode === "move" ? "default" : "outline"}
            size="sm"
            className="h-8 w-8 p-0 sm:h-9 sm:w-auto sm:px-3"
            onClick={() => setDragMode(dragMode === "move" ? "idle" : "move")}
            title="Move overlay"
          >
            <Move className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
          </Button>
          <div className="h-5 w-px bg-border hidden sm:block" />
          <Button variant="outline" size="sm" className="h-8 w-8 p-0 sm:h-9 sm:w-auto sm:px-3" onClick={() => onOverlayChange({ ...overlayState, rotation: overlayState.rotation - 1 })} title="Rotate left">
            <RotateCcw className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
          </Button>
          <Button variant="outline" size="sm" className="h-8 w-8 p-0 sm:h-9 sm:w-auto sm:px-3" onClick={() => onOverlayChange({ ...overlayState, rotation: overlayState.rotation + 1 })} title="Rotate right">
            <RotateCw className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
          </Button>
          <div className="h-5 w-px bg-border hidden sm:block" />
          <Button variant="outline" size="sm" className="h-8 w-8 p-0 sm:h-9 sm:w-auto sm:px-3" onClick={() => onOverlayChange({ ...overlayState, scale: Math.max(0.2, overlayState.scale - 0.1) })} title="Zoom out">
            <ZoomOut className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
          </Button>
          <span className="text-[10px] sm:text-xs font-mono w-10 sm:w-12 text-center">{Math.round(overlayState.scale * 100)}%</span>
          <Button variant="outline" size="sm" className="h-8 w-8 p-0 sm:h-9 sm:w-auto sm:px-3" onClick={() => onOverlayChange({ ...overlayState, scale: Math.min(3, overlayState.scale + 0.1) })} title="Zoom in">
            <ZoomIn className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
          </Button>
          <div className="h-5 w-px bg-border hidden sm:block" />
          <div className="flex items-center gap-1.5 sm:gap-2 flex-1 min-w-[120px]">
            <Label className="text-[10px] sm:text-xs whitespace-nowrap">Opacity</Label>
            <Slider
              value={[overlayState.opacity * 100]}
              onValueChange={([v]) => onOverlayChange({ ...overlayState, opacity: v / 100 })}
              min={10}
              max={100}
              step={5}
              className="w-16 sm:w-24"
            />
            <span className="text-[10px] sm:text-xs font-mono w-8">{Math.round(overlayState.opacity * 100)}%</span>
          </div>
          {/* Calibration button (in toolbar) */}
          {showCalibration && <CalibrationToolbarControls />}
          <Button variant="outline" size="sm" className="h-8 px-2 sm:h-9 sm:px-3" onClick={handleExport} title="Export composite image">
            <Download className="h-3.5 w-3.5 sm:h-4 sm:w-4 sm:mr-1" />
            <span className="hidden sm:inline">Export</span>
          </Button>
        </div>

        {/* Canvas */}
        <div
          ref={canvasContainerRef}
          className="relative flex-1 min-h-[280px] sm:min-h-[400px] lg:min-h-[500px] bg-neutral-100 border rounded-b-lg overflow-hidden select-none"
          style={{ cursor: dragMode === "move" ? (isDragging ? "grabbing" : "grab") : "default" }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleMouseUp}
        >
          {/* Background Photo */}
          {photoUrl ? (
            <img
              src={photoUrl}
              alt="Site photo"
              className="absolute inset-0 w-full h-full object-cover pointer-events-none"
              draggable={false}
            />
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground">
              <Upload className="h-12 w-12 mb-3 opacity-40" />
              <p className="text-sm font-medium">Upload a site photo</p>
              <p className="text-xs mt-1">Drag & drop or click to browse</p>
              <input
                type="file"
                accept="image/*"
                className="absolute inset-0 opacity-0 cursor-pointer"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void handlePhotoUpload(file);
                  e.currentTarget.value = "";
                }}
              />
            </div>
          )}

          {/* Structure Overlay */}
          {photoUrl && (
            <div
              className="absolute pointer-events-none"
              style={{
                left: `${overlayState.x}px`,
                top: `${overlayState.y}px`,
                transform: `scale(${overlayState.scale}) rotate(${overlayState.rotation}deg)`,
                transformOrigin: "center center",
                opacity: overlayState.opacity,
              }}
            >
              <PatioStructureOverlay
                roofStyle={structureState.roofStyle}
                structureType={structureType}
                width={structureState.width}
                projection={structureState.projection}
                roofPitch={structureState.roofPitch}
                beamHeight={structureState.beamHeight}
                postHeight={structureState.postHeight}
                floorToGround={structureState.floorToGround}
                postCount={structureState.postCount}
                flipped={flipped}
                gutterStyle={gutterStyle}
                downpipeStyle={downpipeStyle}
                colours={colours}
              />
            </div>
          )}

          {/* Placed elements overlay (windows/doors) */}
          {children}

          {/* Calibration reference line overlay */}
          {showCalibration && <CalibrationCanvasOverlay />}

          {/* Disclaimer Watermark */}
          <div className="absolute bottom-0 left-0 right-0 bg-black/70 text-white text-[10px] sm:text-xs font-bold text-center py-1.5 px-2 pointer-events-none tracking-wide">
            {DISCLAIMER_TEXT}
          </div>

          {/* Upload overlay when photo exists */}
          {photoUrl && (
            <label className="absolute top-2 right-2 z-10">
              <Button variant="secondary" size="sm" className="pointer-events-auto shadow-md" asChild>
                <span>
                  <Upload className="h-3 w-3 mr-1" />
                  Change Photo
                </span>
              </Button>
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void handlePhotoUpload(file);
                  e.currentTarget.value = "";
                }}
              />
            </label>
          )}
        </div>
      </div>
    </div>
  );

  // Wrap with CalibrationProvider if calibration is enabled
  if (showCalibration) {
    return (
      <CalibrationProvider
        containerRef={canvasContainerRef}
        calibrationData={calibrationData ?? null}
        onCalibrationChange={onCalibrationChange!}
        onAutoScale={handleAutoScale}
        photoUrl={photoUrl}
      >
        {canvasContent}
      </CalibrationProvider>
    );
  }

  return canvasContent;
}
