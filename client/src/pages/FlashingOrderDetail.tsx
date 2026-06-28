import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useParams } from "wouter";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FlashingProfile3DPreview } from "@/components/flashing/FlashingProfile3DPreview";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import {
  Archive,
  ArrowLeft,
  Camera,
  Copy,
  Download,
  ExternalLink,
  FlipHorizontal,
  Image as ImageIcon,
  Pencil,
  Plus,
  RotateCcw,
  Save,
  Trash2,
  Undo2,
  Upload,
  X,
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
  segmentAngles?: Record<string, number>;
  foldAngles?: Record<string, number>;
  foldTypes?: Record<string, string>;
  foldNotes?: Record<string, string>;
  endTreatments?: Record<string, string>;
  endTreatmentLengths?: Record<string, number>;
  endTreatmentNotes?: Record<string, string>;
};

type FlashingLineDraft = {
  id?: number;
  templateId?: number | null;
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

type TemplateEditForm = {
  name: string;
  category: string;
  defaultMaterialType: string;
  defaultGauge: string;
  defaultColour: string;
  defaultColourSide: string;
  defaultQuantity: string;
  defaultLengthMm: string;
  notes: string;
  tags: string;
};

type WorkflowSectionKey = "overview" | "design" | "lines" | "photo" | "templates" | "timeline";

type FlashingAttachment = {
  type?: string;
  url?: string;
  key?: string;
  fileName?: string;
  mimeType?: string;
  uploadedAt?: string;
  uploadedByName?: string;
};

type FlashingOrderDetailProps = {
  portalMode?: boolean;
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
type EndTreatmentAnnotation = {
  key: EndTreatmentKey;
  label: string;
  origin: Point;
  path: string;
  pathPoints: [Point, Point, Point];
  labelPoint: Point;
  textAnchor: "start" | "end";
};

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
  segmentAngles: {},
  foldAngles: {},
  foldTypes: {},
  foldNotes: {},
  endTreatments: {},
  endTreatmentLengths: {},
  endTreatmentNotes: {},
};

const DEFAULT_LINE: FlashingLineDraft = {
  id: undefined as number | undefined,
  templateId: null,
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

const DEFAULT_TEMPLATE_FORM: TemplateEditForm = {
  name: "",
  category: "custom",
  defaultMaterialType: "Colorbond",
  defaultGauge: "0.55 BMT",
  defaultColour: "",
  defaultColourSide: "outside",
  defaultQuantity: "1",
  defaultLengthMm: "6500",
  notes: "",
  tags: "",
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

function getSubjectAreaPhoto(attachments: unknown): FlashingAttachment | null {
  if (!Array.isArray(attachments)) return null;
  const photo = attachments.find((attachment: any) => (
    attachment
    && typeof attachment === "object"
    && attachment.type === "subject_area_photo"
    && typeof attachment.url === "string"
    && attachment.url
  ));
  return photo || null;
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

function normaliseAngle(value: unknown, fallback = 0) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return ((number % 360) + 360) % 360;
}

function angleBetween(from: Point, to: Point) {
  return normaliseAngle((Math.atan2(to.y - from.y, to.x - from.x) * 180) / Math.PI);
}

function angleDistance(a: number, b: number) {
  const delta = Math.abs(normaliseAngle(a) - normaliseAngle(b));
  return Math.min(delta, 360 - delta);
}

function signedAngleDelta(from: number, to: number) {
  return ((normaliseAngle(to) - normaliseAngle(from) + 540) % 360) - 180;
}

function rotatePoint(point: Point, pivot: Point, degrees: number) {
  const radians = (degrees * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const dx = point.x - pivot.x;
  const dy = point.y - pivot.y;
  return {
    x: round(pivot.x + dx * cos - dy * sin),
    y: round(pivot.y + dx * sin + dy * cos),
  };
}

function straightenToAxis(origin: Point, point: Point) {
  const dx = point.x - origin.x;
  const dy = point.y - origin.y;
  if (Math.abs(dx) >= Math.abs(dy)) {
    return { x: point.x, y: origin.y };
  }
  return { x: origin.x, y: point.y };
}

function parseAngleNote(value?: string) {
  const match = String(value || "").match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  return normaliseAngle(Number(match[0]));
}

function getSegmentAngle(details: FoldDetails, geometry: Geometry, index: number) {
  const key = segmentKey(index);
  const stored = details.segmentAngles?.[key];
  if (Number.isFinite(stored)) return normaliseAngle(stored);
  const start = geometry.points[index];
  const end = geometry.points[index + 1];
  return start && end ? angleBetween(start, end) : 0;
}

function getFoldAngle(details: FoldDetails, pointIndex: number) {
  const key = foldKey(pointIndex);
  const stored = details.foldAngles?.[key];
  if (Number.isFinite(stored)) return normaliseAngle(stored);
  return parseAngleNote(details.foldNotes?.[key]) ?? 90;
}

function updateGeometrySegmentAngle(geometry: Geometry, segmentIndex: number, nextAngle: number, nextLength?: number) {
  const start = geometry.points[segmentIndex];
  const end = geometry.points[segmentIndex + 1];
  if (!start || !end) return geometry;
  const length = Number.isFinite(nextLength) && Number(nextLength) > 0 ? Number(nextLength) : distance(start, end);
  if (!Number.isFinite(length) || length <= 0) return geometry;

  const radians = (normaliseAngle(nextAngle) * Math.PI) / 180;
  const targetEnd = {
    x: round(start.x + Math.cos(radians) * length),
    y: round(start.y + Math.sin(radians) * length),
  };
  const delta = { x: targetEnd.x - end.x, y: targetEnd.y - end.y };
  return {
    ...geometry,
    points: geometry.points.map((point, index) => {
      if (index <= segmentIndex) return point;
      if (index === segmentIndex + 1) return targetEnd;
      return { x: round(point.x + delta.x), y: round(point.y + delta.y) };
    }),
  };
}

function updateGeometryFoldAngle(geometry: Geometry, pointIndex: number, nextAngle: number) {
  const previous = geometry.points[pointIndex - 1];
  const pivot = geometry.points[pointIndex];
  const next = geometry.points[pointIndex + 1];
  if (!previous || !pivot || !next) return geometry;

  const incomingAngle = angleBetween(previous, pivot);
  const currentOutgoingAngle = angleBetween(pivot, next);
  const internalAngle = clamp(normaliseAngle(nextAngle), 0, 180);
  const clockwiseTarget = normaliseAngle(incomingAngle + 180 - internalAngle);
  const counterTarget = normaliseAngle(incomingAngle + 180 + internalAngle);
  const targetAngle = angleDistance(currentOutgoingAngle, clockwiseTarget) <= angleDistance(currentOutgoingAngle, counterTarget)
    ? clockwiseTarget
    : counterTarget;
  const delta = signedAngleDelta(currentOutgoingAngle, targetAngle);
  if (Math.abs(delta) < 0.001) return geometry;

  return {
    ...geometry,
    points: geometry.points.map((point, index) => (
      index > pointIndex ? rotatePoint(point, pivot, delta) : point
    )),
  };
}

function segmentKey(index: number) {
  return `segment-${index + 1}`;
}

function foldKey(pointIndex: number) {
  return `fold-${pointIndex}`;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function unitVector(from: Point, to: Point) {
  const length = distance(from, to);
  if (length <= 0) return { x: 1, y: 0 };
  return {
    x: (to.x - from.x) / length,
    y: (to.y - from.y) / length,
  };
}

function scaledPoint(origin: Point, vector: Point, length: number) {
  return {
    x: origin.x + vector.x * length,
    y: origin.y + vector.y * length,
  };
}

function canvasSafePoint(point: Point, padding = 12) {
  return {
    x: clamp(point.x, padding, CANVAS_W - padding),
    y: clamp(point.y, padding, CANVAS_H - padding),
  };
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
    segmentAngles: Object.fromEntries(
      Object.entries(value?.segmentAngles || {})
        .map(([key, angle]) => [key, normaliseAngle(angle)])
        .filter(([, angle]) => Number.isFinite(angle)),
    ),
    foldAngles: Object.fromEntries(
      Object.entries(value?.foldAngles || {})
        .map(([key, angle]) => [key, clamp(normaliseAngle(angle), 0, 180)])
        .filter(([, angle]) => Number.isFinite(angle)),
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
  const nextSegmentAngles: Record<string, number> = {};
  const nextFoldAngles: Record<string, number> = {};
  const nextFoldTypes: Record<string, string> = {};
  const nextFoldNotes: Record<string, string> = {};
  const nextEndTreatments: Record<string, string> = {};
  const nextEndTreatmentLengths: Record<string, number> = {};
  const nextEndTreatmentNotes: Record<string, string> = {};

  for (let index = 0; index < segmentCount; index += 1) {
    const key = segmentKey(index);
    if (details.segmentLengths?.[key] !== undefined) nextSegmentLengths[key] = details.segmentLengths[key];
    if (details.segmentAngles?.[key] !== undefined) nextSegmentAngles[key] = details.segmentAngles[key];
  }
  for (let index = 1; index <= foldCount; index += 1) {
    const key = foldKey(index);
    if (details.foldAngles?.[key] !== undefined) nextFoldAngles[key] = details.foldAngles[key];
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
    segmentAngles: nextSegmentAngles,
    foldAngles: nextFoldAngles,
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

function treatmentLabel(value: string) {
  return END_TREATMENT_OPTIONS.find((option) => option.value === value)?.label || value;
}

function buildEndTreatmentAnnotation(geometry: Geometry, foldDetails: any, key: EndTreatmentKey): EndTreatmentAnnotation | null {
  const details = normaliseFoldDetails(foldDetails);
  const treatment = details.endTreatments?.[key];
  if (!treatment || treatment === "none" || geometry.points.length < 2) return null;

  const startIndex = key === "start" ? 0 : geometry.points.length - 1;
  const adjacentIndex = key === "start" ? 1 : geometry.points.length - 2;
  const origin = geometry.points[startIndex];
  const adjacent = geometry.points[adjacentIndex];
  const outward = unitVector(adjacent, origin);
  const normalA = { x: -outward.y, y: outward.x };
  const turnDown = normalA.y >= 0 ? normalA : { x: -normalA.x, y: -normalA.y };
  const rawLength = Number(details.endTreatmentLengths?.[key] ?? 0);
  const labelLength = Number.isFinite(rawLength) && rawLength > 0 ? `${Math.round(rawLength)} mm` : "";
  const displayLength = clamp(Number.isFinite(rawLength) && rawLength > 0 ? rawLength : 28, 18, 70);

  const introPoint = treatment === "beak_turn_down"
    ? scaledPoint(origin, outward, displayLength * 0.35)
    : scaledPoint(origin, outward, displayLength * 0.75);
  const endPoint = treatment === "beak_turn_down"
    ? scaledPoint(introPoint, turnDown, displayLength)
    : treatment === "hook"
      ? scaledPoint(introPoint, turnDown, clamp(displayLength * 0.55, 10, 22))
      : scaledPoint(origin, outward, displayLength);

  const labelPoint = canvasSafePoint({
    x: (introPoint.x + endPoint.x) / 2 + (key === "start" ? -8 : 8),
    y: Math.min(introPoint.y, endPoint.y) - 12,
  }, 18);

  const label = [treatmentLabel(treatment), labelLength].filter(Boolean).join(" ");
  return {
    key,
    label,
    origin,
    path: `M ${origin.x} ${origin.y} L ${introPoint.x} ${introPoint.y} L ${endPoint.x} ${endPoint.y}`,
    pathPoints: [origin, introPoint, endPoint],
    labelPoint,
    textAnchor: key === "start" ? "end" as const : "start" as const,
  };
}

function safeFileName(value: string) {
  return value
    .replace(/[^a-z0-9._-]+/gi, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80) || "flashing-order";
}

function formatPdfNumber(value: unknown, decimals = 0) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "-";
  return number.toLocaleString("en-AU", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function foldTypeLabel(value?: string) {
  if (!value || value === "standard") return "Standard fold";
  return FOLD_TYPE_OPTIONS.find((option) => option.value === value)?.label || value;
}

function getLineTotalLm(existing: any) {
  const storedTotal = Number(existing.totalLinealMetres);
  if (Number.isFinite(storedTotal) && storedTotal > 0) return storedTotal;
  return round((Number(existing.lengthMm || 0) * Number(existing.quantity || 1)) / 1000);
}

function getLineTotalPrice(existing: any) {
  const storedTotal = Number(existing.lineTotal);
  if (Number.isFinite(storedTotal)) return storedTotal;
  return round(getLineTotalLm(existing) * Number(existing.unitPrice || 0));
}

function addWrappedPdfText(doc: any, text: string, x: number, y: number, maxWidth: number, lineHeight = 4) {
  const lines = doc.splitTextToSize(text || "-", maxWidth);
  lines.forEach((line: string, index: number) => doc.text(line, x, y + index * lineHeight));
  return y + lines.length * lineHeight;
}

function drawProfilePdf(doc: any, geometry: Geometry, foldDetails: FoldDetails, x: number, y: number, width: number, height: number) {
  doc.setDrawColor(226, 232, 240);
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(x, y, width, height, 2, 2, "FD");

  if (geometry.points.length < 2) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    doc.text("No profile geometry recorded.", x + 6, y + 12);
    return;
  }

  const annotations = END_TREATMENT_KEYS
    .map((key) => buildEndTreatmentAnnotation(geometry, foldDetails, key))
    .filter(Boolean) as EndTreatmentAnnotation[];
  const drawingPoints = [
    ...geometry.points,
    ...annotations.flatMap((annotation) => [...annotation.pathPoints, annotation.labelPoint]),
  ];
  const minX = Math.min(...drawingPoints.map((point) => point.x));
  const maxX = Math.max(...drawingPoints.map((point) => point.x));
  const minY = Math.min(...drawingPoints.map((point) => point.y));
  const maxY = Math.max(...drawingPoints.map((point) => point.y));
  const sourceWidth = Math.max(1, maxX - minX);
  const sourceHeight = Math.max(1, maxY - minY);
  const padding = 7;
  const usableWidth = width - padding * 2;
  const usableHeight = height - padding * 2;
  const scale = Math.min(usableWidth / sourceWidth, usableHeight / sourceHeight);
  const drawnWidth = sourceWidth * scale;
  const drawnHeight = sourceHeight * scale;
  const offsetX = x + padding + (usableWidth - drawnWidth) / 2;
  const offsetY = y + padding + (usableHeight - drawnHeight) / 2;
  const mapPoint = (point: Point) => ({
    x: offsetX + (point.x - minX) * scale,
    y: offsetY + (point.y - minY) * scale,
  });

  const gridSize = geometry.gridSize || 20;
  doc.setDrawColor(235, 241, 245);
  doc.setLineWidth(0.08);
  for (let gx = Math.ceil(minX / gridSize) * gridSize; gx <= maxX; gx += gridSize) {
    const start = mapPoint({ x: gx, y: minY });
    const end = mapPoint({ x: gx, y: maxY });
    doc.line(start.x, start.y, end.x, end.y);
  }
  for (let gy = Math.ceil(minY / gridSize) * gridSize; gy <= maxY; gy += gridSize) {
    const start = mapPoint({ x: minX, y: gy });
    const end = mapPoint({ x: maxX, y: gy });
    doc.line(start.x, start.y, end.x, end.y);
  }

  doc.setDrawColor(15, 23, 42);
  doc.setLineWidth(0.9);
  geometry.points.slice(1).forEach((point, index) => {
    const from = mapPoint(geometry.points[index]);
    const to = mapPoint(point);
    doc.line(from.x, from.y, to.x, to.y);
  });

  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.setTextColor(15, 23, 42);
  const details = normaliseFoldDetails(foldDetails);
  geometry.points.slice(1).forEach((point, index) => {
    const previous = geometry.points[index];
    const mid = mapPoint({ x: (previous.x + point.x) / 2, y: (previous.y + point.y) / 2 });
    doc.text(`${Math.round(distance(previous, point))} mm @ ${Math.round(getSegmentAngle(details, geometry, index))}°`, mid.x + 1.5, mid.y - 1.5);
  });
  geometry.points.slice(1, -1).forEach((point, index) => {
    const mapped = mapPoint(point);
    const pointIndex = index + 1;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(146, 64, 14);
    doc.text(`${Math.round(getFoldAngle(details, pointIndex))}°`, mapped.x + 3, mapped.y + 5);
  });

  annotations.forEach((annotation) => {
    const [origin, introPoint, endPoint] = annotation.pathPoints.map(mapPoint);
    const labelPoint = mapPoint(annotation.labelPoint);
    doc.setDrawColor(245, 158, 11);
    doc.setLineWidth(0.8);
    doc.circle(origin.x, origin.y, 2.2);
    doc.line(origin.x, origin.y, introPoint.x, introPoint.y);
    doc.line(introPoint.x, introPoint.y, endPoint.x, endPoint.y);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(146, 64, 14);
    doc.text(annotation.label, labelPoint.x, labelPoint.y, { align: annotation.textAnchor });
  });

  geometry.points.forEach((point, index) => {
    const mapped = mapPoint(point);
    doc.setFillColor(index === 0 ? 201 : 239, index === 0 ? 171 : 68, index === 0 ? 87 : 68);
    doc.setDrawColor(255, 255, 255);
    doc.circle(mapped.x, mapped.y, 2.2, "FD");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6);
    doc.setTextColor(71, 85, 105);
    doc.text(String(index + 1), mapped.x + 2.6, mapped.y + 1.6);
  });
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

function ProfileDesigner({
  geometry,
  foldDetails,
  onChange,
}: {
  geometry: Geometry;
  foldDetails: FoldDetails;
  onChange: (geometry: Geometry) => void;
}) {
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
    const currentPoint = geometry.points[index];
    if (!currentPoint) return;

    if (index === 0) {
      const delta = { x: point.x - currentPoint.x, y: point.y - currentPoint.y };
      onChange({
        ...geometry,
        points: geometry.points.map((existing) => ({ x: round(existing.x + delta.x), y: round(existing.y + delta.y) })),
      });
      return;
    }

    const previous = geometry.points[index - 1];
    const nextPoint = straightenToAxis(previous, point);
    const delta = { x: nextPoint.x - currentPoint.x, y: nextPoint.y - currentPoint.y };
    onChange({
      ...geometry,
      points: geometry.points.map((existing, i) => {
        if (i < index) return existing;
        if (i === index) return nextPoint;
        return { x: round(existing.x + delta.x), y: round(existing.y + delta.y) };
      }),
    });
  };

  const addPoint = (event: React.PointerEvent<SVGSVGElement>) => {
    if (dragIndex !== null) return;
    if (event.target !== svgRef.current) return;
    const rawPoint = localPoint(event);
    const previous = geometry.points[geometry.points.length - 1];
    const nextPoint = previous
      ? straightenToAxis(previous, rawPoint)
      : rawPoint;
    const point = previous && distance(previous, nextPoint) < gridSize
      ? { x: previous.x + gridSize * 4, y: previous.y }
      : nextPoint;
    onChange({ ...geometry, points: [...geometry.points, point] });
  };

  const gridLines = [];
  for (let x = 0; x <= CANVAS_W; x += gridSize) gridLines.push(<line key={`x-${x}`} x1={x} y1={0} x2={x} y2={CANVAS_H} />);
  for (let y = 0; y <= CANVAS_H; y += gridSize) gridLines.push(<line key={`y-${y}`} x1={0} y1={y} x2={CANVAS_W} y2={y} />);

  const polyline = geometry.points.map((point) => `${point.x},${point.y}`).join(" ");
  const girth = calculateGirth(geometry.points);
  const foldCount = getFoldCount(geometry.points);
  const endTreatmentAnnotations = END_TREATMENT_KEYS
    .map((key) => buildEndTreatmentAnnotation(geometry, foldDetails, key))
    .filter(Boolean);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold">Grid Profile Designer</p>
          <p className="text-xs text-muted-foreground">Tap to add points. Lines default to straight 0/90 degree runs; use the table below for precise angle changes.</p>
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
          {endTreatmentAnnotations.map((annotation) => annotation && (
            <g key={`end-treatment-${annotation.key}`} pointerEvents="none">
              <circle
                cx={annotation.origin.x}
                cy={annotation.origin.y}
                r="14"
                fill="none"
                stroke="#F59E0B"
                strokeWidth="2"
                strokeDasharray="4 3"
              />
              <path
                d={annotation.path}
                fill="none"
                stroke="#FBBF24"
                strokeWidth="4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d={annotation.path}
                fill="none"
                stroke="#0F172A"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <text
                x={annotation.labelPoint.x}
                y={annotation.labelPoint.y}
                fill="#FDE68A"
                fontSize="13"
                fontWeight="700"
                textAnchor={annotation.textAnchor}
              >
                {annotation.label}
              </text>
            </g>
          ))}
          {geometry.points.slice(1).map((point, index) => {
            const previous = geometry.points[index];
            const midX = (previous.x + point.x) / 2;
            const midY = (previous.y + point.y) / 2;
            const details = normaliseFoldDetails(foldDetails);
            const segmentAngle = Math.round(getSegmentAngle(details, geometry, index));
            return (
              <text key={`label-${index}`} x={midX + 8} y={midY - 8} fill="#F8FAFC" fontSize="13" fontWeight="600">
                {Math.round(distance(previous, point))} mm @ {segmentAngle}°
              </text>
            );
          })}
          {geometry.points.slice(1, -1).map((point, index) => {
            const pointIndex = index + 1;
            const details = normaliseFoldDetails(foldDetails);
            const foldAngle = Math.round(getFoldAngle(details, pointIndex));
            return (
              <text
                key={`fold-angle-${pointIndex}`}
                x={point.x + 12}
                y={point.y + 22}
                fill="#FDE68A"
                fontSize="13"
                fontWeight="700"
              >
                {foldAngle}°
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
    const angle = getSegmentAngle(details, geometry, index);
    const nextDetails = {
      ...details,
      segmentLengths: { ...(details.segmentLengths || {}), [key]: nextLength },
    };
    onFoldDetailsChange(nextDetails);
    onGeometryChange(updateGeometrySegmentAngle(geometry, index, angle, nextLength));
  };

  const updateSegmentAngle = (index: number, rawValue: string) => {
    const nextAngle = Number(rawValue);
    if (!Number.isFinite(nextAngle)) return;
    const key = segmentKey(index);
    const length = details.segmentLengths?.[key] ?? distance(geometry.points[index], geometry.points[index + 1]);
    const cleanAngle = normaliseAngle(nextAngle);
    const nextDetails = {
      ...details,
      segmentAngles: { ...(details.segmentAngles || {}), [key]: cleanAngle },
    };
    onFoldDetailsChange(nextDetails);
    onGeometryChange(updateGeometrySegmentAngle(geometry, index, cleanAngle, length));
  };

  const updateFoldAngle = (pointIndex: number, rawValue: string) => {
    const nextAngle = Number(rawValue);
    if (!Number.isFinite(nextAngle)) return;
    const key = foldKey(pointIndex);
    const cleanAngle = clamp(normaliseAngle(nextAngle), 0, 180);
    const nextDetails = {
      ...details,
      foldAngles: { ...(details.foldAngles || {}), [key]: cleanAngle },
    };
    onFoldDetailsChange(nextDetails);
    onGeometryChange(updateGeometryFoldAngle(geometry, pointIndex, cleanAngle));
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
      <div className="space-y-3 p-3 md:hidden">
        {segments.map((segment) => {
          const key = segmentKey(segment.index);
          const segmentAngle = getSegmentAngle(details, geometry, segment.index);
          return (
            <div key={`mobile-${key}`} className="rounded-md border bg-background p-3">
              <div className="mb-3 flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold">Segment {segment.index + 1}</p>
                  <p className="text-xs text-muted-foreground">Point {segment.index + 1} to {segment.index + 2}</p>
                </div>
                <Badge variant="outline">Run</Badge>
              </div>
              <div className="grid grid-cols-1 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Dimension</label>
                  <div className="flex items-center gap-2">
                    <Input
                      key={`${key}-mobile-${Math.round(segment.length)}`}
                      type="number"
                      min={1}
                      defaultValue={Math.round(details.segmentLengths?.[key] ?? segment.length)}
                      onBlur={(event) => updateSegmentLength(segment.index, event.target.value)}
                      className="h-10 text-right"
                    />
                    <span className="text-xs text-muted-foreground">mm</span>
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Angle</label>
                  <div className="flex items-center gap-2">
                    <Input
                      key={`${key}-mobile-angle-${Math.round(segmentAngle)}`}
                      type="number"
                      min={0}
                      max={359}
                      defaultValue={Math.round(segmentAngle)}
                      onBlur={(event) => updateSegmentAngle(segment.index, event.target.value)}
                      className="h-10 text-right"
                    />
                    <span className="text-xs text-muted-foreground">deg</span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}

        {folds.map((fold) => {
          const key = foldKey(fold.pointIndex);
          const foldAngle = getFoldAngle(details, fold.pointIndex);
          return (
            <div key={`mobile-${key}`} className="rounded-md border bg-muted/10 p-3">
              <div className="mb-3 flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold">Fold {fold.foldNumber}</p>
                  <p className="text-xs text-muted-foreground">Point {fold.pointIndex + 1} - {Math.round(fold.point.x)}, {Math.round(fold.point.y)}</p>
                </div>
                <Badge variant="outline">Fold</Badge>
              </div>
              <div className="grid grid-cols-1 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Angle</label>
                  <div className="flex items-center gap-2">
                    <Input
                      key={`${key}-mobile-angle-${Math.round(foldAngle)}`}
                      type="number"
                      min={0}
                      max={180}
                      defaultValue={Math.round(foldAngle)}
                      onBlur={(event) => updateFoldAngle(fold.pointIndex, event.target.value)}
                      className="h-10 text-right"
                    />
                    <span className="text-xs text-muted-foreground">deg</span>
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Fold Type</label>
                  <select
                    className="h-10 w-full rounded-md border border-input bg-background px-2 text-sm"
                    value={details.foldTypes?.[key] || "standard"}
                    onChange={(event) => updateFoldType(fold.pointIndex, event.target.value)}
                  >
                    {FOLD_TYPE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Notes</label>
                  <Input
                    value={details.foldNotes?.[key] || ""}
                    onChange={(event) => updateFoldNote(fold.pointIndex, event.target.value)}
                    placeholder="Optional fold note"
                    className="h-10"
                  />
                </div>
              </div>
            </div>
          );
        })}

        {endTreatmentRows.map((endTreatment) => (
          <div key={`mobile-${endTreatment.key}`} className="rounded-md border bg-amber-50/40 p-3">
            <div className="mb-3 flex items-start justify-between gap-2">
              <div>
                <p className="text-sm font-semibold">{endTreatment.label}</p>
                <p className="text-xs text-muted-foreground">{endTreatment.pointLabel}</p>
              </div>
              <Badge variant="outline">End</Badge>
            </div>
            <div className="grid grid-cols-1 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Treatment Type</label>
                <select
                  className="h-10 w-full rounded-md border border-input bg-background px-2 text-sm"
                  value={details.endTreatments?.[endTreatment.key] || "none"}
                  onChange={(event) => updateEndTreatment(endTreatment.key, event.target.value)}
                >
                  {END_TREATMENT_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Length</label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min={0}
                    value={details.endTreatmentLengths?.[endTreatment.key] ?? ""}
                    onChange={(event) => updateEndTreatmentLength(endTreatment.key, event.target.value)}
                    placeholder={endTreatment.placeholder}
                    className="h-10 text-right"
                  />
                  <span className="text-xs text-muted-foreground">mm</span>
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Notes</label>
                <Input
                  value={details.endTreatmentNotes?.[endTreatment.key] || ""}
                  onChange={(event) => updateEndTreatmentNote(endTreatment.key, event.target.value)}
                  placeholder="Optional end treatment note"
                  className="h-10"
                />
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="bg-muted/40 text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left">Item</th>
              <th className="px-3 py-2 text-left">Point / Segment</th>
              <th className="px-3 py-2 text-right">Dimension</th>
              <th className="px-3 py-2 text-right">Angle</th>
              <th className="px-3 py-2 text-left">Fold / Treatment Type</th>
              <th className="px-3 py-2 text-left">Notes</th>
            </tr>
          </thead>
          <tbody>
            {segments.map((segment) => {
              const key = segmentKey(segment.index);
              const segmentAngle = getSegmentAngle(details, geometry, segment.index);
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
                  <td className="px-3 py-2">
                    <div className="flex items-center justify-end gap-2">
                      <Input
                        key={`${key}-angle-${Math.round(segmentAngle)}`}
                        type="number"
                        min={0}
                        max={359}
                        defaultValue={Math.round(segmentAngle)}
                        onBlur={(event) => updateSegmentAngle(segment.index, event.target.value)}
                        className="h-9 w-24 text-right"
                      />
                      <span className="text-xs text-muted-foreground">deg</span>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">-</td>
                  <td className="px-3 py-2 text-muted-foreground">Straight run angle for manufacture</td>
                </tr>
              );
            })}
            {folds.map((fold) => {
              const key = foldKey(fold.pointIndex);
              const foldAngle = getFoldAngle(details, fold.pointIndex);
              return (
                <tr key={key} className="border-t bg-muted/10">
                  <td className="px-3 py-2 font-medium">Fold {fold.foldNumber}</td>
                  <td className="px-3 py-2 text-muted-foreground">Point {fold.pointIndex + 1}</td>
                  <td className="px-3 py-2 text-right text-muted-foreground">
                    {Math.round(fold.point.x)}, {Math.round(fold.point.y)}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center justify-end gap-2">
                      <Input
                        key={`${key}-angle-${Math.round(foldAngle)}`}
                        type="number"
                        min={0}
                        max={180}
                        defaultValue={Math.round(foldAngle)}
                        onBlur={(event) => updateFoldAngle(fold.pointIndex, event.target.value)}
                        className="h-9 w-24 text-right"
                      />
                      <span className="text-xs text-muted-foreground">deg</span>
                    </div>
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
                <td className="px-3 py-2 text-right text-muted-foreground">-</td>
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

export default function FlashingOrderDetail(props: FlashingOrderDetailProps | any = {}) {
  const portalMode = Boolean(props?.portalMode);
  const params = useParams<{ id: string }>();
  const orderId = Number(params.id);
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();
  const orderBasePath = portalMode ? "/trade-portal/flashing-orders" : "/construction/flashing-orders";
  const adminDetailQuery = trpc.flashing.getOrder.useQuery({ id: orderId }, { enabled: !portalMode && Number.isFinite(orderId) });
  const portalDetailQuery = trpc.tradePortal.getFlashingOrder.useQuery({ id: orderId }, { enabled: portalMode && Number.isFinite(orderId) });
  const detailQuery = portalMode ? portalDetailQuery : adminDetailQuery;

  const invalidateOrder = () => {
    if (portalMode) {
      utils.tradePortal.getFlashingOrder.invalidate({ id: orderId });
      utils.tradePortal.listFlashingOrders.invalidate();
    } else {
      utils.flashing.getOrder.invalidate({ id: orderId });
      utils.flashing.listOrders.invalidate();
    }
  };

  const adminUpdateOrder = trpc.flashing.updateOrder.useMutation({
    onSuccess: () => {
      toast.success("Order details saved");
      invalidateOrder();
    },
    onError: (error) => toast.error(error.message),
  });
  const portalUpdateOrder = trpc.tradePortal.updateFlashingOrder.useMutation({
    onSuccess: () => {
      toast.success("Order details saved");
      invalidateOrder();
    },
    onError: (error) => toast.error(error.message),
  });
  const adminUploadSubjectPhoto = trpc.flashing.uploadSubjectPhoto.useMutation({
    onSuccess: () => {
      toast.success("Subject area photo uploaded");
      invalidateOrder();
    },
    onError: (error) => toast.error(error.message),
  });
  const portalUploadSubjectPhoto = trpc.tradePortal.uploadFlashingSubjectPhoto.useMutation({
    onSuccess: () => {
      toast.success("Subject area photo uploaded");
      invalidateOrder();
    },
    onError: (error) => toast.error(error.message),
  });
  const adminRemoveSubjectPhoto = trpc.flashing.removeSubjectPhoto.useMutation({
    onSuccess: () => {
      toast.success("Subject area photo removed");
      invalidateOrder();
    },
    onError: (error) => toast.error(error.message),
  });
  const portalRemoveSubjectPhoto = trpc.tradePortal.removeFlashingSubjectPhoto.useMutation({
    onSuccess: () => {
      toast.success("Subject area photo removed");
      invalidateOrder();
    },
    onError: (error) => toast.error(error.message),
  });
  const updateStatus = trpc.flashing.updateStatus.useMutation({
    onSuccess: () => {
      toast.success("Status updated");
      invalidateOrder();
    },
    onError: (error) => toast.error(error.message),
  });
  const submitForReview = trpc.tradePortal.submitFlashingOrderForReview.useMutation({
    onSuccess: () => {
      toast.success("Submitted for construction review");
      invalidateOrder();
    },
    onError: (error) => toast.error(error.message),
  });
  const adminSaveLine = trpc.flashing.saveLine.useMutation({
    onSuccess: () => {
      toast.success("Flashing line saved");
      setLine(DEFAULT_LINE);
      setActiveSection("lines");
      invalidateOrder();
    },
    onError: (error) => toast.error(error.message),
  });
  const portalSaveLine = trpc.tradePortal.saveFlashingLine.useMutation({
    onSuccess: () => {
      toast.success("Flashing line saved");
      setLine(DEFAULT_LINE);
      setActiveSection("lines");
      invalidateOrder();
    },
    onError: (error) => toast.error(error.message),
  });
  const adminDeleteLine = trpc.flashing.deleteLine.useMutation({
    onSuccess: () => {
      toast.success("Line deleted");
      invalidateOrder();
    },
    onError: (error) => toast.error(error.message),
  });
  const portalDeleteLine = trpc.tradePortal.deleteFlashingLine.useMutation({
    onSuccess: () => {
      toast.success("Line deleted");
      invalidateOrder();
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
  const updateTemplate = trpc.flashing.updateTemplate.useMutation({
    onSuccess: () => {
      toast.success("Template updated");
      setEditingTemplate(null);
      setTemplateForm(DEFAULT_TEMPLATE_FORM);
      utils.flashing.getOrder.invalidate({ id: orderId });
    },
    onError: (error) => toast.error(error.message),
  });
  const archiveTemplate = trpc.flashing.archiveTemplate.useMutation({
    onSuccess: () => {
      toast.success("Template archived");
      utils.flashing.getOrder.invalidate({ id: orderId });
    },
    onError: (error) => toast.error(error.message),
  });
  const duplicateTemplate = trpc.flashing.duplicateTemplate.useMutation({
    onSuccess: () => {
      toast.success("Template duplicated");
      utils.flashing.getOrder.invalidate({ id: orderId });
    },
    onError: (error) => toast.error(error.message),
  });
  const seedTemplates = trpc.flashing.seedStandardTemplates.useMutation({
    onSuccess: (result) => {
      toast.success(`Standard templates ready: ${result.created} added, ${result.updated} updated`);
      utils.flashing.getOrder.invalidate({ id: orderId });
    },
    onError: (error) => toast.error(error.message),
  });

  const order = detailQuery.data?.order;
  const lines = detailQuery.data?.lines || [];
  const templates = detailQuery.data?.templates || [];
  const history = detailQuery.data?.statusHistory || [];
  const isUpdatingOrder = adminUpdateOrder.isPending || portalUpdateOrder.isPending;
  const isUploadingSubjectPhoto = adminUploadSubjectPhoto.isPending || portalUploadSubjectPhoto.isPending;
  const isRemovingSubjectPhoto = adminRemoveSubjectPhoto.isPending || portalRemoveSubjectPhoto.isPending;
  const isSavingLine = adminSaveLine.isPending || portalSaveLine.isPending;
  const isDeletingLine = adminDeleteLine.isPending || portalDeleteLine.isPending;

  const [orderDraft, setOrderDraft] = useState({
    supplierName: "",
    requestedDeliveryAt: "",
    deliveryMethod: "pickup",
    priority: "normal",
    siteNotes: "",
    internalNotes: "",
  });
  const [line, setLine] = useState(DEFAULT_LINE);
  const [activeSection, setActiveSection] = useState<WorkflowSectionKey>("templates");
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<any | null>(null);
  const [templateForm, setTemplateForm] = useState<TemplateEditForm>(DEFAULT_TEMPLATE_FORM);
  const subjectPhotoInputRef = useRef<HTMLInputElement | null>(null);
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

  const templateColourOptions = useMemo(() => {
    if (!templateForm.defaultColour || colourbondColours.includes(templateForm.defaultColour)) return colourbondColours;
    return [templateForm.defaultColour, ...colourbondColours];
  }, [colourbondColours, templateForm.defaultColour]);

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

  const exportFlashingPdf = async () => {
    if (!order) return;
    if (lines.length === 0) {
      toast.error("Add at least one flashing line before exporting.");
      return;
    }

    setIsExportingPdf(true);
    try {
      const { jsPDF } = await import("jspdf");
      const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 14;
      const contentWidth = pageWidth - margin * 2;
      let y = 18;

      const addFooter = () => {
        const pageNumber = doc.getNumberOfPages();
        doc.setDrawColor(226, 232, 240);
        doc.line(margin, pageHeight - 12, pageWidth - margin, pageHeight - 12);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.setTextColor(100, 116, 139);
        doc.text(`Generated ${new Date().toLocaleDateString("en-AU")}`, margin, pageHeight - 7);
        doc.text(`Page ${pageNumber}`, pageWidth - margin, pageHeight - 7, { align: "right" });
      };

      const ensureSpace = (needed: number) => {
        if (y + needed <= pageHeight - 18) return;
        addFooter();
        doc.addPage();
        y = 18;
      };

      doc.setFillColor(15, 23, 42);
      doc.rect(0, 0, pageWidth, 26, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(16);
      doc.text("Flashing Order", margin, 14);
      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      doc.text(order.orderNumber, pageWidth - margin, 14, { align: "right" });
      y = 36;

      doc.setTextColor(15, 23, 42);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(13);
      doc.text(order.clientName || "Manual order", margin, y);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(71, 85, 105);
      y += 5;
      y = addWrappedPdfText(doc, order.siteAddress || "No site address recorded", margin, y, contentWidth * 0.62);
      y += 2;
      doc.text(`Job: ${order.jobNumber || "-"}`, margin, y);
      doc.text(`Status: ${STATUS_LABELS[order.status] || order.status}`, pageWidth - margin, y, { align: "right" });
      y += 10;

      const summaryCards = [
        ["Profiles", String(order.lineCount || lines.length)],
        ["Total LM", formatPdfNumber(order.totalLinealMetres, 2)],
        ["Total Girth", `${formatPdfNumber(order.totalGirthMm)} mm`],
        ["Folds", `${orderFoldCount}${orderCrushFoldCount > 0 ? ` (${orderCrushFoldCount} crush)` : ""}`],
      ];
      const cardGap = 3;
      const cardWidth = (contentWidth - cardGap * 3) / 4;
      summaryCards.forEach(([label, value], index) => {
        const cardX = margin + index * (cardWidth + cardGap);
        doc.setFillColor(248, 250, 252);
        doc.setDrawColor(226, 232, 240);
        doc.roundedRect(cardX, y, cardWidth, 18, 2, 2, "FD");
        doc.setFont("helvetica", "normal");
        doc.setFontSize(7);
        doc.setTextColor(100, 116, 139);
        doc.text(label, cardX + 3, y + 6);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(10);
        doc.setTextColor(15, 23, 42);
        doc.text(value, cardX + 3, y + 13);
      });
      y += 28;

      lines.forEach((existing: any, index: number) => {
        const geometry = cloneGeometry(existing.geometry);
        const foldDetails = normaliseFoldDetails(existing.foldDetails);
        const foldCount = Number(existing.bendCount ?? getFoldCount(geometry.points));
        const crushFoldCount = countCrushFolds(foldDetails, geometry.points);
        const totalLm = getLineTotalLm(existing);
        const totalPrice = getLineTotalPrice(existing);
        const drawingHeight = 78;
        ensureSpace(132);

        doc.setFont("helvetica", "bold");
        doc.setFontSize(12);
        doc.setTextColor(15, 23, 42);
        doc.text(`${index + 1}. ${existing.profileName || "Custom flashing"}`, margin, y);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.setTextColor(100, 116, 139);
        doc.text(existing.category || "custom", pageWidth - margin, y, { align: "right" });
        y += 5;

        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.setTextColor(71, 85, 105);
        const materialText = [
          existing.materialType || "Material not set",
          existing.gauge,
          existing.colour ? `Colour: ${existing.colour}` : "No colour",
          existing.finish ? `Finish: ${existing.finish}` : "",
        ].filter(Boolean).join(" | ");
        y = addWrappedPdfText(doc, materialText, margin, y, contentWidth);
        y += 2;

        const metricsText = [
          `Qty ${formatPdfNumber(existing.quantity)}`,
          `Length ${formatPdfNumber(existing.lengthMm)} mm`,
          `LM ${formatPdfNumber(totalLm, 2)}`,
          `Girth ${formatPdfNumber(existing.girthMm)} mm`,
          `Folds ${foldCount}`,
          crushFoldCount > 0 ? `Crush folds ${crushFoldCount}` : "",
          totalPrice > 0 ? `Total ${formatCurrency(totalPrice)}` : "",
        ].filter(Boolean).join(" | ");
        y = addWrappedPdfText(doc, metricsText, margin, y, contentWidth);
        y += 4;

        drawProfilePdf(doc, geometry, foldDetails, margin, y, contentWidth, drawingHeight);
        y += drawingHeight + 6;

        const rows: Array<[string, string, string, string, string]> = [];
        geometry.points.slice(1).forEach((point, segmentIndex) => {
          const key = segmentKey(segmentIndex);
          const length = foldDetails.segmentLengths?.[key] ?? distance(geometry.points[segmentIndex], point);
          rows.push([
            `Segment ${segmentIndex + 1}`,
            `Point ${segmentIndex + 1} to ${segmentIndex + 2}`,
            `${formatPdfNumber(length)} mm`,
            `${formatPdfNumber(getSegmentAngle(foldDetails, geometry, segmentIndex))}°`,
            "Manufacture length",
          ]);
        });
        geometry.points.slice(1, -1).forEach((point, foldIndex) => {
          const pointIndex = foldIndex + 1;
          const key = foldKey(pointIndex);
          rows.push([
            `Fold ${foldIndex + 1}`,
            `Point ${pointIndex + 1}`,
            foldTypeLabel(foldDetails.foldTypes?.[key]),
            `${formatPdfNumber(getFoldAngle(foldDetails, pointIndex))}°`,
            foldDetails.foldNotes?.[key] || "-",
          ]);
        });
        END_TREATMENT_KEYS.forEach((key) => {
          const treatment = foldDetails.endTreatments?.[key];
          if (!treatment || treatment === "none") return;
          rows.push([
            key === "start" ? "Start end" : "End end",
            key === "start" ? "Point 1" : `Point ${geometry.points.length}`,
            `${treatmentLabel(treatment)} ${foldDetails.endTreatmentLengths?.[key] ? `${formatPdfNumber(foldDetails.endTreatmentLengths[key])} mm` : ""}`.trim(),
            "-",
            foldDetails.endTreatmentNotes?.[key] || "-",
          ]);
        });

        ensureSpace(14 + rows.length * 7);
        doc.setFillColor(241, 245, 249);
        doc.setDrawColor(226, 232, 240);
        doc.rect(margin, y, contentWidth, 7, "FD");
        doc.setFont("helvetica", "bold");
        doc.setFontSize(7.5);
        doc.setTextColor(51, 65, 85);
        doc.text("Item", margin + 2, y + 4.8);
        doc.text("Location", margin + 38, y + 4.8);
        doc.text("Dimension / Type", margin + 76, y + 4.8);
        doc.text("Angle", margin + 118, y + 4.8);
        doc.text("Notes", margin + 138, y + 4.8);
        y += 7;
        doc.setFont("helvetica", "normal");
        rows.forEach((row) => {
          ensureSpace(8);
          doc.setDrawColor(241, 245, 249);
          doc.line(margin, y, pageWidth - margin, y);
          doc.setFontSize(7.2);
          doc.setTextColor(51, 65, 85);
          doc.text(row[0], margin + 2, y + 5);
          doc.text(row[1], margin + 38, y + 5);
          doc.text(row[2], margin + 76, y + 5);
          doc.text(row[3], margin + 118, y + 5);
          doc.text(doc.splitTextToSize(row[4], 44), margin + 138, y + 5);
          y += 8;
        });

        if (existing.manufacturingNotes) {
          ensureSpace(14);
          doc.setFont("helvetica", "bold");
          doc.setFontSize(8);
          doc.setTextColor(15, 23, 42);
          doc.text("Manufacturing notes", margin, y + 3);
          doc.setFont("helvetica", "normal");
          doc.setTextColor(71, 85, 105);
          y = addWrappedPdfText(doc, existing.manufacturingNotes, margin, y + 8, contentWidth, 4);
        }
        y += 8;
      });

      addFooter();
      doc.save(`${safeFileName(order.orderNumber)}-flashing-order.pdf`);
      toast.success("Flashing PDF downloaded");
    } catch (error: any) {
      toast.error(`Failed to generate flashing PDF: ${error?.message || "Unknown error"}`);
    } finally {
      setIsExportingPdf(false);
    }
  };

  if (detailQuery.isLoading) {
    return <div className="p-8 flex justify-center"><Spinner /></div>;
  }

  if (!order) {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <Card>
          <CardContent className="py-10 text-center">
            <p className="font-semibold">Flashing order not found</p>
            <Button className="mt-4" onClick={() => navigate(orderBasePath)}>Back to Flashing Orders</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const subjectAreaPhoto = getSubjectAreaPhoto(order.attachments);
  const allWorkflowSections: Array<{
    key: WorkflowSectionKey;
    label: string;
    detail: string;
    count?: string;
  }> = [
    {
      key: "overview",
      label: "Order",
      detail: order.supplierName || order.requestedDeliveryAt ? "Details recorded" : "Delivery and notes",
    },
    {
      key: "templates",
      label: "Templates",
      detail: templates.length > 0 ? "Choose a profile" : "Start from blank",
      count: String(templates.length),
    },
    {
      key: "design",
      label: "Design",
      detail: line.id ? "Editing saved line" : "Draw profile",
      count: `${lineFoldCount} folds`,
    },
    {
      key: "lines",
      label: "Lines",
      detail: lines.length === 1 ? "1 profile saved" : `${lines.length} profiles saved`,
      count: String(lines.length),
    },
    {
      key: "photo",
      label: "Site Photo",
      detail: subjectAreaPhoto?.url ? "Suitability photo attached" : "Add suitability photo",
      count: subjectAreaPhoto?.url ? "1" : undefined,
    },
    {
      key: "timeline",
      label: portalMode ? "Review" : "Timeline",
      detail: portalMode ? "Submit when ready" : "Status history",
      count: portalMode ? (lines.length > 0 ? String(lines.length) : undefined) : String(history.length),
    },
  ];
  const workflowSections = allWorkflowSections;

  const handleSubjectPhotoUpload = (file?: File | null) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Please choose an image file.");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      toast.error("Image must be under 8MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = String(reader.result || "").split(",")[1];
      if (!base64) {
        toast.error("Could not read the image.");
        return;
      }
      const payload = {
        id: order.id,
        base64,
        filename: file.name,
        mimeType: file.type || "image/jpeg",
      };
      if (portalMode) portalUploadSubjectPhoto.mutate(payload);
      else adminUploadSubjectPhoto.mutate(payload);
    };
    reader.onerror = () => toast.error("Could not read the image.");
    reader.readAsDataURL(file);
  };

  const saveOrderDetails = () => {
    if (portalMode) {
      portalUpdateOrder.mutate({
        id: order.id,
        requestedDeliveryAt: orderDraft.requestedDeliveryAt || null,
        deliveryMethod: orderDraft.deliveryMethod,
        priority: orderDraft.priority as any,
        siteNotes: orderDraft.siteNotes || null,
      });
    } else {
      adminUpdateOrder.mutate({
        id: order.id,
        supplierName: orderDraft.supplierName || null,
        requestedDeliveryAt: orderDraft.requestedDeliveryAt || null,
        deliveryMethod: orderDraft.deliveryMethod,
        priority: orderDraft.priority as any,
        siteNotes: orderDraft.siteNotes || null,
        internalNotes: orderDraft.internalNotes || null,
      });
    }
  };

  const submitLine = () => {
    if (line.geometry.points.length < 2) {
      toast.error("Add at least two profile points before saving a flashing line.");
      return;
    }
    const payload = {
      ...line,
      orderId: order.id,
      category: line.category || "custom",
      materialType: line.materialType || "Colorbond",
      colourSide: line.colourSide as any,
      status: line.status as any,
    };
    if (portalMode) portalSaveLine.mutate(payload);
    else adminSaveLine.mutate(payload);
  };

  const handleDeleteLine = (existing: any) => {
    const payload = { id: existing.id, orderId: order.id };
    if (portalMode) portalDeleteLine.mutate(payload);
    else adminDeleteLine.mutate(payload);
  };

  const editLine = (existing: any) => {
    setLine({
      id: existing.id,
      templateId: existing.templateId ?? null,
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
    setActiveSection("design");
  };

  const loadTemplate = (template: any) => {
    setLine({
      ...DEFAULT_LINE,
      templateId: Number(template.id) || null,
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
    setActiveSection("design");
  };

  const openTemplateEditor = (template: any) => {
    setEditingTemplate(template);
    setTemplateForm({
      name: template.name || "",
      category: template.category || "custom",
      defaultMaterialType: template.defaultMaterialType || "Colorbond",
      defaultGauge: template.defaultGauge || "0.55 BMT",
      defaultColour: template.defaultColour || "",
      defaultColourSide: template.defaultColourSide || "outside",
      defaultQuantity: String(template.defaultQuantity || 1),
      defaultLengthMm: String(Number(template.defaultLengthMm || 0)),
      notes: template.notes || "",
      tags: template.tags || "",
    });
  };

  const submitTemplateEdit = () => {
    if (!editingTemplate?.id) return;
    const quantity = Math.max(1, Math.floor(Number(templateForm.defaultQuantity) || 1));
    const lengthMm = Math.max(0, Number(templateForm.defaultLengthMm) || 0);
    const geometry = {
      ...cloneGeometry(editingTemplate.geometry),
      foldDetails: (editingTemplate.geometry as any)?.foldDetails || {},
    };

    updateTemplate.mutate({
      id: Number(editingTemplate.id),
      name: templateForm.name,
      category: templateForm.category || "custom",
      geometry,
      defaultMaterialType: templateForm.defaultMaterialType || null,
      defaultGauge: templateForm.defaultGauge || null,
      defaultColour: templateForm.defaultColour || null,
      defaultColourSide: templateForm.defaultColourSide as any,
      defaultQuantity: quantity,
      defaultLengthMm: lengthMm,
      notes: templateForm.notes || null,
      tags: templateForm.tags || null,
    });
  };

  const closeTemplateEditor = () => {
    if (updateTemplate.isPending) return;
    setEditingTemplate(null);
    setTemplateForm(DEFAULT_TEMPLATE_FORM);
  };

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-[1500px] mx-auto">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(orderBasePath)}>
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
          <Button
            type="button"
            variant="outline"
            onClick={exportFlashingPdf}
            disabled={isExportingPdf || lines.length === 0}
          >
            {isExportingPdf ? <Spinner className="h-4 w-4 mr-1.5" /> : <Download className="h-4 w-4 mr-1.5" />}
            Export PDF
          </Button>
          {!portalMode && (
            <select
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
              value={order.status}
              onChange={(event) => updateStatus.mutate({ id: order.id, status: event.target.value as any })}
            >
              {Object.entries(STATUS_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </select>
          )}
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

      <div className="rounded-lg border bg-card p-2 shadow-sm">
        <div className="sm:hidden">
          <label htmlFor="flashing-section-select" className="sr-only">Flashing order section</label>
          <select
            id="flashing-section-select"
            className="h-12 w-full rounded-md border border-input bg-background px-3 text-sm font-semibold"
            value={activeSection}
            onChange={(event) => setActiveSection(event.target.value as WorkflowSectionKey)}
          >
            {workflowSections.map((section, index) => (
              <option key={section.key} value={section.key}>
                {index + 1}. {section.label}{section.count ? ` (${section.count})` : ""} - {section.detail}
              </option>
            ))}
          </select>
        </div>
        <div className="hidden gap-2 sm:grid sm:grid-cols-3 lg:grid-cols-6" role="tablist" aria-label="Flashing order workflow sections">
          {workflowSections.map((section, index) => {
            const isActive = activeSection === section.key;
            return (
              <button
                key={section.key}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => setActiveSection(section.key)}
                className={cn(
                  "min-w-0 rounded-md border px-3 py-3 text-left transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                  isActive
                    ? "border-primary bg-primary text-primary-foreground shadow-sm"
                    : "border-transparent bg-muted/35 hover:bg-muted",
                )}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-semibold uppercase tracking-wide opacity-75">
                    {index + 1}
                  </span>
                  {section.count && (
                    <span className={cn(
                      "rounded-full px-2 py-0.5 text-[11px] font-semibold",
                      isActive ? "bg-primary-foreground/20 text-primary-foreground" : "bg-background text-muted-foreground",
                    )}>
                      {section.count}
                    </span>
                  )}
                </span>
                <span className="mt-1 block text-sm font-semibold leading-tight">{section.label}</span>
                <span className={cn("mt-0.5 block truncate text-xs", isActive ? "text-primary-foreground/80" : "text-muted-foreground")}>
                  {section.detail}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6">
        <div className={cn("space-y-6", !["design", "lines"].includes(activeSection) && "hidden")}>
          <Card className={cn(activeSection !== "design" && "hidden")}>
            <CardHeader>
              <CardTitle className="text-base">Profile Line Designer</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid grid-cols-1 2xl:grid-cols-[minmax(0,1.08fr)_minmax(320px,0.92fr)] gap-5">
                <ProfileDesigner geometry={line.geometry} foldDetails={line.foldDetails} onChange={updateLineGeometry} />
                <FlashingProfile3DPreview
                  geometry={line.geometry}
                  colour={line.colour}
                  lengthMm={line.lengthMm}
                  profileName={line.profileName}
                />
              </div>
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
                {!portalMode && (
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
                )}
                <Button type="button" onClick={submitLine} disabled={isSavingLine}>
                  {isSavingLine ? <Spinner className="h-4 w-4 mr-1.5" /> : <Save className="h-4 w-4 mr-1.5" />}
                  {line.id ? "Update Line" : "Add Line"}
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className={cn(activeSection !== "lines" && "hidden")}>
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
                              <Button variant="ghost" size="icon" onClick={() => handleDeleteLine(existing)} disabled={isDeletingLine}>
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

        <div className={cn("space-y-6", !["overview", "photo", "templates", "timeline"].includes(activeSection) && "hidden")}>
          <Card className={cn(activeSection !== "overview" && "hidden")}>
            <CardHeader>
              <CardTitle className="text-base">Order Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {!portalMode && (
                <div className="space-y-1">
                  <label className="text-sm font-medium">Supplier</label>
                  <Input value={orderDraft.supplierName} onChange={(event) => setOrderDraft({ ...orderDraft, supplierName: event.target.value })} placeholder="Supplier / manufacturer" />
                </div>
              )}
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
              {!portalMode && (
                <Textarea value={orderDraft.internalNotes} onChange={(event) => setOrderDraft({ ...orderDraft, internalNotes: event.target.value })} placeholder="Internal notes" />
              )}
              <Button className="w-full" onClick={saveOrderDetails} disabled={isUpdatingOrder}>
                {isUpdatingOrder ? <Spinner className="h-4 w-4 mr-1.5" /> : <Save className="h-4 w-4 mr-1.5" />}
                Save Details
              </Button>
            </CardContent>
          </Card>

          <Card className={cn(activeSection !== "photo" && "hidden")}>
            <CardHeader className="space-y-1">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-base">Subject Area Photo</CardTitle>
                <Badge variant="outline">Suitability check</Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                Upload the installation area so construction can confirm flashing suitability before manufacture.
              </p>
            </CardHeader>
            <CardContent className="space-y-3">
              <input
                ref={subjectPhotoInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(event) => {
                  handleSubjectPhotoUpload(event.target.files?.[0]);
                  event.currentTarget.value = "";
                }}
              />

              {subjectAreaPhoto?.url ? (
                <div className="space-y-3">
                  <a
                    href={subjectAreaPhoto.url}
                    target="_blank"
                    rel="noreferrer"
                    className="block overflow-hidden rounded-md border bg-muted"
                  >
                    <img
                      src={subjectAreaPhoto.url}
                      alt="Subject area for flashing order"
                      className="max-h-[560px] w-full object-contain"
                    />
                  </a>
                  <div className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
                    <div className="flex items-start gap-2">
                      <ImageIcon className="mt-0.5 h-4 w-4 shrink-0" />
                      <div className="min-w-0">
                        <p className="truncate font-medium text-foreground">{subjectAreaPhoto.fileName || "Subject area photo"}</p>
                        <p>
                          Uploaded {subjectAreaPhoto.uploadedAt ? formatDateTime(subjectAreaPhoto.uploadedAt) : "-"}
                          {subjectAreaPhoto.uploadedByName ? ` by ${subjectAreaPhoto.uploadedByName}` : ""}
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => subjectPhotoInputRef.current?.click()}
                      disabled={isUploadingSubjectPhoto}
                    >
                      {isUploadingSubjectPhoto ? <Spinner className="mr-1.5 h-4 w-4" /> : <Upload className="mr-1.5 h-4 w-4" />}
                      Replace
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => window.open(subjectAreaPhoto.url, "_blank", "noopener,noreferrer")}
                    >
                      <ExternalLink className="mr-1.5 h-4 w-4" />
                      Open
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        if (portalMode) portalRemoveSubjectPhoto.mutate({ id: order.id });
                        else adminRemoveSubjectPhoto.mutate({ id: order.id });
                      }}
                      disabled={isRemovingSubjectPhoto}
                    >
                      {isRemovingSubjectPhoto ? <Spinner className="mr-1.5 h-4 w-4" /> : <X className="mr-1.5 h-4 w-4" />}
                      Remove
                    </Button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => subjectPhotoInputRef.current?.click()}
                  disabled={isUploadingSubjectPhoto}
                  className="flex min-h-52 w-full flex-col items-center justify-center gap-3 rounded-md border border-dashed bg-muted/20 p-5 text-center hover:bg-muted/35 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  <span className="rounded-full bg-background p-3 shadow-sm">
                    {isUploadingSubjectPhoto ? <Spinner className="h-6 w-6" /> : <Camera className="h-6 w-6 text-muted-foreground" />}
                  </span>
                  <span>
                    <span className="block text-sm font-medium">Upload subject area photo</span>
                    <span className="block text-xs text-muted-foreground">Use camera or choose an image under 8MB.</span>
                  </span>
                </button>
              )}
            </CardContent>
          </Card>

          <Card className={cn(activeSection !== "templates" && "hidden")}>
            <CardHeader className="flex flex-row items-center justify-between gap-3">
              <CardTitle className="text-base">Profile Templates</CardTitle>
              {!portalMode && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => seedTemplates.mutate()}
                  disabled={seedTemplates.isPending}
                >
                  {seedTemplates.isPending ? <Spinner className="mr-1.5 h-4 w-4" /> : <Plus className="mr-1.5 h-4 w-4" />}
                  Seed Standards
                </Button>
              )}
            </CardHeader>
            <CardContent className="space-y-2">
              {templates.length === 0 ? (
                <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                  {portalMode
                    ? "No shared profile templates are available yet. Start a custom profile, then construction can add templates for future orders."
                    : "Saved profiles will appear here. Seed the standard flashing profiles to start from the order guide templates."}
                </div>
              ) : templates.map((template: any) => (
                <div
                  key={template.id}
                  className="rounded-md border bg-background"
                >
                  <button
                    type="button"
                    onClick={() => loadTemplate(template)}
                    className="w-full p-3 text-left hover:bg-muted/40"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-medium">{template.name}</span>
                      <Badge variant="outline">{template.category || "custom"}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {template.defaultMaterialType || "Material not set"} - {Number(template.defaultLengthMm || 0).toFixed(0)} mm
                    </p>
                    {template.notes && (
                      <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{template.notes}</p>
                    )}
                  </button>
                  {!portalMode && (
                    <div className="flex flex-wrap items-center justify-end gap-2 border-t p-2">
                      <Button type="button" size="sm" variant="outline" onClick={() => openTemplateEditor(template)}>
                        <Pencil className="mr-1.5 h-3.5 w-3.5" />
                        Edit
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={duplicateTemplate.isPending}
                        onClick={() => duplicateTemplate.mutate({ id: Number(template.id), name: `${template.name} copy` })}
                      >
                        <Copy className="mr-1.5 h-3.5 w-3.5" />
                        Duplicate
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="text-destructive hover:text-destructive"
                        disabled={archiveTemplate.isPending}
                        onClick={() => {
                          if (window.confirm(`Archive template "${template.name}"?`)) {
                            archiveTemplate.mutate({ id: Number(template.id) });
                          }
                        }}
                      >
                        <Archive className="mr-1.5 h-3.5 w-3.5" />
                        Archive
                      </Button>
                    </div>
                  )}
                </div>
              ))}
              <div className="flex justify-end pt-2">
                <Button type="button" variant="outline" onClick={() => setActiveSection("design")}>
                  <Plus className="mr-1.5 h-4 w-4" />
                  Start Custom Profile
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className={cn(activeSection !== "timeline" && "hidden")}>
            <CardHeader>
              <CardTitle className="text-base">{portalMode ? "Review & Submit" : "Status Timeline"}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {portalMode && (
                <div className="rounded-md border bg-muted/20 p-4">
                  <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                    <div>
                      <p className="text-xs text-muted-foreground">Profiles</p>
                      <p className="font-semibold">{lines.length}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Total LM</p>
                      <p className="font-semibold">{Number(order.totalLinealMetres || 0).toFixed(2)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Folds</p>
                      <p className="font-semibold">{orderFoldCount}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Status</p>
                      <p className="font-semibold">{STATUS_LABELS[order.status] || order.status}</p>
                    </div>
                  </div>
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                    <p className="text-sm text-muted-foreground">
                      {lines.length === 0
                        ? "Add at least one flashing profile before submitting."
                        : ["draft", "supplier_received"].includes(order.status)
                          ? "Submit when all profiles, folds, end treatments, and site photo details are ready for construction review."
                          : "This order has already moved past supplier editing."}
                    </p>
                    <Button
                      type="button"
                      onClick={() => submitForReview.mutate({ id: order.id })}
                      disabled={submitForReview.isPending || lines.length === 0 || !["draft", "supplier_received"].includes(order.status)}
                    >
                      {submitForReview.isPending ? <Spinner className="h-4 w-4 mr-1.5" /> : <Upload className="h-4 w-4 mr-1.5" />}
                      {order.status === "supplier_received" ? "Resubmit for Review" : "Submit for Review"}
                    </Button>
                  </div>
                </div>
              )}
              {history.length === 0 ? (
                <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
                  No status changes recorded yet.
                </div>
              ) : (
                history.map((item: any) => (
                  <div key={item.id} className="border-l-2 border-muted pl-3">
                    <p className="text-sm font-medium">{STATUS_LABELS[item.toStatus] || item.toStatus}</p>
                    <p className="text-xs text-muted-foreground">{formatDateTime(item.createdAt)} by {item.changedByName || "System"}</p>
                    {item.notes && <p className="text-xs mt-1">{item.notes}</p>}
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={!!editingTemplate} onOpenChange={(open) => { if (!open) closeTemplateEditor(); }}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Profile Template</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Template Name</label>
                <Input
                  value={templateForm.name}
                  onChange={(event) => setTemplateForm((current) => ({ ...current, name: event.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Category</label>
                <Input
                  value={templateForm.category}
                  onChange={(event) => setTemplateForm((current) => ({ ...current, category: event.target.value }))}
                  placeholder="apron, capping, gutter..."
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Material</label>
                <Input
                  value={templateForm.defaultMaterialType}
                  onChange={(event) => setTemplateForm((current) => ({ ...current, defaultMaterialType: event.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Gauge / Thickness</label>
                <Input
                  value={templateForm.defaultGauge}
                  onChange={(event) => setTemplateForm((current) => ({ ...current, defaultGauge: event.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Colour Side</label>
                <select
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={templateForm.defaultColourSide}
                  onChange={(event) => setTemplateForm((current) => ({ ...current, defaultColourSide: event.target.value }))}
                >
                  <option value="outside">Outside</option>
                  <option value="inside">Inside</option>
                  <option value="both">Both</option>
                  <option value="unspecified">Unspecified</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Default Colour</label>
                <select
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={templateForm.defaultColour}
                  onChange={(event) => setTemplateForm((current) => ({ ...current, defaultColour: event.target.value }))}
                >
                  <option value="">No default colour</option>
                  {templateColourOptions.map((colour) => (
                    <option key={colour} value={colour}>{colour}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Default Qty</label>
                <Input
                  type="number"
                  min={1}
                  value={templateForm.defaultQuantity}
                  onChange={(event) => setTemplateForm((current) => ({ ...current, defaultQuantity: event.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Default Length (mm)</label>
                <Input
                  type="number"
                  min={0}
                  value={templateForm.defaultLengthMm}
                  onChange={(event) => setTemplateForm((current) => ({ ...current, defaultLengthMm: event.target.value }))}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium">Description / Notes</label>
              <Textarea
                value={templateForm.notes}
                onChange={(event) => setTemplateForm((current) => ({ ...current, notes: event.target.value }))}
                placeholder="Manufacturing notes, common use, supplier notes..."
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium">Tags</label>
              <Input
                value={templateForm.tags}
                onChange={(event) => setTemplateForm((current) => ({ ...current, tags: event.target.value }))}
                placeholder="comma separated"
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={closeTemplateEditor} disabled={updateTemplate.isPending}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={submitTemplateEdit}
              disabled={updateTemplate.isPending || !templateForm.name.trim()}
            >
              {updateTemplate.isPending ? <Spinner className="mr-1.5 h-4 w-4" /> : <Save className="mr-1.5 h-4 w-4" />}
              Save Template
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
