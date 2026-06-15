import { useState, useCallback, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sparkles,
  Loader2,
  Download,
  Trash2,
  Eye,
  Zap,
  Wand2,
  ChevronDown,
  ChevronUp,
  Info,
  Clock,
  ImageIcon,
  AlertTriangle,
  Columns2,
  SplitSquareHorizontal,
  Star,
  Layers,
  CheckSquare,
} from "lucide-react";
import { toast } from "sonner";
import {
  RENDER_STYLE_PRESETS,
  CATEGORY_LABELS,
  getPresetsGroupedByCategory,
} from "../../../shared/render-style-presets";

interface PatioAIRenderProps {
  projectId: number;
  hasPhoto: boolean;
  photoUrl?: string | null;
}

export function PatioAIRender({ projectId, hasPhoto, photoUrl }: PatioAIRenderProps) {
  const [generating, setGenerating] = useState(false);
  const [batchGenerating, setBatchGenerating] = useState(false);
  const [batchProgress, setBatchProgress] = useState({ done: 0, total: 0 });
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [expanded, setExpanded] = useState(true);
  const [selectedPreset, setSelectedPreset] = useState<string>("none");
  const [compareMode, setCompareMode] = useState(false);
  const [compareLeft, setCompareLeft] = useState<string | null>(null);
  const [compareRight, setCompareRight] = useState<string | null>(null);
  const [sliderPos, setSliderPos] = useState(50);
  const [showBatchDialog, setShowBatchDialog] = useState(false);
  const [batchPresets, setBatchPresets] = useState<string[]>([]);

  // Fetch render history
  const {
    data: renderHistory,
    refetch: refetchHistory,
  } = trpc.patioRender.history.useQuery({ projectId });

  // Preview prompt
  const { data: promptPreview } = trpc.patioRender.previewPrompt.useQuery(
    { projectId, mode: "full", stylePreset: selectedPreset === "none" ? undefined : selectedPreset },
    { enabled: showPrompt }
  );

  // Generate mutation
  const generateRender = trpc.patioRender.generate.useMutation({
    onSuccess: (data) => {
      toast.success("AI render generated successfully");
      setPreviewUrl(data.imageUrl);
      refetchHistory();
    },
    onError: (err) => {
      toast.error(`Render failed: ${err.message}`);
    },
    onSettled: () => {
      setGenerating(false);
    },
  });

  // Batch generate mutation
  const batchGenerate = trpc.patioRender.batchGenerate.useMutation({
    onSuccess: (data) => {
      toast.success(`Generated ${data.generated} of ${data.total} renders`);
      refetchHistory();
      setShowBatchDialog(false);
      setBatchPresets([]);
    },
    onError: (err) => {
      toast.error(`Batch generation failed: ${err.message}`);
    },
    onSettled: () => {
      setBatchGenerating(false);
      setBatchProgress({ done: 0, total: 0 });
    },
  });

  // Delete mutation
  const deleteRender = trpc.patioRender.deleteRender.useMutation({
    onSuccess: () => {
      toast.success("Render deleted");
      refetchHistory();
    },
    onError: (err) => {
      toast.error(`Delete failed: ${err.message}`);
    },
  });

  // Favourite mutation
  const toggleFavourite = trpc.patioRender.toggleFavourite.useMutation({
    onSuccess: (data) => {
      toast.success(data.isFavourite ? "Marked as favourite" : "Removed from favourites");
      refetchHistory();
    },
    onError: (err) => {
      toast.error(`Failed: ${err.message}`);
    },
  });

  const handleGenerate = useCallback(
    (mode: "full" | "quick") => {
      setGenerating(true);
      generateRender.mutate({
        projectId,
        mode,
        stylePreset: selectedPreset === "none" ? undefined : selectedPreset,
      });
    },
    [projectId, generateRender, selectedPreset]
  );

  const handleBatchGenerate = useCallback(() => {
    if (batchPresets.length === 0) {
      toast.error("Select at least one preset for batch generation");
      return;
    }
    setBatchGenerating(true);
    setBatchProgress({ done: 0, total: batchPresets.length });
    batchGenerate.mutate({
      projectId,
      mode: "quick",
      presets: batchPresets,
    });
  }, [projectId, batchGenerate, batchPresets]);

  const handleDelete = useCallback(
    (renderId: string) => {
      if (!confirm("Delete this render?")) return;
      deleteRender.mutate({ projectId, renderId });
    },
    [projectId, deleteRender]
  );

  const handleToggleFavourite = useCallback(
    (renderId: string) => {
      toggleFavourite.mutate({ projectId, renderId });
    },
    [projectId, toggleFavourite]
  );

  const handleDownload = useCallback((url: string, index: number) => {
    const link = document.createElement("a");
    link.href = url;
    link.download = `patio-render-${index + 1}.png`;
    link.target = "_blank";
    link.click();
  }, []);

  const sortedHistory = useMemo(
    () => [...(renderHistory || [])].sort((a, b) => {
      // Favourites first, then newest
      if (a.isFavourite && !b.isFavourite) return -1;
      if (!a.isFavourite && b.isFavourite) return 1;
      return b.createdAt - a.createdAt;
    }),
    [renderHistory]
  );

  const groupedPresets = useMemo(() => getPresetsGroupedByCategory(), []);

  // Comparison handlers
  const handleSliderDrag = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const pct = Math.max(5, Math.min(95, (x / rect.width) * 100));
    setSliderPos(pct);
  }, []);

  const toggleBatchPreset = useCallback((presetId: string) => {
    setBatchPresets(prev =>
      prev.includes(presetId)
        ? prev.filter(p => p !== presetId)
        : prev.length < 6 ? [...prev, presetId] : prev
    );
  }, []);

  return (
    <div className="space-y-3">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between"
      >
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-purple-500" />
          <span className="font-semibold text-sm">AI 3D Render</span>
        </div>
        <div className="flex items-center gap-2">
          {sortedHistory.length > 0 && (
            <span className="bg-purple-100 text-purple-700 text-xs font-medium px-2 py-0.5 rounded-full">
              {sortedHistory.length} render{sortedHistory.length !== 1 ? "s" : ""}
            </span>
          )}
          {expanded ? (
            <ChevronUp className="h-4 w-4" />
          ) : (
            <ChevronDown className="h-4 w-4" />
          )}
        </div>
      </button>

      {expanded && (
        <div className="space-y-3">
          {/* Info banner */}
          <div className="bg-purple-50 border border-purple-200 rounded-lg p-2.5">
            <div className="flex items-start gap-2">
              <Sparkles className="h-4 w-4 text-purple-600 mt-0.5 shrink-0" />
              <div className="text-xs text-purple-800">
                <p className="font-medium mb-1">
                  AI-Powered Patio Visualisation
                </p>
                <p>
                  Generate a realistic 3D render of the proposed patio using the
                  structure dimensions, Colorbond colours, and{" "}
                  {hasPhoto
                    ? "your uploaded site photo"
                    : "a generic Australian house"}{" "}
                  as the base. All renders are watermarked with the Altaspan logo.
                </p>
              </div>
            </div>
          </div>

          {/* No photo warning */}
          {!hasPhoto && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-2.5">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                <p className="text-xs text-amber-800">
                  <strong>No site photo uploaded.</strong> The AI will generate a
                  render with a generic house. For best results, upload a photo
                  of the actual house first (see Photo Guide).
                </p>
              </div>
            </div>
          )}

          {/* Style Preset Selector */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Render Style Preset</label>
            <Select value={selectedPreset} onValueChange={setSelectedPreset}>
              <SelectTrigger className="h-9 text-xs">
                <SelectValue placeholder="Default (no style preset)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">
                  <span className="flex items-center gap-2">
                    <span>✨</span>
                    <span>Default — Natural daylight, standard angle</span>
                  </span>
                </SelectItem>
                {Object.entries(groupedPresets).map(([category, presets]) => (
                  <SelectGroup key={category}>
                    <SelectLabel className="text-[10px] uppercase tracking-wider">
                      {CATEGORY_LABELS[category] || category}
                    </SelectLabel>
                    {presets.map((preset) => (
                      <SelectItem key={preset.id} value={preset.id}>
                        <span className="flex items-center gap-2">
                          <span>{preset.icon}</span>
                          <span>{preset.label}</span>
                        </span>
                      </SelectItem>
                    ))}
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>
            {selectedPreset !== "none" && (
              <p className="text-[10px] text-muted-foreground italic pl-1">
                {RENDER_STYLE_PRESETS.find(p => p.id === selectedPreset)?.description}
              </p>
            )}
          </div>

          {/* Generate buttons */}
          <div className="grid grid-cols-3 gap-2">
            <Button
              onClick={() => handleGenerate("full")}
              disabled={generating || batchGenerating}
              className="gap-1.5 bg-purple-600 hover:bg-purple-700"
              size="sm"
            >
              {generating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Wand2 className="h-4 w-4" />
              )}
              Full
            </Button>
            <Button
              onClick={() => handleGenerate("quick")}
              disabled={generating || batchGenerating}
              variant="outline"
              className="gap-1.5 border-purple-300 text-purple-700 hover:bg-purple-50"
              size="sm"
            >
              {generating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Zap className="h-4 w-4" />
              )}
              Quick
            </Button>
            <Button
              onClick={() => setShowBatchDialog(true)}
              disabled={generating || batchGenerating}
              variant="outline"
              className="gap-1.5 border-orange-300 text-orange-700 hover:bg-orange-50"
              size="sm"
            >
              <Layers className="h-4 w-4" />
              Batch
            </Button>
          </div>

          {/* Generation progress */}
          {(generating || batchGenerating) && (
            <div className="bg-muted/50 rounded-lg p-3 text-center">
              <Loader2 className="h-6 w-6 animate-spin text-purple-500 mx-auto mb-2" />
              <p className="text-xs font-medium">
                {batchGenerating
                  ? `Batch generating renders...`
                  : "Generating AI render..."}
              </p>
              <p className="text-[10px] text-muted-foreground mt-1">
                {batchGenerating
                  ? `This may take 1-2 minutes for ${batchProgress.total} presets`
                  : "This typically takes 10–20 seconds"}
              </p>
            </div>
          )}

          {/* Prompt preview toggle */}
          <button
            onClick={() => setShowPrompt(!showPrompt)}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <Info className="h-3 w-3" />
            {showPrompt ? "Hide" : "View"} AI prompt
          </button>

          {showPrompt && promptPreview && (
            <div className="bg-muted/30 rounded-lg p-2.5 max-h-48 overflow-y-auto">
              <p className="text-[10px] text-muted-foreground whitespace-pre-wrap font-mono leading-relaxed">
                {promptPreview.prompt}
              </p>
            </div>
          )}

          {/* Compare Mode Toggle */}
          {sortedHistory.length >= 2 && (
            <Button
              variant={compareMode ? "default" : "outline"}
              size="sm"
              className="w-full gap-1.5"
              onClick={() => {
                setCompareMode(!compareMode);
                if (!compareMode && sortedHistory.length >= 2) {
                  if (photoUrl) {
                    setCompareLeft(photoUrl);
                    setCompareRight(sortedHistory[0].imageUrl);
                  } else {
                    setCompareLeft(sortedHistory[1].imageUrl);
                    setCompareRight(sortedHistory[0].imageUrl);
                  }
                }
              }}
            >
              <Columns2 className="h-4 w-4" />
              {compareMode ? "Exit Comparison" : "Compare Renders"}
            </Button>
          )}

          {/* Comparison View */}
          {compareMode && (
            <Card>
              <CardHeader className="py-2 px-3">
                <CardTitle className="text-xs flex items-center gap-1.5">
                  <SplitSquareHorizontal className="h-3.5 w-3.5" />
                  Side-by-Side Comparison
                </CardTitle>
              </CardHeader>
              <CardContent className="px-3 pb-3 space-y-2">
                {/* Selectors */}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] text-muted-foreground mb-1 block">Left Image</label>
                    <select
                      className="w-full text-xs border rounded px-2 py-1 bg-background"
                      value={compareLeft || ""}
                      onChange={(e) => setCompareLeft(e.target.value || null)}
                    >
                      {photoUrl && <option value={photoUrl}>Original Photo</option>}
                      {sortedHistory.map((r, i) => (
                        <option key={r.id} value={r.imageUrl}>
                          Render {sortedHistory.length - i} ({r.promptMode}){r.isFavourite ? " ★" : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] text-muted-foreground mb-1 block">Right Image</label>
                    <select
                      className="w-full text-xs border rounded px-2 py-1 bg-background"
                      value={compareRight || ""}
                      onChange={(e) => setCompareRight(e.target.value || null)}
                    >
                      {photoUrl && <option value={photoUrl}>Original Photo</option>}
                      {sortedHistory.map((r, i) => (
                        <option key={r.id} value={r.imageUrl}>
                          Render {sortedHistory.length - i} ({r.promptMode}){r.isFavourite ? " ★" : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Slider comparison view */}
                {compareLeft && compareRight && (
                  <div
                    className="relative w-full aspect-[4/3] rounded-lg overflow-hidden border cursor-col-resize select-none"
                    onMouseMove={(e) => {
                      if (e.buttons === 1) handleSliderDrag(e);
                    }}
                    onClick={handleSliderDrag}
                  >
                    {/* Right image (full) */}
                    <img
                      src={compareRight}
                      alt="Right comparison"
                      className="absolute inset-0 w-full h-full object-cover"
                    />
                    {/* Left image (clipped) */}
                    <div
                      className="absolute inset-0 overflow-hidden"
                      style={{ width: `${sliderPos}%` }}
                    >
                      <img
                        src={compareLeft}
                        alt="Left comparison"
                        className="absolute inset-0 w-full h-full object-cover"
                        style={{ width: `${100 / (sliderPos / 100)}%`, maxWidth: "none" }}
                      />
                    </div>
                    {/* Slider line */}
                    <div
                      className="absolute top-0 bottom-0 w-0.5 bg-white shadow-lg z-10"
                      style={{ left: `${sliderPos}%` }}
                    >
                      <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-6 h-6 bg-white rounded-full shadow-md flex items-center justify-center">
                        <SplitSquareHorizontal className="h-3 w-3 text-purple-600" />
                      </div>
                    </div>
                    {/* Labels */}
                    <div className="absolute top-2 left-2 bg-black/60 text-white text-[9px] px-1.5 py-0.5 rounded">
                      {compareLeft === photoUrl ? "Original" : "Left"}
                    </div>
                    <div className="absolute top-2 right-2 bg-black/60 text-white text-[9px] px-1.5 py-0.5 rounded">
                      {compareRight === photoUrl ? "Original" : "Right"}
                    </div>
                  </div>
                )}
                <p className="text-[10px] text-muted-foreground text-center">
                  Click or drag the slider to compare images
                </p>
              </CardContent>
            </Card>
          )}

          {/* Render History Gallery */}
          {sortedHistory.length > 0 && (
            <Card>
              <CardHeader className="py-2 px-3">
                <CardTitle className="text-xs flex items-center gap-1.5">
                  <ImageIcon className="h-3.5 w-3.5" />
                  Render History ({sortedHistory.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="px-3 pb-3">
                <div className="grid grid-cols-2 gap-2">
                  {sortedHistory.map((render, idx) => (
                    <div
                      key={render.id}
                      className={`group relative rounded-lg overflow-hidden border bg-muted/30 ${
                        render.isFavourite ? "ring-2 ring-yellow-400" : ""
                      }`}
                    >
                      {/* Favourite badge */}
                      {render.isFavourite && (
                        <div className="absolute top-1 left-1 z-10">
                          <Star className="h-4 w-4 text-yellow-400 fill-yellow-400 drop-shadow" />
                        </div>
                      )}

                      {/* Thumbnail */}
                      <button
                        onClick={() => setPreviewUrl(render.imageUrl)}
                        className="w-full aspect-[4/3] overflow-hidden"
                      >
                        <img
                          src={render.imageUrl}
                          alt={`AI Render ${idx + 1}`}
                          className="w-full h-full object-cover transition-transform group-hover:scale-105"
                        />
                      </button>

                      {/* Overlay info */}
                      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-1.5">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1">
                            <Clock className="h-3 w-3 text-white/70" />
                            <span className="text-[9px] text-white/80">
                              {new Date(render.createdAt).toLocaleDateString(
                                "en-AU",
                                {
                                  day: "numeric",
                                  month: "short",
                                  hour: "2-digit",
                                  minute: "2-digit",
                                }
                              )}
                            </span>
                          </div>
                          <span
                            className={`text-[9px] px-1.5 py-0.5 rounded-full ${
                              render.promptMode === "full"
                                ? "bg-purple-500/80 text-white"
                                : "bg-blue-500/80 text-white"
                            }`}
                          >
                            {render.promptMode === "full" ? "Full" : "Quick"}
                          </span>
                        </div>
                      </div>

                      {/* Action buttons (visible on hover) */}
                      <div className="absolute top-1 right-1 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => handleToggleFavourite(render.id)}
                          className={`p-1 rounded text-white hover:scale-110 transition-transform ${
                            render.isFavourite ? "bg-yellow-500" : "bg-black/60 hover:bg-yellow-500"
                          }`}
                          title={render.isFavourite ? "Remove favourite" : "Mark as favourite"}
                        >
                          <Star className={`h-3 w-3 ${render.isFavourite ? "fill-white" : ""}`} />
                        </button>
                        <button
                          onClick={() => setPreviewUrl(render.imageUrl)}
                          className="p-1 bg-black/60 rounded text-white hover:bg-black/80"
                          title="Preview"
                        >
                          <Eye className="h-3 w-3" />
                        </button>
                        <button
                          onClick={() =>
                            handleDownload(render.imageUrl, idx)
                          }
                          className="p-1 bg-black/60 rounded text-white hover:bg-black/80"
                          title="Download"
                        >
                          <Download className="h-3 w-3" />
                        </button>
                        <button
                          onClick={() => handleDelete(render.id)}
                          className="p-1 bg-red-600/80 rounded text-white hover:bg-red-700"
                          title="Delete"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Disclaimer */}
          <p className="text-[10px] text-muted-foreground italic text-center">
            AI-generated visualisation for illustrative purposes only. Final
            appearance may vary from render.
          </p>
        </div>
      )}

      {/* Full-size preview dialog */}
      <Dialog
        open={!!previewUrl}
        onOpenChange={(open) => !open && setPreviewUrl(null)}
      >
        <DialogContent className="max-w-4xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-purple-500" />
              AI Render Preview
            </DialogTitle>
          </DialogHeader>
          {previewUrl && (
            <div className="space-y-3">
              <div className="rounded-lg overflow-hidden border">
                <img
                  src={previewUrl}
                  alt="AI Render"
                  className="w-full h-auto"
                />
              </div>
              <div className="flex items-center justify-between">
                <p className="text-[10px] text-muted-foreground italic">
                  AI-generated visualisation for illustrative purposes only.
                  Final appearance may vary.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const link = document.createElement("a");
                    link.href = previewUrl;
                    link.download = "patio-ai-render.png";
                    link.target = "_blank";
                    link.click();
                  }}
                  className="gap-1.5"
                >
                  <Download className="h-4 w-4" />
                  Download
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Batch Generate Dialog */}
      <Dialog open={showBatchDialog} onOpenChange={setShowBatchDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Layers className="h-5 w-5 text-orange-500" />
              Batch Generate Renders
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Select up to 6 style presets to generate multiple renders in one go.
              Each render uses Quick mode for faster generation.
            </p>

            <div className="space-y-3 max-h-[300px] overflow-y-auto">
              {Object.entries(groupedPresets).map(([category, presets]) => (
                <div key={category}>
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                    {CATEGORY_LABELS[category] || category}
                  </h4>
                  <div className="grid grid-cols-2 gap-1.5">
                    {presets.map((preset) => {
                      const isSelected = batchPresets.includes(preset.id);
                      return (
                        <button
                          key={preset.id}
                          onClick={() => toggleBatchPreset(preset.id)}
                          className={`flex items-center gap-2 px-2.5 py-2 rounded-md border text-left text-xs transition-colors ${
                            isSelected
                              ? "bg-orange-50 border-orange-400 text-orange-800"
                              : "bg-background border-border hover:bg-muted/50"
                          }`}
                        >
                          {isSelected ? (
                            <CheckSquare className="h-3.5 w-3.5 text-orange-600 shrink-0" />
                          ) : (
                            <div className="h-3.5 w-3.5 border rounded shrink-0" />
                          )}
                          <span>{preset.icon}</span>
                          <span className="truncate">{preset.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between pt-2 border-t">
              <span className="text-xs text-muted-foreground">
                {batchPresets.length}/6 presets selected
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowBatchDialog(false)}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={handleBatchGenerate}
                  disabled={batchPresets.length === 0 || batchGenerating}
                  className="gap-1.5 bg-orange-600 hover:bg-orange-700"
                >
                  {batchGenerating ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Layers className="h-4 w-4" />
                  )}
                  Generate {batchPresets.length} Render{batchPresets.length !== 1 ? "s" : ""}
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
