import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useParams } from "wouter";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import {
  ArrowLeft,
  Copy,
  FlipHorizontal,
  Plus,
  RotateCcw,
  Save,
  Trash2,
  Undo2,
} from "lucide-react";
import { toast } from "sonner";

type Point = { x: number; y: number };
type Geometry = {
  points: Point[];
  gridSize: number;
  snapToGrid: boolean;
  foldLabels?: Record<string, string>;
  notes?: string;
};

type FoldDetails = {
  segmentLengths?: Record<string, number>;
  foldTypes?: Record<string, string>;
  foldNotes?: Record<string, string>;
  endTreatments?: Record<string, string>;
  endTreatmentLengths?: Record<string, number>;
  endTreatmentNotes?: Record<string, string>;
};

type FlashingLineDraft = {
  id?: number;
  profileName: string;
  category: string;
  materialType: string;
  gauge: string;
  colour: string;
  colourSide: string;
  finish: string;
  quantity: number;
  lengthMm: number;
  unitPrice: number;
  geometry: Geometry;
  foldDetails: FoldDetails;
  manufacturingNotes: string;
  status: string;
};

const CANVAS_W = 560;
const CANVAS_H = 320;

const FOLD_TYPE_OPTIONS = [
  { value: "standard", label: "Standard fold" },
  { value: "crush", label: "Crush fold" },
  { value: "hook", label: "Hook" },
  { value: "beak_turn_down", label: "Beak / turn down" },
  { value: "open_hem", label: "Open hem" },
  { value: "safety_fold", label: "Safety fold" },
  { value: "return_fold", label: "Return fold" },
  { value: "end_fold", label: "End fold" },
] as const;

const END_TREATMENT_OPTIONS = [
  { value: "none", label: "None" },
  { value: "hook", label: "Hook" },
  { value: "beak_turn_down", label: "Beak / turn down" },
  { value: "turn_up", label: "Turn up" },
  { value: "return", label: "Return" },
] as const;

const END_TREATMENT_KEYS = ["start", "end"] as const;
type EndTreatmentKey = typeof END_TREATMENT_KEYS[number];

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  submitted: "Submitted",
  supplier_received: "Supplier Received",
  in_production: "In Production",
  purchase_ordered: "Purchase Ordered",
  ready: "Ready",
  completed: "Completed",
  cancelled: "Cancelled",
  archived: "Archived",
};

const DEFAULT_GEOMETRY: Geometry = {
  gridSize: 20,
  snapToGrid: true,
  points: [],
};

const DEFAULT_FOLD_DETAILS: FoldDetails = {
  segmentLengths: {},
  foldTypes: {},
  foldNotes: {},
  endTreatments: {},
  endTreatmentLengths: {},
  endTreatmentNotes: {},
};

const DEFAULT_LINE: FlashingLineDraft = {
  id: undefined as number | undefined,
  profileName: "Custom flashing",
  category: "custom",
  materialType: "Colorbond",
  gauge: "0.55 BMT",
  colour: "",
  colourSide: "outside",
  finish: "",
  quantity: 1,
  lengthMm: 6500,
  unitPrice: 0,
  geometry: DEFAULT_GEOMETRY,
  foldDetails: DEFAULT_FOLD_DETAILS,
  manufacturingNotes: "",
  status: "draft",
};

function formatDateInput(value?: string | Date | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

function formatDateTime(value?: string | Date | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("en-AU", { dateStyle: "medium", timeStyle: "short" });
}

function formatCurrency(value: unknown) {
  return new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(Number(value || 0));
}

function normaliseColourGroupName(value: unknown) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/colour/g, "color");
}

function distance(a: Point, b: Point) {
  return Math.sqrt((b.x - a.x) ** 2 + (b.y - a.y) ** 2);
}

function round(value: number) {
  return Math.round(value * 100) / 100;
}

function segmentKey(index: number) {
  return `segment-${index + 1}`;
}

function foldKey(pointIndex: number) {
  return `fold-${pointIndex}`;
}

function calculateGirth(points: Point[]) {
  return round(points.slice(1).reduce((total, point, index) => total + distance(points[index], point), 0));
}

function getFoldCount(points: Point[]) {
  return Math.max(0, points.length - 2);
}

function normaliseFoldDetails(value: any): FoldDetails {
  return {
    segmentLengths: Object.fromEntries(
      Object.entries(value?.segmentLengths || {})
        .map(([key, length]) => [key, Number(length)])
        .filter(([, length]) => Number.isFinite(length)),
    ),
    foldTypes: { ...(value?.foldTypes || {}) },
    foldNotes: { ...(value?.foldNotes || {}) },
    endTreatments: { ...(value?.endTreatments || {}) },
    endTreatmentLengths: Object.fromEntries(
      Object.entries(value?.endTreatmentLengths || {})
        .map(([key, length]) => [key, Number(length)])
        .filter(([, length]) => Number.isFinite(length)),
    ),
    endTreatmentNotes: { ...(value?.endTreatmentNotes || {}) },
  };
}

