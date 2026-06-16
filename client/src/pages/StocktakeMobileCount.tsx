import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useParams } from "wouter";
import { toast } from "sonner";
import { ArrowLeft, Camera, CameraOff, CheckCircle2, Minus, Plus, RefreshCw, Search, ScanLine, X } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type CountFilter = "all" | "uncounted" | "variance";
type SaveState = "saving" | "saved" | "error";

type StocktakeLineView = {
  id: number;
  systemQty: number | string | null;
  countedQty: number | string | null;
  variance?: number | string | null;
  countedAt?: string | Date | null;
  stockItem?: {
    code?: string | null;
    name?: string | null;
    category?: string | null;
    unit?: string | null;
    unitType?: string | null;
  } | null;
};

const SCAN_FORMATS = [
  "code_128",
  "code_39",
  "code_93",
  "codabar",
  "ean_13",
  "ean_8",
  "itf",
  "qr_code",
  "upc_a",
  "upc_e",
];

function normalizeCode(value: unknown) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, "");
}

function quantityToNumber(value: unknown) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function formatQuantity(value: number) {
  if (!Number.isFinite(value)) return "0";
  return Number(value.toFixed(4)).toString();
}

function isNumericDraft(value: string) {
  return /^\d*\.?\d*$/.test(value);
}

