/**
 * QuoteAIRender — Reusable AI render panel for Structure, Deck, and Eclipse quote editors.
 * Provides photo upload, calibration, generate, history, favourite, delete, compare, and style preset selection.
 */
import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { RENDER_STYLE_PRESETS } from "../../../shared/render-style-presets";
import {
  Sparkles, Zap, Trash2, Star, Download, Eye, ChevronDown, ChevronUp, Loader2,
  Camera, X, ImageIcon, ArrowLeftRight
} from "lucide-react";
import { compressImage, formatFileSize } from "@/lib/imageCompression";
import {
  CalibrationProvider,
  CalibrationToolbarControls,
  CalibrationCanvasOverlay,
  type CalibrationData,
} from "@/components/PhotoCalibrationTool";

interface RenderHistoryEntry {
  id: string;
  imageUrl: string;
  prompt: string;
  promptMode: "full" | "quick";
  createdAt: number;
  isFavourite?: boolean;
  stylePreset?: string;
}

interface QuoteAIRenderProps {
  quoteId: number;
  quoteType: "structure" | "deck" | "eclipse";
}

export function QuoteAIRender({ quoteId, quoteType }: QuoteAIRenderProps) {
  const [generating, setGenerating] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [selectedPreset, setSelectedPreset] = useState<string>("none");
  const [expanded, setExpanded] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [compareMode, setCompareMode] = useState(false);
  const [renderInstructions, setRenderInstructions] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const photoContainerRef = useRef<HTMLDivElement>(null);
  const renderInstructionsLoadedRef = useRef(false);
  const renderInstructionsSavedRef = useRef("");

  // Fetch render history
  const historyQuery = quoteType === "deck"
    ? trpc.quoteRender.deckHistory.useQuery({ quoteId })
    : quoteType === "eclipse"
      ? trpc.quoteRender.eclipseHistory.useQuery({ quoteId })
      : trpc.quoteRender.structureHistory.useQuery({ quoteId });

  // Fetch photo info (includes calibrationData)
  const photoQuery = quoteType === "deck"
    ? trpc.quoteRender.getDeckPhoto.useQuery({ quoteId })
    : quoteType === "eclipse"
      ? trpc.quoteRender.getEclipsePhoto.useQuery({ quoteId })
      : trpc.quoteRender.getStructurePhoto.useQuery({ quoteId });

  const photoUrl = photoQuery.data?.photoUrl || null;
  const calibrationData = (photoQuery.data?.calibrationData as CalibrationData | null) || null;

  const renderHistory: RenderHistoryEntry[] = (historyQuery.data as RenderHistoryEntry[] | undefined) ?? [];
  const subjectLabel = quoteType === "deck" ? "deck" : quoteType === "eclipse" ? "opening roof" : "structure";

  useEffect(() => {
    renderInstructionsLoadedRef.current = false;
    renderInstructionsSavedRef.current = "";
    setRenderInstructions("");
  }, [quoteId, quoteType]);

  useEffect(() => {
    if (!photoQuery.data || renderInstructionsLoadedRef.current) return;
    const savedInstructions = photoQuery.data.renderInstructions || "";
    setRenderInstructions(savedInstructions);
    renderInstructionsSavedRef.current = savedInstructions.trim();
    renderInstructionsLoadedRef.current = true;
  }, [photoQuery.data]);

  // Upload mutations
  const uploadDeckPhoto = trpc.quoteRender.uploadDeckPhoto.useMutation({
    onSuccess: (data) => {
      toast.success("Site photo uploaded");
      photoQuery.refetch();
    },
    onError: (err) => toast.error(`Upload failed: ${err.message}`),
    onSettled: () => setUploading(false),
  });

  const uploadEclipsePhoto = trpc.quoteRender.uploadEclipsePhoto.useMutation({
    onSuccess: (data) => {
      toast.success("Site photo uploaded");
      photoQuery.refetch();
    },
    onError: (err) => toast.error(`Upload failed: ${err.message}`),
    onSettled: () => setUploading(false),
  });

  const uploadStructurePhoto = trpc.quoteRender.uploadStructurePhoto.useMutation({
    onSuccess: () => {
      toast.success("Site photo uploaded");
      photoQuery.refetch();
    },
    onError: (err) => toast.error(`Upload failed: ${err.message}`),
    onSettled: () => setUploading(false),
  });

  // Remove photo mutations
  const removeDeckPhoto = trpc.quoteRender.removeDeckPhoto.useMutation({
    onSuccess: () => { toast.success("Photo removed"); photoQuery.refetch(); },
    onError: (err) => toast.error(`Failed: ${err.message}`),
  });

  const removeEclipsePhoto = trpc.quoteRender.removeEclipsePhoto.useMutation({
    onSuccess: () => { toast.success("Photo removed"); photoQuery.refetch(); },
    onError: (err) => toast.error(`Failed: ${err.message}`),
  });

  const removeStructurePhoto = trpc.quoteRender.removeStructurePhoto.useMutation({
    onSuccess: () => { toast.success("Photo removed"); photoQuery.refetch(); },
    onError: (err) => toast.error(`Failed: ${err.message}`),
  });

  // Calibration save mutations
  const saveDeckCalibration = trpc.quoteRender.saveDeckCalibration.useMutation({
    onSuccess: () => { photoQuery.refetch(); },
    onError: (err) => toast.error(`Calibration save failed: ${err.message}`),
  });

  const saveEclipseCalibration = trpc.quoteRender.saveEclipseCalibration.useMutation({
    onSuccess: () => { photoQuery.refetch(); },
    onError: (err) => toast.error(`Calibration save failed: ${err.message}`),
  });

  const saveStructureCalibration = trpc.quoteRender.saveStructureCalibration.useMutation({
    onSuccess: () => { photoQuery.refetch(); },
    onError: (err) => toast.error(`Calibration save failed: ${err.message}`),
  });

  // Render prompt directions save mutations
  const saveDeckRenderInstructions = trpc.quoteRender.saveDeckRenderInstructions.useMutation({
    onSuccess: (data) => { renderInstructionsSavedRef.current = data.renderInstructions.trim(); },
    onError: (err) => toast.error(`Render directions save failed: ${err.message}`),
  });

  const saveEclipseRenderInstructions = trpc.quoteRender.saveEclipseRenderInstructions.useMutation({
    onSuccess: (data) => { renderInstructionsSavedRef.current = data.renderInstructions.trim(); },
    onError: (err) => toast.error(`Render directions save failed: ${err.message}`),
  });

  const saveStructureRenderInstructions = trpc.quoteRender.saveStructureRenderInstructions.useMutation({
    onSuccess: (data) => { renderInstructionsSavedRef.current = data.renderInstructions.trim(); },
    onError: (err) => toast.error(`Render directions save failed: ${err.message}`),
  });

  // Generate mutations
  const generateDeck = trpc.quoteRender.generateDeck.useMutation({
    onSuccess: (data) => {
      toast.success("AI render generated successfully");
      setPreviewUrl(data.imageUrl);
      historyQuery.refetch();
    },
    onError: (err) => {
      toast.error(`Render failed: ${err.message}`);
    },
    onSettled: () => setGenerating(false),
  });

  const generateEclipse = trpc.quoteRender.generateEclipse.useMutation({
    onSuccess: (data) => {
      toast.success("AI render generated successfully");
      setPreviewUrl(data.imageUrl);
      historyQuery.refetch();
    },
    onError: (err) => {
      toast.error(`Render failed: ${err.message}`);
    },
    onSettled: () => setGenerating(false),
  });

  const generateStructure = trpc.quoteRender.generateStructure.useMutation({
    onSuccess: (data) => {
      toast.success("AI render generated successfully");
      setPreviewUrl(data.imageUrl);
      historyQuery.refetch();
    },
    onError: (err) => {
      toast.error(`Render failed: ${err.message}`);
    },
    onSettled: () => setGenerating(false),
  });

  // Delete mutations
  const deleteDeck = trpc.quoteRender.deleteDeckRender.useMutation({
    onSuccess: () => { toast.success("Render deleted"); historyQuery.refetch(); },
    onError: (err) => toast.error(`Delete failed: ${err.message}`),
  });

  const deleteEclipse = trpc.quoteRender.deleteEclipseRender.useMutation({
    onSuccess: () => { toast.success("Render deleted"); historyQuery.refetch(); },
    onError: (err) => toast.error(`Delete failed: ${err.message}`),
  });

  const deleteStructure = trpc.quoteRender.deleteStructureRender.useMutation({
    onSuccess: () => { toast.success("Render deleted"); historyQuery.refetch(); },
    onError: (err) => toast.error(`Delete failed: ${err.message}`),
  });

  // Favourite mutations
  const favDeck = trpc.quoteRender.toggleDeckFavourite.useMutation({
    onSuccess: (data) => {
      toast.success(data.isFavourite ? "Marked as favourite" : "Removed from favourites");
      historyQuery.refetch();
    },
    onError: (err) => toast.error(`Failed: ${err.message}`),
  });

  const favEclipse = trpc.quoteRender.toggleEclipseFavourite.useMutation({
    onSuccess: (data) => {
      toast.success(data.isFavourite ? "Marked as favourite" : "Removed from favourites");
      historyQuery.refetch();
    },
    onError: (err) => toast.error(`Failed: ${err.message}`),
  });

  const favStructure = trpc.quoteRender.toggleStructureFavourite.useMutation({
    onSuccess: (data) => {
      toast.success(data.isFavourite ? "Marked as favourite" : "Removed from favourites");
      historyQuery.refetch();
    },
    onError: (err) => toast.error(`Failed: ${err.message}`),
  });

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith("image/")) {
      toast.error("Please select an image file");
      return;
    }

    // Validate file size (max 20MB raw — will be compressed)
    if (file.size > 20 * 1024 * 1024) {
      toast.error("Image must be under 20MB");
      return;
    }

    setUploading(true);

    try {
      // Compress image: max 2048px, JPEG quality 0.8, target < 1MB
      const compressed = await compressImage(file, {
        maxDimension: 2048,
        quality: 0.8,
        maxFileSize: 1.5 * 1024 * 1024, // 1.5MB max for upload
      });

      const savings = ((1 - compressed.compressionRatio) * 100).toFixed(0);
      if (compressed.originalSize > compressed.compressedSize) {
        toast.info(
          `Compressed: ${formatFileSize(compressed.originalSize)} → ${formatFileSize(compressed.compressedSize)} (${savings}% smaller)`
        );
      }

      const payload = {
        quoteId,
        base64: compressed.base64,
        mimeType: "image/jpeg",
        fileName: file.name.replace(/\.[^.]+$/, ".jpg"),
      };

      if (quoteType === "deck") {
        uploadDeckPhoto.mutate(payload);
      } else if (quoteType === "eclipse") {
        uploadEclipsePhoto.mutate(payload);
      } else {
        uploadStructurePhoto.mutate(payload);
      }
    } catch (err) {
      toast.error("Failed to process image");
      setUploading(false);
    }

    // Reset input
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, [quoteId, quoteType, uploadDeckPhoto, uploadEclipsePhoto, uploadStructurePhoto]);

  const handleRemovePhoto = useCallback(() => {
    if (quoteType === "deck") {
      removeDeckPhoto.mutate({ quoteId });
    } else if (quoteType === "eclipse") {
      removeEclipsePhoto.mutate({ quoteId });
    } else {
      removeStructurePhoto.mutate({ quoteId });
    }
  }, [quoteId, quoteType, removeDeckPhoto, removeEclipsePhoto, removeStructurePhoto]);

  const handleCalibrationChange = useCallback((data: CalibrationData | null) => {
    if (quoteType === "deck") {
      saveDeckCalibration.mutate({ quoteId, calibrationData: data });
    } else if (quoteType === "eclipse") {
      saveEclipseCalibration.mutate({ quoteId, calibrationData: data });
    } else {
      saveStructureCalibration.mutate({ quoteId, calibrationData: data });
    }
  }, [quoteId, quoteType, saveDeckCalibration, saveEclipseCalibration, saveStructureCalibration]);

  const handleAutoScale = useCallback((_pixelsPerMm: number) => {
    // For quote photos, calibration is informational (helps AI understand scale)
    // No visual overlay scaling needed here unlike the patio canvas
  }, []);

  const saveRenderInstructions = useCallback((nextInstructions: string) => {
    const payload = {
      quoteId,
      renderInstructions: nextInstructions.trim() || null,
    };
    if (quoteType === "deck") {
      saveDeckRenderInstructions.mutate(payload);
    } else if (quoteType === "eclipse") {
      saveEclipseRenderInstructions.mutate(payload);
    } else {
      saveStructureRenderInstructions.mutate(payload);
    }
  }, [quoteId, quoteType, saveDeckRenderInstructions, saveEclipseRenderInstructions, saveStructureRenderInstructions]);

  useEffect(() => {
    if (!renderInstructionsLoadedRef.current) return;
    const normalized = renderInstructions.trim();
    if (normalized === renderInstructionsSavedRef.current) return;
    const timeout = setTimeout(() => {
      saveRenderInstructions(renderInstructions);
    }, 900);
    return () => clearTimeout(timeout);
  }, [renderInstructions, saveRenderInstructions]);

  const handleGenerate = useCallback((mode: "full" | "quick") => {
    if (renderInstructions.trim() !== renderInstructionsSavedRef.current) {
      saveRenderInstructions(renderInstructions);
    }
    setGenerating(true);
    const params = {
      quoteId,
      mode,
      stylePreset: selectedPreset === "none" ? undefined : selectedPreset,
      userInstructions: renderInstructions.trim() || undefined,
    };
    if (quoteType === "deck") {
      generateDeck.mutate(params);
    } else if (quoteType === "eclipse") {
      generateEclipse.mutate(params);
    } else {
      generateStructure.mutate(params);
    }
  }, [quoteId, quoteType, selectedPreset, renderInstructions, saveRenderInstructions, generateDeck, generateEclipse, generateStructure]);

  const handleDelete = useCallback((renderId: string) => {
    if (quoteType === "deck") {
      deleteDeck.mutate({ quoteId, renderId });
    } else if (quoteType === "eclipse") {
      deleteEclipse.mutate({ quoteId, renderId });
    } else {
      deleteStructure.mutate({ quoteId, renderId });
    }
  }, [quoteId, quoteType, deleteDeck, deleteEclipse, deleteStructure]);

  const handleToggleFavourite = useCallback((renderId: string) => {
    if (quoteType === "deck") {
      favDeck.mutate({ quoteId, renderId });
    } else if (quoteType === "eclipse") {
      favEclipse.mutate({ quoteId, renderId });
    } else {
      favStructure.mutate({ quoteId, renderId });
    }
  }, [quoteId, quoteType, favDeck, favEclipse, favStructure]);

  // Sort: favourites first, then newest first
  const sortedHistory = useMemo(() => {
    return [...renderHistory].sort((a, b) => {
      if (a.isFavourite && !b.isFavourite) return -1;
      if (!a.isFavourite && b.isFavourite) return 1;
      return b.createdAt - a.createdAt;
    });
  }, [renderHistory]);

  const presetCategories = useMemo(() => {
    const grouped: Record<string, typeof RENDER_STYLE_PRESETS> = {};
    RENDER_STYLE_PRESETS.forEach(p => {
      if (!grouped[p.category]) grouped[p.category] = [];
      grouped[p.category].push(p);
    });
    return grouped;
  }, []);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-amber-500" />
          AI Render
          {renderHistory.length > 0 && (
            <Badge variant="secondary" className="text-xs">{renderHistory.length}</Badge>
          )}
        </h3>
        <Button variant="ghost" size="sm" onClick={() => setExpanded(!expanded)}>
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </Button>
      </div>

      {expanded && (
        <>
          {/* Photo Upload Section with Calibration */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">Site Photo (optional)</label>
            {photoUrl ? (
              <CalibrationProvider
                containerRef={photoContainerRef}
                calibrationData={calibrationData}
                onCalibrationChange={handleCalibrationChange}
                onAutoScale={handleAutoScale}
                photoUrl={photoUrl}
              >
                <div className="space-y-2">
                  {/* Calibration toolbar */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <CalibrationToolbarControls />
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 ml-auto text-muted-foreground hover:text-destructive"
                      onClick={handleRemovePhoto}
                      title="Remove photo"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                  {/* Photo container with calibration overlay */}
                  <div
                    ref={photoContainerRef}
                    className="relative rounded-md overflow-hidden border bg-muted cursor-crosshair"
                  >
                    <img
                      src={photoUrl}
                      alt="Site photo"
                      className="block w-full h-auto object-contain"
                    />
                    <CalibrationCanvasOverlay />
                  </div>
                  <div className="rounded-md border bg-muted/40 px-2 py-1">
                    <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                      <Camera className="h-3 w-3" />
                      {calibrationData
                        ? `Calibrated: ${calibrationData.realDistanceMm}mm reference`
                        : "Photo uploaded - use Calibrate to set scale"}
                    </span>
                  </div>
                </div>
              </CalibrationProvider>
            ) : (
              <div
                className="border-2 border-dashed rounded-md p-4 text-center cursor-pointer hover:border-amber-400 hover:bg-amber-50/50 transition-colors"
                onClick={() => fileInputRef.current?.click()}
              >
                {uploading ? (
                  <div className="flex items-center justify-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin text-amber-500" />
                    <span className="text-xs text-muted-foreground">Uploading...</span>
                  </div>
                ) : (
                  <>
                    <Camera className="h-6 w-6 mx-auto mb-1 text-muted-foreground/50" />
                    <p className="text-xs text-muted-foreground">
                      Upload a site photo for photo-realistic editing
                    </p>
                    <p className="text-[10px] text-muted-foreground/70 mt-1">
                      JPG, PNG up to 10MB
                    </p>
                  </>
                )}
              </div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileSelect}
            />
          </div>

          {/* Prompt Directions */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">Render Directions</label>
            <Textarea
              value={renderInstructions}
              onChange={(e) => setRenderInstructions(e.target.value.slice(0, 2000))}
              onBlur={() => {
                if (renderInstructions.trim() !== renderInstructionsSavedRef.current) {
                  saveRenderInstructions(renderInstructions);
                }
              }}
              rows={3}
              className="text-xs resize-y"
              placeholder="Positioning, layout, camera angle, or site-specific details for this render..."
            />
          </div>

          {/* Style Preset Selector */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">Style Preset</label>
            <Select value={selectedPreset} onValueChange={setSelectedPreset}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="No preset (default)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No preset (default)</SelectItem>
                {Object.entries(presetCategories).map(([cat, presets]) => (
                  <div key={cat}>
                    <div className="px-2 py-1 text-xs font-semibold text-muted-foreground uppercase">{cat}</div>
                    {presets.map(p => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.icon} {p.label}
                      </SelectItem>
                    ))}
                  </div>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Generate Buttons */}
          <div className="flex gap-2">
            <Button
              onClick={() => handleGenerate("full")}
              disabled={generating}
              size="sm"
              className="flex-1"
            >
              {generating ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Sparkles className="h-4 w-4 mr-1" />}
              {photoUrl ? "Edit Photo" : "Full Render"}
            </Button>
            <Button
              onClick={() => handleGenerate("quick")}
              disabled={generating}
              size="sm"
              variant="outline"
              className="flex-1"
            >
              {generating ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Zap className="h-4 w-4 mr-1" />}
              Quick Render
            </Button>
          </div>

          {/* Photo mode indicator */}
          {photoUrl && (
            <p className="text-[10px] text-amber-600 bg-amber-50 rounded px-2 py-1">
              <Camera className="h-3 w-3 inline mr-1" />
              Photo mode: AI will overlay the {subjectLabel} onto your site photo
            </p>
          )}

          {generating && (
            <div className="text-center py-4">
              <Loader2 className="h-6 w-6 animate-spin mx-auto text-amber-500" />
              <p className="text-xs text-muted-foreground mt-2">Generating AI render... (10-20 seconds)</p>
            </div>
          )}

          {/* Preview with Compare */}
          {previewUrl && !generating && (
            <Card className="overflow-hidden">
              <CardContent className="p-0">
                {compareMode && photoUrl ? (
                  <div className="grid grid-cols-2 gap-0.5 bg-muted">
                    <div className="relative">
                      <img src={photoUrl} alt="Original" className="w-full h-auto object-contain" />
                      <Badge className="absolute top-1 left-1 text-[9px] h-4" variant="secondary">Original</Badge>
                    </div>
                    <div className="relative">
                      <img src={previewUrl} alt="AI Render" className="w-full h-auto object-contain" />
                      <Badge className="absolute top-1 left-1 text-[9px] h-4 bg-amber-500">Render</Badge>
                    </div>
                  </div>
                ) : (
                  <img
                    src={previewUrl}
                    alt="AI Render Preview"
                    className="w-full h-auto object-contain rounded"
                  />
                )}
              </CardContent>
              {photoUrl && (
                <div className="flex justify-center py-1 border-t">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs h-6"
                    onClick={() => setCompareMode(!compareMode)}
                  >
                    <ArrowLeftRight className="h-3 w-3 mr-1" />
                    {compareMode ? "Single View" : "Compare with Photo"}
                  </Button>
                </div>
              )}
            </Card>
          )}

          {/* Render History */}
          {sortedHistory.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-xs font-medium text-muted-foreground">
                Render History ({sortedHistory.length})
              </h4>
              <div className="grid grid-cols-2 gap-2">
                {sortedHistory.map((render) => (
                  <div key={render.id} className="relative group rounded-md overflow-hidden border">
                    <img
                      src={render.imageUrl}
                      alt={`Render ${render.promptMode}`}
                      className="w-full h-24 object-cover cursor-pointer"
                      onClick={() => setPreviewUrl(render.imageUrl)}
                    />
                    {/* Overlay badges */}
                    <div className="absolute top-1 left-1 flex gap-1">
                      {render.isFavourite && (
                        <Badge className="h-4 px-1 text-[10px] bg-amber-500">★</Badge>
                      )}
                      <Badge variant="secondary" className="h-4 px-1 text-[10px]">
                        {render.promptMode}
                      </Badge>
                    </div>
                    {/* Hover actions */}
                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6 text-white hover:text-amber-400"
                        onClick={() => setPreviewUrl(render.imageUrl)}
                      >
                        <Eye className="h-3 w-3" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6 text-white hover:text-amber-400"
                        onClick={() => handleToggleFavourite(render.id)}
                      >
                        <Star className={`h-3 w-3 ${render.isFavourite ? "fill-amber-400" : ""}`} />
                      </Button>
                      <a href={render.imageUrl} download target="_blank" rel="noopener noreferrer">
                        <Button size="icon" variant="ghost" className="h-6 w-6 text-white hover:text-blue-400">
                          <Download className="h-3 w-3" />
                        </Button>
                      </a>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6 text-white hover:text-red-400"
                        onClick={() => handleDelete(render.id)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                    {/* Date */}
                    <div className="absolute bottom-0 left-0 right-0 bg-black/60 px-1 py-0.5">
                      <span className="text-[9px] text-white/80">
                        {new Date(render.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Empty state */}
          {sortedHistory.length === 0 && !generating && !previewUrl && (
            <div className="text-center py-6 text-muted-foreground">
              <ImageIcon className="h-8 w-8 mx-auto mb-2 opacity-30" />
              <p className="text-xs">
                {photoUrl
                  ? `Photo uploaded. Generate an AI render to visualise the ${subjectLabel} on your site.`
                  : `No renders yet. Upload a site photo or generate an AI visualisation of this ${subjectLabel} project.`
                }
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