function pruneFoldDetails(value: any, points: Point[]): FoldDetails {
  const details = normaliseFoldDetails(value);
  const segmentCount = Math.max(0, points.length - 1);
  const foldCount = getFoldCount(points);
  const nextSegmentLengths: Record<string, number> = {};
  const nextFoldTypes: Record<string, string> = {};
  const nextFoldNotes: Record<string, string> = {};
  const nextEndTreatments: Record<string, string> = {};
  const nextEndTreatmentLengths: Record<string, number> = {};
  const nextEndTreatmentNotes: Record<string, string> = {};

  for (let index = 0; index < segmentCount; index += 1) {
    const key = segmentKey(index);
    if (details.segmentLengths?.[key] !== undefined) nextSegmentLengths[key] = details.segmentLengths[key];
  }
  for (let index = 1; index <= foldCount; index += 1) {
    const key = foldKey(index);
    if (details.foldTypes?.[key]) nextFoldTypes[key] = details.foldTypes[key];
    if (details.foldNotes?.[key]) nextFoldNotes[key] = details.foldNotes[key];
  }
  if (points.length >= 2) {
    END_TREATMENT_KEYS.forEach((key) => {
      if (details.endTreatments?.[key]) nextEndTreatments[key] = details.endTreatments[key];
      if (details.endTreatmentLengths?.[key] !== undefined) {
        nextEndTreatmentLengths[key] = details.endTreatmentLengths[key];
      }
      if (details.endTreatmentNotes?.[key]) nextEndTreatmentNotes[key] = details.endTreatmentNotes[key];
    });
  }

  return {
    segmentLengths: nextSegmentLengths,
    foldTypes: nextFoldTypes,
    foldNotes: nextFoldNotes,
    endTreatments: nextEndTreatments,
    endTreatmentLengths: nextEndTreatmentLengths,
    endTreatmentNotes: nextEndTreatmentNotes,
  };
}

function countCrushFolds(foldDetails: any, points: Point[]) {
  const details = normaliseFoldDetails(foldDetails);
  let count = 0;
  for (let index = 1; index <= getFoldCount(points); index += 1) {
    if (details.foldTypes?.[foldKey(index)] === "crush") count += 1;
  }
  return count;
}

function resizeSegment(geometry: Geometry, segmentIndex: number, nextLength: number): Geometry {
  const start = geometry.points[segmentIndex];
  const end = geometry.points[segmentIndex + 1];
  if (!start || !end || !Number.isFinite(nextLength) || nextLength <= 0) return geometry;

  const currentLength = distance(start, end);
  if (currentLength <= 0) return geometry;

  const targetEnd = {
    x: start.x + ((end.x - start.x) / currentLength) * nextLength,
    y: start.y + ((end.y - start.y) / currentLength) * nextLength,
  };
  const delta = { x: targetEnd.x - end.x, y: targetEnd.y - end.y };

  return {
    ...geometry,
    points: geometry.points.map((point, index) => (
      index > segmentIndex
        ? { x: round(point.x + delta.x), y: round(point.y + delta.y) }
        : point
    )),
  };
}

function cloneGeometry(value: any): Geometry {
  const points = Array.isArray(value?.points)
    ? value.points.map((point: any) => ({ x: Number(point.x) || 0, y: Number(point.y) || 0 }))
    : [];
  return {
    points,
    gridSize: Number(value?.gridSize || 20),
    snapToGrid: value?.snapToGrid !== false,
    foldLabels: value?.foldLabels || {},
    notes: value?.notes || "",
  };
}