export default function StocktakeMobileCount() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();
  const stocktakeId = Number(id);

  const { data, isLoading, error } = trpc.stocktake.getById.useQuery(
    { id: stocktakeId },
    { enabled: Number.isFinite(stocktakeId) }
  );
  const updateCounts = trpc.stocktake.updateCounts.useMutation();

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<CountFilter>("uncounted");
  const [draftCounts, setDraftCounts] = useState<Record<number, string>>({});
  const [saveStates, setSaveStates] = useState<Record<number, SaveState>>({});
  const [selectedLineId, setSelectedLineId] = useState<number | null>(null);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [lastScan, setLastScan] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const saveTimersRef = useRef<Record<number, ReturnType<typeof setTimeout>>>({});
  const rowRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const lastDetectedRef = useRef<{ code: string; at: number }>({ code: "", at: 0 });

  const lines = useMemo<StocktakeLineView[]>(() => (data?.lines || []) as StocktakeLineView[], [data?.lines]);

  const getDraftOrCount = useCallback((line: StocktakeLineView) => {
    if (draftCounts[line.id] !== undefined) return draftCounts[line.id];
    if (line.countedQty !== null && line.countedQty !== undefined) return formatQuantity(quantityToNumber(line.countedQty));
    return "0";
  }, [draftCounts]);

  const lineHasCount = useCallback((line: StocktakeLineView) => {
    return draftCounts[line.id] !== undefined || line.countedQty !== null;
  }, [draftCounts]);

  const predictedVariance = useCallback((line: StocktakeLineView) => {
    if (!lineHasCount(line)) return null;
    return quantityToNumber(getDraftOrCount(line)) - quantityToNumber(line.systemQty);
  }, [getDraftOrCount, lineHasCount]);

  const stats = useMemo(() => {
    const counted = lines.filter((line) => lineHasCount(line)).length;
    const variance = lines.filter((line) => {
      const value = predictedVariance(line);
      return value !== null && Math.abs(value) > 0.0001;
    }).length;
    return { total: lines.length, counted, variance };
  }, [lineHasCount, lines, predictedVariance]);

  const filteredLines = useMemo(() => {
    const query = search.trim().toLowerCase();
    return lines.filter((line) => {
      const code = line.stockItem?.code || "";
      const name = line.stockItem?.name || "";
      const category = line.stockItem?.category || "";
      const matchesSearch = !query
        || code.toLowerCase().includes(query)
        || name.toLowerCase().includes(query)
        || category.toLowerCase().includes(query);
      if (!matchesSearch) return false;
      if (filter === "uncounted") return !lineHasCount(line);
      if (filter === "variance") {
        const value = predictedVariance(line);
        return value !== null && Math.abs(value) > 0.0001;
      }
      return true;
    });
  }, [filter, lineHasCount, lines, predictedVariance, search]);

  const stopScanner = useCallback(() => {
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  const findLineByCode = useCallback((rawCode: string) => {
    const normalized = normalizeCode(rawCode);
    if (!normalized) return null;
    return lines.find((line) => normalizeCode(line.stockItem?.code) === normalized) || null;
  }, [lines]);

  const selectLine = useCallback((line: StocktakeLineView, scannedCode?: string) => {
    setSelectedLineId(line.id);
    setFilter("all");
    setSearch(line.stockItem?.code || line.stockItem?.name || "");
    if (scannedCode) setLastScan(scannedCode);
    window.setTimeout(() => {
      rowRefs.current[line.id]?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 50);
  }, []);

  const handleDetectedCode = useCallback((rawCode: string) => {
    const normalized = normalizeCode(rawCode);
    if (!normalized) return;
    const now = Date.now();
    if (lastDetectedRef.current.code === normalized && now - lastDetectedRef.current.at < 1500) return;
    lastDetectedRef.current = { code: normalized, at: now };

    const line = findLineByCode(rawCode);
    if (!line) {
      setLastScan(rawCode);
      toast.error(`No stock item found for ${rawCode}`);
      return;
    }
    selectLine(line, rawCode);
    toast.success(`Matched ${line.stockItem?.code || rawCode}`);
  }, [findLineByCode, selectLine]);

  useEffect(() => {
    if (!scannerOpen) {
      stopScanner();
      return;
    }

    let cancelled = false;

    async function startScanner() {
      setCameraError(null);
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraError("Camera access is unavailable in this browser.");
        setScannerOpen(false);
        return;
      }
      if (!("BarcodeDetector" in window)) {
        setCameraError("Barcode scanning is unavailable in this browser.");
        setScannerOpen(false);
        return;
      }

      try {
        const BarcodeDetectorCtor = (window as any).BarcodeDetector;
        const supportedFormats = typeof BarcodeDetectorCtor.getSupportedFormats === "function"
          ? await BarcodeDetectorCtor.getSupportedFormats()
          : SCAN_FORMATS;
        const formats = SCAN_FORMATS.filter((format) => supportedFormats.includes(format));
        const detector = new BarcodeDetectorCtor(formats.length ? { formats } : undefined);
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: "environment" } },
        });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }

        const scanFrame = async () => {
          if (cancelled || !videoRef.current) return;
          try {
            if (videoRef.current.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
              const results = await detector.detect(videoRef.current);
              const rawValue = results?.[0]?.rawValue;
              if (rawValue) handleDetectedCode(rawValue);
            }
          } catch (scanError) {
            console.warn("Barcode scan failed", scanError);
          }
          animationFrameRef.current = requestAnimationFrame(scanFrame);
        };

        animationFrameRef.current = requestAnimationFrame(scanFrame);
      } catch (err: any) {
        setCameraError(err?.message || "Could not start camera.");
        setScannerOpen(false);
      }
    }

    startScanner();

    return () => {
      cancelled = true;
      stopScanner();
    };
  }, [handleDetectedCode, scannerOpen, stopScanner]);

  useEffect(() => {
    return () => {
      Object.values(saveTimersRef.current).forEach((timer) => clearTimeout(timer));
      stopScanner();
    };
  }, [stopScanner]);

  const queueSave = useCallback((lineId: number, qty: string) => {
    if (!qty || !isNumericDraft(qty)) return;
    const numericQty = quantityToNumber(qty);
    const countedQty = formatQuantity(Math.max(0, numericQty));

    setSaveStates((prev) => ({ ...prev, [lineId]: "saving" }));
    if (saveTimersRef.current[lineId]) clearTimeout(saveTimersRef.current[lineId]);

    saveTimersRef.current[lineId] = setTimeout(() => {
      updateCounts.mutate(
        {
          stocktakeId,
          counts: [{ lineId, countedQty }],
        },
        {
          onSuccess: () => {
            setSaveStates((prev) => ({ ...prev, [lineId]: "saved" }));
            utils.stocktake.getById.invalidate({ id: stocktakeId });
          },
          onError: (err) => {
            setSaveStates((prev) => ({ ...prev, [lineId]: "error" }));
            toast.error(err.message);
          },
        }
      );
    }, 800);
  }, [stocktakeId, updateCounts, utils.stocktake.getById]);

  const setLineQuantity = (line: StocktakeLineView, value: string) => {
    if (!isNumericDraft(value)) return;
    setSelectedLineId(line.id);
    setDraftCounts((prev) => ({ ...prev, [line.id]: value }));
    if (value !== "") queueSave(line.id, value);
  };

  const adjustLineQuantity = (line: StocktakeLineView, delta: number) => {
    const current = quantityToNumber(getDraftOrCount(line));
    const next = formatQuantity(Math.max(0, current + delta));
    setLineQuantity(line, next);
  };

  const handleSearchSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const line = findLineByCode(search);
    if (line) {
      selectLine(line);
      return;
    }
    if (filteredLines.length === 1) {
      selectLine(filteredLines[0]);
    }
  };

  if (isLoading) {
    return <div className="min-h-screen bg-muted/30 p-4">Loading stocktake...</div>;
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-muted/30 p-4">
        <Button variant="ghost" size="sm" onClick={() => navigate("/manufacturing/stocktake")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <Card className="mt-4">
          <CardContent className="p-4">
            <div className="font-medium">Stocktake not found</div>
            <div className="mt-1 text-sm text-muted-foreground">{error?.message}</div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const isEditable = data.status === "in_progress";
  const progressPct = stats.total ? Math.round((stats.counted / stats.total) * 100) : 0;

  return (
    <div className="min-h-screen bg-muted/30 pb-24">
      <div className="sticky top-0 z-20 border-b bg-background/95 px-3 py-3 shadow-sm backdrop-blur">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => navigate(`/manufacturing/stocktake/${stocktakeId}`)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="min-w-0 flex-1">
            <div className="truncate text-base font-semibold">{data.stocktakeNumber}</div>
            <div className="text-xs text-muted-foreground">{stats.counted} of {stats.total} counted</div>
          </div>
          <Badge className={
            isEditable ? "bg-blue-100 text-blue-800" :
              data.status === "finalised" ? "bg-green-100 text-green-800" :
                "bg-gray-100 text-gray-800"
          }>
            {String(data.status).replace(/_/g, " ")}
          </Badge>
        </div>

        <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
          <div className="h-full bg-green-600 transition-all" style={{ width: `${progressPct}%` }} />
        </div>

        <form className="mt-3 flex gap-2" onSubmit={handleSearchSubmit}>
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search name or code"
              className="h-11 pl-9 pr-9"
            />
            {search && (
              <button
                type="button"
                className="absolute right-2 top-1/2 rounded-md p-1 text-muted-foreground hover:bg-muted"
                onClick={() => setSearch("")}
                aria-label="Clear search"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <Button type="submit" variant="outline" size="icon" className="h-11 w-11 shrink-0">
            <ScanLine className="h-5 w-5" />
          </Button>
          <Button
            type="button"
            variant={scannerOpen ? "default" : "outline"}
            size="icon"
            className="h-11 w-11 shrink-0"
            onClick={() => setScannerOpen((open) => !open)}
          >
            {scannerOpen ? <CameraOff className="h-5 w-5" /> : <Camera className="h-5 w-5" />}
          </Button>
        </form>

        <div className="mt-3 grid grid-cols-3 gap-2">
          {(["uncounted", "all", "variance"] as const).map((option) => (
            <Button
              key={option}
              type="button"
              variant={filter === option ? "default" : "outline"}
              size="sm"
              className="h-9 text-xs"
              onClick={() => setFilter(option)}
            >
              {option === "uncounted" ? `Open ${stats.total - stats.counted}` : option === "all" ? `All ${stats.total}` : `Var ${stats.variance}`}
            </Button>
          ))}
        </div>
      </div>

      {scannerOpen && (
        <div className="border-b bg-black px-3 py-3">
          <video ref={videoRef} className="h-56 w-full rounded-md object-cover" playsInline muted />
        </div>
      )}

      {(cameraError || lastScan) && (
        <div className="px-3 pt-3">
          <div className={`rounded-md border px-3 py-2 text-sm ${cameraError ? "border-red-200 bg-red-50 text-red-700" : "border-green-200 bg-green-50 text-green-700"}`}>
            {cameraError || `Last scan: ${lastScan}`}
          </div>
        </div>
      )}

      {!isEditable && (
        <div className="px-3 pt-3">
          <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            This stocktake is not open for counting.
          </div>
        </div>
      )}

      <div className="space-y-3 px-3 pt-3">
        {filteredLines.map((line) => {
          const qty = getDraftOrCount(line);
          const systemQty = quantityToNumber(line.systemQty);
          const variance = predictedVariance(line);
          const saveState = saveStates[line.id];
          const selected = selectedLineId === line.id;
          const itemCode = line.stockItem?.code || "-";
          const itemName = line.stockItem?.name || "Unknown item";
          const unit = line.stockItem?.unit || line.stockItem?.unitType || "unit";

          return (
            <Card
              key={line.id}
              ref={(node) => { rowRefs.current[line.id] = node; }}
              className={`overflow-hidden transition-shadow ${selected ? "ring-2 ring-primary" : ""}`}
            >
              <CardContent className="p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-mono text-xs text-muted-foreground">{itemCode}</div>
                    <div className="mt-0.5 line-clamp-2 font-medium leading-snug">{itemName}</div>
                    <div className="mt-1 text-xs text-muted-foreground">{line.stockItem?.category || "Uncategorised"}</div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    {lineHasCount(line) ? (
                      <Badge className="bg-green-100 text-green-800">
                        <CheckCircle2 className="mr-1 h-3 w-3" />
                        Counted
                      </Badge>
                    ) : (
                      <Badge variant="outline">Open</Badge>
                    )}
                    {saveState === "saving" && <Badge variant="outline">Saving</Badge>}
                    {saveState === "saved" && <Badge className="bg-blue-100 text-blue-800">Saved</Badge>}
                    {saveState === "error" && <Badge variant="destructive">Error</Badge>}
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-3 gap-2 rounded-md bg-muted/40 p-2 text-center text-xs">
                  <div>
                    <div className="text-muted-foreground">System</div>
                    <div className="font-semibold">{formatQuantity(systemQty)}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Count</div>
                    <div className="font-semibold">{qty || "0"}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Variance</div>
                    <div className={`font-semibold ${variance === null ? "" : variance < 0 ? "text-red-600" : variance > 0 ? "text-green-700" : ""}`}>
                      {variance === null ? "-" : `${variance > 0 ? "+" : ""}${formatQuantity(variance)}`}
                    </div>
                  </div>
                </div>

                <div className="mt-3 flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-12 w-12 shrink-0"
                    disabled={!isEditable}
                    onClick={() => adjustLineQuantity(line, -1)}
                  >
                    <Minus className="h-5 w-5" />
                  </Button>
                  <Input
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.1"
                    value={qty}
                    disabled={!isEditable}
                    onChange={(event) => setLineQuantity(line, event.target.value)}
                    onFocus={() => setSelectedLineId(line.id)}
                    className="h-12 min-w-0 text-center text-lg font-semibold"
                    aria-label={`${itemName} counted quantity`}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-12 w-12 shrink-0"
                    disabled={!isEditable}
                    onClick={() => adjustLineQuantity(line, 1)}
                  >
                    <Plus className="h-5 w-5" />
                  </Button>
                </div>

                <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                  <span>{unit}</span>
                  {saveState === "error" && (
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-red-700 hover:bg-red-50"
                      onClick={() => queueSave(line.id, qty)}
                    >
                      <RefreshCw className="h-3 w-3" />
                      Retry
                    </button>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}

        {filteredLines.length === 0 && (
          <Card>
            <CardContent className="p-6 text-center text-sm text-muted-foreground">
              No stocktake lines match the current filter.
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