function ProfileDesigner({ geometry, onChange }: { geometry: Geometry; onChange: (geometry: Geometry) => void }) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const gridSize = geometry.gridSize || 20;

  const snapPoint = (point: Point) => {
    if (!geometry.snapToGrid) return point;
    return {
      x: Math.round(point.x / gridSize) * gridSize,
      y: Math.round(point.y / gridSize) * gridSize,
    };
  };

  const localPoint = (event: React.PointerEvent<SVGElement>) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return snapPoint({
      x: Math.max(0, Math.min(CANVAS_W, ((event.clientX - rect.left) / rect.width) * CANVAS_W)),
      y: Math.max(0, Math.min(CANVAS_H, ((event.clientY - rect.top) / rect.height) * CANVAS_H)),
    });
  };

  const updatePoint = (index: number, point: Point) => {
    const next = geometry.points.map((existing, i) => (i === index ? point : existing));
    onChange({ ...geometry, points: next });
  };

  const addPoint = (event: React.PointerEvent<SVGSVGElement>) => {
    if (dragIndex !== null) return;
    if (event.target !== svgRef.current) return;
    onChange({ ...geometry, points: [...geometry.points, localPoint(event)] });
  };

  const gridLines = [];
  for (let x = 0; x <= CANVAS_W; x += gridSize) gridLines.push(<line key={`x-${x}`} x1={x} y1={0} x2={x} y2={CANVAS_H} />);
  for (let y = 0; y <= CANVAS_H; y += gridSize) gridLines.push(<line key={`y-${y}`} x1={0} y1={y} x2={CANVAS_W} y2={y} />);

  const polyline = geometry.points.map((point) => `${point.x},${point.y}`).join(" ");
  const girth = calculateGirth(geometry.points);
  const foldCount = getFoldCount(geometry.points);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold">Grid Profile Designer</p>
          <p className="text-xs text-muted-foreground">Tap the grid to add points. Drag points to refine the shape.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => geometry.points.length > 0 && onChange({ ...geometry, points: geometry.points.slice(0, -1) })}
            disabled={geometry.points.length === 0}
          >
            <Undo2 className="h-4 w-4 mr-1" /> Undo Point
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              const minX = Math.min(...geometry.points.map((p) => p.x));
              const maxX = Math.max(...geometry.points.map((p) => p.x));
              onChange({ ...geometry, points: geometry.points.map((point) => ({ ...point, x: maxX - (point.x - minX) })) });
            }}
            disabled={geometry.points.length < 2}
          >
            <FlipHorizontal className="h-4 w-4 mr-1" /> Mirror
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => onChange(DEFAULT_GEOMETRY)}>
            <RotateCcw className="h-4 w-4 mr-1" /> Clear
          </Button>
        </div>
      </div>
      <div className="rounded-md border bg-slate-950 p-2 overflow-hidden">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${CANVAS_W} ${CANVAS_H}`}
          className="h-[320px] w-full cursor-crosshair touch-none"
          onPointerDown={addPoint}
          onPointerMove={(event) => {
            if (dragIndex === null) return;
            updatePoint(dragIndex, localPoint(event));
          }}
          onPointerUp={() => setDragIndex(null)}
          onPointerLeave={() => setDragIndex(null)}
        >
          <g stroke="rgba(148,163,184,0.18)" strokeWidth="1">{gridLines}</g>
          {geometry.points.length >= 2 && (
            <polyline points={polyline} fill="none" stroke="white" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
          )}
          {geometry.points.slice(1).map((point, index) => {
            const previous = geometry.points[index];
            const midX = (previous.x + point.x) / 2;
            const midY = (previous.y + point.y) / 2;
            return (
              <text key={`label-${index}`} x={midX + 8} y={midY - 8} fill="#F8FAFC" fontSize="13" fontWeight="600">
                {Math.round(distance(previous, point))} mm
              </text>
            );
          })}
          {geometry.points.map((point, index) => (
            <g key={index}>
              <circle
                cx={point.x}
                cy={point.y}
                r="9"
                fill={index === 0 ? "#C9AB57" : "#EF4444"}
                stroke="white"
                strokeWidth="2"
                className="cursor-grab"
                onPointerDown={(event) => {
                  event.stopPropagation();
                  setDragIndex(index);
                }}
              />
              <text x={point.x + 12} y={point.y + 4} fill="#CBD5E1" fontSize="12">{index + 1}</text>
            </g>
          ))}
        </svg>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
        <div className="rounded-md border bg-muted/30 p-2">
          <div className="text-muted-foreground">Girth</div>
          <div className="font-semibold">{girth} mm</div>
        </div>
        <div className="rounded-md border bg-muted/30 p-2">
          <div className="text-muted-foreground">Folds</div>
          <div className="font-semibold">{foldCount}</div>
        </div>
        <div className="rounded-md border bg-muted/30 p-2">
          <div className="text-muted-foreground">Points</div>
          <div className="font-semibold">{geometry.points.length}</div>
        </div>
        <label className="flex items-center gap-2 rounded-md border bg-muted/30 p-2">
          <input
            type="checkbox"
            checked={geometry.snapToGrid}
            onChange={(event) => onChange({ ...geometry, snapToGrid: event.target.checked })}
          />
          Snap to grid
        </label>
      </div>
    </div>
  );
}

function FoldDimensionTable({
  geometry,
  foldDetails,
  onGeometryChange,
  onFoldDetailsChange,
}: {
  geometry: Geometry;
  foldDetails: FoldDetails;
  onGeometryChange: (geometry: Geometry) => void;
  onFoldDetailsChange: (foldDetails: FoldDetails) => void;
}) {
  const details = normaliseFoldDetails(foldDetails);
  const segments = geometry.points.slice(1).map((point, index) => ({
    index,
    length: round(distance(geometry.points[index], point)),
  }));
  const folds = geometry.points.slice(1, -1).map((point, index) => ({
    foldNumber: index + 1,
    pointIndex: index + 1,
    point,
  }));
  const endTreatmentRows = END_TREATMENT_KEYS.map((key) => ({
    key,
    label: key === "start" ? "Start end treatment" : "End end treatment",
    pointLabel: key === "start" ? "Point 1" : `Point ${geometry.points.length}`,
    placeholder: key === "start" ? "e.g. 20" : "e.g. 40",
  }));

  const updateSegmentLength = (index: number, rawValue: string) => {
    const nextLength = Number(rawValue);
    if (!Number.isFinite(nextLength) || nextLength <= 0) return;
    const key = segmentKey(index);
    const nextDetails = {
      ...details,
      segmentLengths: { ...(details.segmentLengths || {}), [key]: nextLength },
    };
    onFoldDetailsChange(nextDetails);
    onGeometryChange(resizeSegment(geometry, index, nextLength));
  };

  const updateFoldType = (pointIndex: number, value: string) => {
    const key = foldKey(pointIndex);
    onFoldDetailsChange({
      ...details,
      foldTypes: { ...(details.foldTypes || {}), [key]: value },
    });
  };

  const updateFoldNote = (pointIndex: number, value: string) => {
    const key = foldKey(pointIndex);
    onFoldDetailsChange({
      ...details,
      foldNotes: { ...(details.foldNotes || {}), [key]: value },
    });
  };

  const updateEndTreatment = (key: EndTreatmentKey, value: string) => {
    const nextEndTreatments = { ...(details.endTreatments || {}) };
    if (value === "none") {
      delete nextEndTreatments[key];
    } else {
      nextEndTreatments[key] = value;
    }
    onFoldDetailsChange({
      ...details,
      endTreatments: nextEndTreatments,
    });
  };

  const updateEndTreatmentLength = (key: EndTreatmentKey, rawValue: string) => {
    const nextEndTreatmentLengths = { ...(details.endTreatmentLengths || {}) };
    if (rawValue.trim() === "") {
      delete nextEndTreatmentLengths[key];
      onFoldDetailsChange({
        ...details,
        endTreatmentLengths: nextEndTreatmentLengths,
      });
      return;
    }
    const nextLength = Number(rawValue);
    if (!Number.isFinite(nextLength) || nextLength < 0) return;
    nextEndTreatmentLengths[key] = nextLength;
    onFoldDetailsChange({
      ...details,
      endTreatmentLengths: nextEndTreatmentLengths,
    });
  };

  const updateEndTreatmentNote = (key: EndTreatmentKey, value: string) => {
    const nextEndTreatmentNotes = { ...(details.endTreatmentNotes || {}) };
    if (value.trim()) {
      nextEndTreatmentNotes[key] = value;
    } else {
      delete nextEndTreatmentNotes[key];
    }
    onFoldDetailsChange({
      ...details,
      endTreatmentNotes: nextEndTreatmentNotes,
    });
  };

  if (geometry.points.length < 2) {
    return (
      <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
        Add at least two profile points to unlock the segment and fold table.
      </div>
    );
  }

  return (
    <div className="rounded-md border">
      <div className="border-b bg-muted/30 px-3 py-2">
        <p className="text-sm font-semibold">Segments, Folds & End Treatments</p>
        <p className="text-xs text-muted-foreground">
          Edit segment dimensions and identify special fold types such as crush folds, hooks, and beak / turn downs.
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="bg-muted/40 text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left">Item</th>
              <th className="px-3 py-2 text-left">Point / Segment</th>
              <th className="px-3 py-2 text-right">Dimension</th>
              <th className="px-3 py-2 text-left">Fold / Treatment Type</th>
              <th className="px-3 py-2 text-left">Notes</th>
            </tr>
          </thead>
          <tbody>
            {segments.map((segment) => {
              const key = segmentKey(segment.index);
              return (
                <tr key={key} className="border-t">
                  <td className="px-3 py-2 font-medium">Segment {segment.index + 1}</td>
                  <td className="px-3 py-2 text-muted-foreground">
                    Point {segment.index + 1} to {segment.index + 2}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center justify-end gap-2">
                      <Input
                        key={`${key}-${Math.round(segment.length)}`}
                        type="number"
                        min={1}
                        defaultValue={Math.round(details.segmentLengths?.[key] ?? segment.length)}
                        onBlur={(event) => updateSegmentLength(segment.index, event.target.value)}
                        className="h-9 w-28 text-right"
                      />
                      <span className="text-xs text-muted-foreground">mm</span>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">-</td>
                  <td className="px-3 py-2 text-muted-foreground">Segment length for manufacture</td>
                </tr>
              );
            })}
            {folds.map((fold) => {
              const key = foldKey(fold.pointIndex);
              return (
                <tr key={key} className="border-t bg-muted/10">
                  <td className="px-3 py-2 font-medium">Fold {fold.foldNumber}</td>
                  <td className="px-3 py-2 text-muted-foreground">Point {fold.pointIndex + 1}</td>
                  <td className="px-3 py-2 text-right text-muted-foreground">
                    {Math.round(fold.point.x)}, {Math.round(fold.point.y)}
                  </td>
                  <td className="px-3 py-2">
                    <select
                      className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                      value={details.foldTypes?.[key] || "standard"}
                      onChange={(event) => updateFoldType(fold.pointIndex, event.target.value)}
                    >
                      {FOLD_TYPE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-2">
                    <Input
                      value={details.foldNotes?.[key] || ""}
                      onChange={(event) => updateFoldNote(fold.pointIndex, event.target.value)}
                      placeholder="Optional fold note"
                      className="h-9"
                    />
                  </td>
                </tr>
              );
            })}
            {endTreatmentRows.map((endTreatment) => (
              <tr key={endTreatment.key} className="border-t bg-amber-50/40">
                <td className="px-3 py-2 font-medium">{endTreatment.label}</td>
                <td className="px-3 py-2 text-muted-foreground">{endTreatment.pointLabel}</td>
                <td className="px-3 py-2">
                  <div className="flex items-center justify-end gap-2">
                    <Input
                      type="number"
                      min={0}
                      value={details.endTreatmentLengths?.[endTreatment.key] ?? ""}
                      onChange={(event) => updateEndTreatmentLength(endTreatment.key, event.target.value)}
                      placeholder={endTreatment.placeholder}
                      className="h-9 w-28 text-right"
                    />
                    <span className="text-xs text-muted-foreground">mm</span>
                  </div>
                </td>
                <td className="px-3 py-2">
                  <select
                    className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                    value={details.endTreatments?.[endTreatment.key] || "none"}
                    onChange={(event) => updateEndTreatment(endTreatment.key, event.target.value)}
                  >
                    {END_TREATMENT_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </td>
                <td className="px-3 py-2">
                  <Input
                    value={details.endTreatmentNotes?.[endTreatment.key] || ""}
                    onChange={(event) => updateEndTreatmentNote(endTreatment.key, event.target.value)}
                    placeholder="Optional end treatment note"
                    className="h-9"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function FlashingOrderDetail() {
  const params = useParams<{ id: string }>();
  const orderId = Number(params.id);
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();
  const detailQuery = trpc.flashing.getOrder.useQuery({ id: orderId }, { enabled: Number.isFinite(orderId) });
  const updateOrder = trpc.flashing.updateOrder.useMutation({
    onSuccess: () => {
      toast.success("Order details saved");
      utils.flashing.getOrder.invalidate({ id: orderId });
    },
    onError: (error) => toast.error(error.message),
  });
  const updateStatus = trpc.flashing.updateStatus.useMutation({
    onSuccess: () => {
      toast.success("Status updated");
      utils.flashing.getOrder.invalidate({ id: orderId });
      utils.flashing.listOrders.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });
  const saveLine = trpc.flashing.saveLine.useMutation({
    onSuccess: () => {
      toast.success("Flashing line saved");
      setLine(DEFAULT_LINE);
      utils.flashing.getOrder.invalidate({ id: orderId });
      utils.flashing.listOrders.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });
  const deleteLine = trpc.flashing.deleteLine.useMutation({
    onSuccess: () => {
      toast.success("Line deleted");
      utils.flashing.getOrder.invalidate({ id: orderId });
      utils.flashing.listOrders.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });
  const saveTemplate = trpc.flashing.saveTemplate.useMutation({
    onSuccess: () => {
      toast.success("Template saved");
      utils.flashing.getOrder.invalidate({ id: orderId });
    },
    onError: (error) => toast.error(error.message),
  });

  const order = detailQuery.data?.order;
  const lines = detailQuery.data?.lines || [];
  const templates = detailQuery.data?.templates || [];
  const history = detailQuery.data?.statusHistory || [];

  const [orderDraft, setOrderDraft] = useState({
    supplierName: "",
    requestedDeliveryAt: "",
    deliveryMethod: "pickup",
    priority: "normal",
    siteNotes: "",
    internalNotes: "",
  });
  const [line, setLine] = useState(DEFAULT_LINE);
  const { data: allColourGroups } = trpc.colourGroups.getAll.useQuery();
  const { data: allColourMembers } = trpc.colourGroups.getAllMembers.useQuery();

  useEffect(() => {
    if (!order) return;
    setOrderDraft({
      supplierName: order.supplierName || "",
      requestedDeliveryAt: formatDateInput(order.requestedDeliveryAt),
      deliveryMethod: order.deliveryMethod || "pickup",
      priority: order.priority || "normal",
      siteNotes: order.siteNotes || "",
      internalNotes: order.internalNotes || "",
    });
  }, [order]);

  const colourbondColours = useMemo(() => {
    const groups = Array.isArray(allColourGroups) ? allColourGroups : [];
    const members = Array.isArray(allColourMembers) ? allColourMembers : [];
    const standardGroup = groups.find((group: any) => normaliseColourGroupName(group.name) === "standard colorbond")
      || groups.find((group: any) => normaliseColourGroupName(group.name).includes("standard colorbond"))
      || groups.find((group: any) => normaliseColourGroupName(group.name).includes("colorbond"));
    if (!standardGroup) return [];

    return Array.from(new Set(
      members
        .filter((member: any) => Number(member.colourGroupId) === Number(standardGroup.id))
        .sort((a: any, b: any) => (Number(a.sortOrder || 0) - Number(b.sortOrder || 0)) || String(a.colourValue || "").localeCompare(String(b.colourValue || "")))
        .map((member: any) => String(member.colourValue || "").trim())
        .filter(Boolean),
    ));
  }, [allColourGroups, allColourMembers]);

  const colourOptions = useMemo(() => {
    if (!line.colour || colourbondColours.includes(line.colour)) return colourbondColours;
    return [line.colour, ...colourbondColours];
  }, [colourbondColours, line.colour]);

  const updateLineGeometry = (geometry: Geometry) => {
    setLine((current) => ({
      ...current,
      geometry,
      foldDetails: pruneFoldDetails(current.foldDetails, geometry.points),
    }));
  };

  const updateFoldDetails = (foldDetails: FoldDetails) => {
    setLine((current) => ({ ...current, foldDetails: normaliseFoldDetails(foldDetails) }));
  };

  const lineGirth = useMemo(() => calculateGirth(line.geometry.points), [line.geometry.points]);
  const lineFoldCount = getFoldCount(line.geometry.points);
  const lineCrushFoldCount = countCrushFolds(line.foldDetails, line.geometry.points);
  const lineTotalLm = round((Number(line.lengthMm || 0) * Number(line.quantity || 1)) / 1000);
  const orderFoldCount = useMemo(() => (
    lines.reduce((total: number, existing: any) => {
      const geometry = cloneGeometry(existing.geometry);
      return total + Number(existing.bendCount ?? getFoldCount(geometry.points));
    }, 0)
  ), [lines]);
  const orderCrushFoldCount = useMemo(() => (
    lines.reduce((total: number, existing: any) => total + countCrushFolds(existing.foldDetails, cloneGeometry(existing.geometry).points), 0)
  ), [lines]);

  if (detailQuery.isLoading) {
    return <div className="p-8 flex justify-center"><Spinner /></div>;
  }

  if (!order) {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <Card>
          <CardContent className="py-10 text-center">
            <p className="font-semibold">Flashing order not found</p>
            <Button className="mt-4" onClick={() => navigate("/construction/flashing-orders")}>Back to Flashing Orders</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const saveOrderDetails = () => {
    updateOrder.mutate({
      id: order.id,
      supplierName: orderDraft.supplierName || null,
      requestedDeliveryAt: orderDraft.requestedDeliveryAt || null,
      deliveryMethod: orderDraft.deliveryMethod,
      priority: orderDraft.priority as any,
      siteNotes: orderDraft.siteNotes || null,
      internalNotes: orderDraft.internalNotes || null,
    });
  };

  const submitLine = () => {
    if (line.geometry.points.length < 2) {
      toast.error("Add at least two profile points before saving a flashing line.");
      return;
    }
    saveLine.mutate({
      ...line,
      orderId: order.id,
      category: line.category || "custom",
      materialType: line.materialType || "Colorbond",
      colourSide: line.colourSide as any,
      status: line.status as any,
    });
  };

  const editLine = (existing: any) => {
    setLine({
      id: existing.id,
      profileName: existing.profileName || "Custom flashing",
      category: existing.category || "custom",
      materialType: existing.materialType || "Colorbond",
      gauge: existing.gauge || "",
      colour: existing.colour || "",
      colourSide: existing.colourSide || "unspecified",
      finish: existing.finish || "",
      quantity: Number(existing.quantity || 1),
      lengthMm: Number(existing.lengthMm || 0),
      unitPrice: Number(existing.unitPrice || 0),
      geometry: cloneGeometry(existing.geometry),
      foldDetails: normaliseFoldDetails(existing.foldDetails),
      manufacturingNotes: existing.manufacturingNotes || "",
      status: existing.status || "draft",
    });
  };

  const loadTemplate = (template: any) => {
    setLine({
      ...DEFAULT_LINE,
      profileName: template.name,
      category: template.category || "custom",
      materialType: template.defaultMaterialType || "Colorbond",
      gauge: template.defaultGauge || "",
      colour: template.defaultColour || "",
      colourSide: template.defaultColourSide || "unspecified",
      quantity: Number(template.defaultQuantity || 1),
      lengthMm: Number(template.defaultLengthMm || 0),
      geometry: cloneGeometry(template.geometry),
      foldDetails: normaliseFoldDetails((template.geometry as any)?.foldDetails),
    });
  };

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-[1500px] mx-auto">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/construction/flashing-orders")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold">{order.orderNumber}</h1>
              <Badge variant="outline">{STATUS_LABELS[order.status] || order.status}</Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              {order.clientName || "Manual order"} {order.jobNumber ? `- ${order.jobNumber}` : ""}
            </p>
            <p className="text-xs text-muted-foreground">{order.siteAddress || "No site address recorded"}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <select
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            value={order.status}
            onChange={(event) => updateStatus.mutate({ id: order.id, status: event.target.value as any })}
          >
            {Object.entries(STATUS_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Profiles</p>
            <p className="text-2xl font-bold">{order.lineCount || 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Total LM</p>
            <p className="text-2xl font-bold">{Number(order.totalLinealMetres || 0).toFixed(2)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Total Girth</p>
            <p className="text-2xl font-bold">{Number(order.totalGirthMm || 0).toFixed(0)} mm</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Folds</p>
            <p className="text-2xl font-bold">{orderFoldCount}</p>
            {orderCrushFoldCount > 0 && <p className="text-xs text-muted-foreground">{orderCrushFoldCount} crush</p>}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_380px] gap-6">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Profile Line Designer</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <ProfileDesigner geometry={line.geometry} onChange={updateLineGeometry} />
              <FoldDimensionTable
                geometry={line.geometry}
                foldDetails={line.foldDetails}
                onGeometryChange={updateLineGeometry}
                onFoldDetailsChange={updateFoldDetails}
              />

              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <div className="space-y-1 md:col-span-2">
                  <label className="text-sm font-medium">Profile Name</label>
                  <Input value={line.profileName} onChange={(event) => setLine({ ...line, profileName: event.target.value })} />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium">Category</label>
                  <Input value={line.category} onChange={(event) => setLine({ ...line, category: event.target.value })} placeholder="apron, capping, gutter..." />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium">Status</label>
                  <select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={line.status} onChange={(event) => setLine({ ...line, status: event.target.value })}>
                    <option value="draft">Draft</option>
                    <option value="ready">Ready</option>
                    <option value="needs_clarification">Needs Clarification</option>
                    <option value="approved">Approved</option>
                    <option value="in_production">In Production</option>
                    <option value="completed">Completed</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium">Material</label>
                  <Input value={line.materialType} onChange={(event) => setLine({ ...line, materialType: event.target.value })} />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium">Gauge / Thickness</label>
                  <Input value={line.gauge} onChange={(event) => setLine({ ...line, gauge: event.target.value })} />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium">Colour</label>
                  <select
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    value={line.colour || ""}
                    onChange={(event) => setLine({ ...line, colour: event.target.value })}
                  >
                    <option value="">Select Colourbond colour</option>
                    {colourOptions.map((colour) => (
                      <option key={colour} value={colour}>
                        {colour}{line.colour === colour && !colourbondColours.includes(colour) ? " (saved)" : ""}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-muted-foreground">From the Standard Colorbond colour group.</p>
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium">Colour Side</label>
                  <select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={line.colourSide} onChange={(event) => setLine({ ...line, colourSide: event.target.value })}>
                    <option value="outside">Outside</option>
                    <option value="inside">Inside</option>
                    <option value="both">Both</option>
                    <option value="unspecified">Unspecified</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium">Quantity</label>
                  <Input type="number" min={1} value={line.quantity} onChange={(event) => setLine({ ...line, quantity: Number(event.target.value) })} />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium">Length (mm)</label>
                  <Input type="number" min={0} value={line.lengthMm} onChange={(event) => setLine({ ...line, lengthMm: Number(event.target.value) })} />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium">Finish</label>
                  <Input value={line.finish} onChange={(event) => setLine({ ...line, finish: event.target.value })} />
                </div>
              </div>

              <Textarea
                value={line.manufacturingNotes}
                onChange={(event) => setLine({ ...line, manufacturingNotes: event.target.value })}
                placeholder="Manufacturing notes, folds, end treatments, notches, tapers..."
              />

              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                <div className="rounded-md border bg-muted/30 p-3">
                  <p className="text-xs text-muted-foreground">Girth</p>
                  <p className="font-semibold">{lineGirth} mm</p>
                </div>
                <div className="rounded-md border bg-muted/30 p-3">
                  <p className="text-xs text-muted-foreground">Folds</p>
                  <p className="font-semibold">{lineFoldCount}</p>
                </div>
                <div className="rounded-md border bg-muted/30 p-3">
                  <p className="text-xs text-muted-foreground">Crush Folds</p>
                  <p className="font-semibold">{lineCrushFoldCount}</p>
                </div>
                <div className="rounded-md border bg-muted/30 p-3">
                  <p className="text-xs text-muted-foreground">Total LM</p>
                  <p className="font-semibold">{lineTotalLm.toFixed(2)}</p>
                </div>
              </div>

              <div className="flex flex-wrap justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setLine(DEFAULT_LINE)}>
                  <Plus className="h-4 w-4 mr-1.5" />
                  New Line
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    if (line.geometry.points.length < 2) {
                      toast.error("Add at least two profile points before saving a template.");
                      return;
                    }
                    saveTemplate.mutate({
                      name: line.profileName,
                      category: line.category,
                      geometry: { ...line.geometry, foldDetails: line.foldDetails } as any,
                      defaultMaterialType: line.materialType,
                      defaultGauge: line.gauge,
                      defaultColour: line.colour,
                      defaultColourSide: line.colourSide as any,
                      defaultQuantity: line.quantity,
                      defaultLengthMm: line.lengthMm,
                      notes: line.manufacturingNotes,
                    });
                  }}
                >
                  <Copy className="h-4 w-4 mr-1.5" />
                  Save as Template
                </Button>
                <Button type="button" onClick={submitLine} disabled={saveLine.isPending}>
                  {saveLine.isPending ? <Spinner className="h-4 w-4 mr-1.5" /> : <Save className="h-4 w-4 mr-1.5" />}
                  {line.id ? "Update Line" : "Add Line"}
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Order Lines</CardTitle>
            </CardHeader>
            <CardContent>
              {lines.length === 0 ? (
                <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
                  No flashing profiles added yet.
                </div>
              ) : (
                <div className="overflow-x-auto rounded-md border">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50 text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2 text-left">Profile</th>
                        <th className="px-3 py-2 text-left">Material</th>
                        <th className="px-3 py-2 text-right">Qty</th>
                        <th className="px-3 py-2 text-right">Length</th>
                        <th className="px-3 py-2 text-right">Girth</th>
                        <th className="px-3 py-2 text-right">Folds</th>
                        <th className="px-3 py-2 text-right">Total</th>
                        <th className="px-3 py-2" />
                      </tr>
                    </thead>
                    <tbody>
                      {lines.map((existing: any) => {
                        const existingGeometry = cloneGeometry(existing.geometry);
                        const existingFoldCount = Number(existing.bendCount ?? getFoldCount(existingGeometry.points));
                        const existingCrushFoldCount = countCrushFolds(existing.foldDetails, existingGeometry.points);
                        return (
                          <tr key={existing.id} className="border-t">
                            <td className="px-3 py-2">
                              <div className="font-medium">{existing.profileName}</div>
                              <div className="text-xs text-muted-foreground">{existing.category}</div>
                            </td>
                            <td className="px-3 py-2">
                              <div>{existing.materialType}</div>
                              <div className="text-xs text-muted-foreground">{existing.colour || "No colour"} - {existing.gauge || "No gauge"}</div>
                            </td>
                            <td className="px-3 py-2 text-right">{existing.quantity}</td>
                            <td className="px-3 py-2 text-right">{Number(existing.lengthMm || 0).toFixed(0)} mm</td>
                            <td className="px-3 py-2 text-right">{Number(existing.girthMm || 0).toFixed(0)} mm</td>
                            <td className="px-3 py-2 text-right">
                              <div>{existingFoldCount}</div>
                              {existingCrushFoldCount > 0 && <div className="text-xs text-muted-foreground">{existingCrushFoldCount} crush</div>}
                            </td>
                            <td className="px-3 py-2 text-right font-semibold">{formatCurrency(existing.lineTotal)}</td>
                            <td className="px-3 py-2 text-right">
                              <Button variant="ghost" size="sm" onClick={() => editLine(existing)}>Edit</Button>
                              <Button variant="ghost" size="icon" onClick={() => deleteLine.mutate({ id: existing.id, orderId: order.id })}>
                                <Trash2 className="h-4 w-4 text-red-600" />
                              </Button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Order Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1">
                <label className="text-sm font-medium">Supplier</label>
                <Input value={orderDraft.supplierName} onChange={(event) => setOrderDraft({ ...orderDraft, supplierName: event.target.value })} placeholder="Supplier / manufacturer" />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">Requested Delivery</label>
                <Input type="date" value={orderDraft.requestedDeliveryAt} onChange={(event) => setOrderDraft({ ...orderDraft, requestedDeliveryAt: event.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-sm font-medium">Delivery Method</label>
                  <select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={orderDraft.deliveryMethod} onChange={(event) => setOrderDraft({ ...orderDraft, deliveryMethod: event.target.value })}>
                    <option value="pickup">Pickup</option>
                    <option value="delivery">Delivery</option>
                    <option value="site_delivery">Site delivery</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium">Priority</label>
                  <select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={orderDraft.priority} onChange={(event) => setOrderDraft({ ...orderDraft, priority: event.target.value })}>
                    <option value="low">Low</option>
                    <option value="normal">Normal</option>
                    <option value="high">High</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </div>
              </div>
              <Textarea value={orderDraft.siteNotes} onChange={(event) => setOrderDraft({ ...orderDraft, siteNotes: event.target.value })} placeholder="Site / delivery notes" />
              <Textarea value={orderDraft.internalNotes} onChange={(event) => setOrderDraft({ ...orderDraft, internalNotes: event.target.value })} placeholder="Internal notes" />
              <Button className="w-full" onClick={saveOrderDetails} disabled={updateOrder.isPending}>
                {updateOrder.isPending ? <Spinner className="h-4 w-4 mr-1.5" /> : <Save className="h-4 w-4 mr-1.5" />}
                Save Details
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Profile Templates</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 max-h-[360px] overflow-auto">
              {templates.length === 0 ? (
                <p className="text-sm text-muted-foreground">Saved profiles will appear here.</p>
              ) : templates.map((template: any) => (
                <button
                  key={template.id}
                  type="button"
                  onClick={() => loadTemplate(template)}
                  className="w-full rounded-md border p-3 text-left hover:bg-muted/40"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{template.name}</span>
                    <Badge variant="outline">{template.category || "custom"}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {template.defaultMaterialType || "Material not set"} - {Number(template.defaultLengthMm || 0).toFixed(0)} mm
                  </p>
                </button>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Status Timeline</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {history.map((item: any) => (
                <div key={item.id} className="border-l-2 border-muted pl-3">
                  <p className="text-sm font-medium">{STATUS_LABELS[item.toStatus] || item.toStatus}</p>
                  <p className="text-xs text-muted-foreground">{formatDateTime(item.createdAt)} by {item.changedByName || "System"}</p>
                  {item.notes && <p className="text-xs mt-1">{item.notes}</p>}
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
