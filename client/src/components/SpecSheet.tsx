import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import { Save, Wand2, Printer, CheckCircle2, Circle, RefreshCw, BookmarkPlus, FileText, Search, Pencil, Check, Plus, Trash2, Copy, Eye, FileDown, ChevronLeft, ChevronRight, Menu, Lock, MapPin, Calculator, RefreshCcw, AlertCircle, Info } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/_core/hooks/useAuth";
import { isAdminRole } from "@shared/const";
import { useIsMobile } from "@/hooks/useMobile";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import SpecSheetSidebar, { type SectionMeta } from "@/components/SpecSheetSidebar";
import { loadSectionOrder, saveSectionOrder, loadHiddenSections, saveHiddenSections, resetAllPreferences, DEFAULT_SECTION_ORDER, ensureDefaultSections } from "@/lib/specSheetPrefs";
import { useState, useEffect, useRef, useCallback, useMemo, type SetStateAction } from "react";
import { toast } from "sonner";
import { ColourSwatch, ColourSelectPreview, getColourHex, parseCombinationColour } from "@/components/ColourSwatch";
import CouncilSelect from "@/components/CouncilSelect";
import { Checkbox } from "@/components/ui/checkbox";
import FilteredSelect, { type FilteredSelectCategory } from "@/components/FilteredSelect";
import { SortableChecklist, type CheckItem } from "@/components/SortableChecklist";
import { checklistDefaultFromLabel, getBuiltinWorkChecklistDefaults } from "@shared/spec-checklist-defaults";
import RoofPlanDiagram from "@/components/RoofPlanDiagram";
import GutterPlanDiagram from "@/components/GutterPlanDiagram";
import QuoteRevisionHistory from "@/components/QuoteRevisionHistory";
import SitePlanDiagram from "@/components/SitePlanDiagram";
import SitePlanPrintPage from "@/components/SitePlanPrintPage";
import PostPositionDiagram from "@/components/PostPositionDiagram";
import BeamPositionPlan from "@/components/BeamPositionPlan";
import PlanViewDiagram from "@/components/PlanViewDiagram";
import SitePlanPreviewDialog from "@/components/SitePlanPreviewDialog";
import SideElevationDiagram from "@/components/SideElevationDiagram";
import DiagramAnnotation, { type Annotation } from "@/components/DiagramAnnotation";
import { generateBatchDiagramPdf, type BatchDiagramData } from "@/lib/batchDiagramPdf";
import { calculateRakedGeometry, type RakedEdge } from "../../../shared/rakedGeometry";
import { validateBeamMountedPostLoads } from "../../../shared/beamSizeValidator";
import {
  calculateStairs,
  DEFAULT_STAIR_INPUTS,
  STAIR_LIMITS,
  type HandrailStyle,
  type RiserStyle,
  type StairInputs,
  type StairType,
  type StringerMaterial,
  type TreadMaterial,
} from "../../../shared/stairCalc";
import { DeckStairSideView } from "@/components/deck/DeckStairSideView";

// ─── Section definitions for sidebar nav ───────────────────────────────────
// Section categories for sub-tab filtering
const SECTION_CATEGORIES = [
  { id: "all", label: "All" },
  { id: "general", label: "General" },
  { id: "structure", label: "Structure" },
  { id: "exterior", label: "Exterior" },
  { id: "interior", label: "Interior" },
  { id: "services", label: "Services" },
] as const;

const SECTIONS = [
  { id: "client", label: "Client & Job Info", requiredFields: [] as string[], category: "general" },
  { id: "siteDetails", label: "Site Details", requiredFields: [] as string[], category: "general" },
  { id: "dimensions", label: "Dimensions & Structure", requiredFields: ["specWidth", "specLength"], category: "structure" },
  { id: "adjustments", label: "Adjustments", requiredFields: [] as string[], category: "general" },
  { id: "roof", label: "Roof", requiredFields: [] as string[], category: "exterior" },
  { id: "brackets", label: "Attachment & Brackets", requiredFields: [] as string[], category: "structure" },
  { id: "beams", label: "Beams, Channels & Flashings", requiredFields: [] as string[], category: "structure" },
  { id: "posts", label: "Posts", requiredFields: [] as string[], category: "structure" },
  { id: "gutter", label: "Gutter & Downpipe", requiredFields: [] as string[], category: "exterior" },
  { id: "walls", label: "Walls", requiredFields: [] as string[], category: "exterior" },
  { id: "windows", label: "Windows & Doors", requiredFields: [] as string[], category: "exterior" },
  { id: "demolition", label: "Demolition Works", requiredFields: [] as string[], category: "general" },
  { id: "existingHouse", label: "Work on Existing House", requiredFields: [] as string[], category: "general" },
  { id: "additionalCosts", label: "Additional Costs (Priced)", requiredFields: [] as string[], category: "general" },
  { id: "floor", label: "Internal Floor", requiredFields: [] as string[], category: "interior" },
  { id: "concreting", label: "Concreting", requiredFields: [] as string[], category: "structure" },
  { id: "electrical", label: "Electrical", requiredFields: [] as string[], category: "services" },
  { id: "plumbing", label: "Plumbing & Drainage", requiredFields: [] as string[], category: "services" },
  { id: "balustrade", label: "Balustrade", requiredFields: [] as string[], category: "interior" },
  { id: "stairs", label: "Stairs", requiredFields: [] as string[], category: "interior" },
  { id: "sitePlan", label: "Site Plan & Elevations", requiredFields: [] as string[], category: "structure" },
  { id: "history", label: "Revision History", requiredFields: [] as string[], category: "general" },
] as const;

const HOUSE_ROOF_TYPE_OPTIONS = ["Tile", "Metal", "Flat", "Concrete", "Slate", "Other"];
const EXISTING_HOUSE_WALL_OPTIONS = ["Brick Veneer", "Double Brick", "Rendered", "Weatherboard", "Hebel", "Cladding", "Concrete Block", "Other"];
const YES_NO_OPTIONS = ["Yes", "No"];
const ATTACHED_SIDE_OPTIONS = ["1 Side", "2 Side", "3 Side", "4 Side"];
const ELECTRICAL_LIGHT_FALLBACK_OPTIONS = [
  "LED Downlight",
  "LED Oyster",
  "LED Batten",
  "LED Strip",
  "LED Flood",
  "Pendant",
  "Wall Sconce",
  "Spot Light",
  "Garden Light",
];
const ELECTRICAL_FAN_FALLBACK_OPTIONS = ["Ceiling Fan", "Fan Point", "Exhaust Fan"];
const BRACKET_ATTACHMENT_METHOD_OPTIONS = ["Fascia brackets", "Extenda brackets", "Gable brackets", "popup brackets", "wall brackets"];
const BRACKET_INFILL_FALLBACK_OPTIONS = ["Glass", "Twinwall"];
const POST_FIXING_OPTIONS = ["Footing", "Internal Bracket", "Welded Base Plate"];
const ADDITIONAL_COST_ALLOWED_SECTION_KEYS = new Set(["finishing", "other", "roofing", "site_works"]);
const STAIR_TYPE_OPTIONS: { value: StairType; label: string }[] = [
  { value: "straight", label: "Straight" },
  { value: "l-shape", label: "L-Shape" },
  { value: "u-shape", label: "U-Shape" },
];
const STAIR_TREAD_OPTIONS: { value: TreadMaterial; label: string }[] = [
  { value: "matching", label: "Matching" },
  { value: "timber", label: "Timber" },
  { value: "aluminium", label: "Aluminium" },
];
const STAIR_RISER_OPTIONS: { value: RiserStyle; label: string }[] = [
  { value: "open", label: "Open" },
  { value: "closed", label: "Closed" },
];
const STAIR_STRINGER_OPTIONS: { value: StringerMaterial; label: string }[] = [
  { value: "timber", label: "Timber" },
  { value: "steel", label: "Steel" },
  { value: "aluminium", label: "Aluminium" },
];
const STAIR_HANDRAIL_OPTIONS: { value: HandrailStyle; label: string }[] = [
  { value: "none", label: "None" },
  { value: "one-side", label: "One Side" },
  { value: "both-sides", label: "Both" },
];
const BRACKET_METHOD_QUANTITY_FIELDS: Record<string, string> = {
  "Fascia brackets": "specFasciaBrackets",
  "Extenda brackets": "specExtendaBrackets",
  "Gable brackets": "specGableBrackets",
  "popup brackets": "specPopupBrackets",
  "wall brackets": "specWallFixingBracket",
};
const BRACKET_METHOD_QUANTITY_FIELD_KEYS = Object.values(BRACKET_METHOD_QUANTITY_FIELDS);
const BRACKET_OPTION_FIELD_KEYS = [
  ...BRACKET_METHOD_QUANTITY_FIELD_KEYS,
  "specNumberOfBrackets",
  "specOversizedDGutter",
  "specBracketCover",
  "specBracketColour",
  "specPopupColour",
  "specBracketInfillType",
  "specBracketInfillLength",
  "specBracketInfillHeight",
  "specBracketInfillColour",
  "specWallFixingBeam",
  "specFoamCut",
] as const;

function bracketQuantityForMethod(form: Record<string, string>, method: string) {
  const field = BRACKET_METHOD_QUANTITY_FIELDS[method];
  return field ? form[field] || "" : "";
}

function inferBracketAttachmentMethod(form: Record<string, string>) {
  if (parseInt(form.specFasciaBrackets || "0") > 0) return "Fascia brackets";
  if (parseInt(form.specExtendaBrackets || "0") > 0) return "Extenda brackets";
  if (parseInt(form.specGableBrackets || "0") > 0) return "Gable brackets";
  if (parseInt(form.specPopupBrackets || "0") > 0) return "popup brackets";
  if (parseInt(form.specWallFixingBracket || "0") > 0) return "wall brackets";
  return "";
}

function applyBracketMethodQuantity(form: Record<string, string>, method: string, quantity: string) {
  const next: Record<string, string> = {
    ...form,
    specBracketAttachmentMethod: method,
    specNumberOfBrackets: method && method !== "None" ? quantity : "",
  };
  for (const field of BRACKET_METHOD_QUANTITY_FIELD_KEYS) {
    next[field] = "";
  }
  const targetField = BRACKET_METHOD_QUANTITY_FIELDS[method];
  if (targetField && quantity) {
    next[targetField] = quantity;
  }
  return next;
}

function clearBracketMethodOptions(form: Record<string, string>) {
  const next = { ...form };
  for (const field of BRACKET_OPTION_FIELD_KEYS) {
    next[field] = "";
  }
  next.specBracketAttachmentMethod = "";
  return next;
}

function applyBracketMethod(form: Record<string, string>, method: string) {
  const quantity = method && method !== "None"
    ? (form.specNumberOfBrackets || bracketQuantityForMethod(form, method))
    : "";
  const next = applyBracketMethodQuantity(form, method, quantity);

  if (method !== "Gable brackets") {
    next.specOversizedDGutter = "";
    next.specBracketCover = "";
    next.specBracketColour = "";
  }
  if (method !== "popup brackets") {
    next.specPopupColour = "";
  }
  if (method !== "Gable brackets" && method !== "popup brackets") {
    next.specBracketInfillType = "";
    next.specBracketInfillLength = "";
    next.specBracketInfillHeight = "";
    next.specBracketInfillColour = "";
  }
  if (method !== "wall brackets") {
    next.specWallFixingBeam = "";
    next.specFoamCut = "";
  }

  return next;
}

function normaliseLookupKey(value?: string | null) {
  return (value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function additionalCostSectionKey(value: unknown) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function isPricedAdditionalCostSection(value: unknown) {
  const key = additionalCostSectionKey(value);
  return key === "" || ADDITIONAL_COST_ALLOWED_SECTION_KEYS.has(key);
}

function extractDimensionLookupKey(value?: string | null) {
  const raw = value || "";
  const match = raw.match(/(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)/i);
  return match ? `${match[1]}x${match[2]}`.toLowerCase() : "";
}

function normalizeCutBackEaveOption(value?: string | null): string {
  const raw = (value || "").trim();
  if (!raw) return "";
  const lower = raw.toLowerCase();
  if (["yes", "y", "true"].includes(lower)) return "Yes";
  if (["no", "n", "false", "na", "n/a"].includes(lower)) return "No";
  const numeric = Number(raw);
  if (!Number.isNaN(numeric)) return numeric > 0 ? "Yes" : "No";
  return "";
}

function normalizePostFixingOption(value?: string | null): string {
  const raw = (value || "").trim();
  if (!raw) return "";
  const normalized = raw.toLowerCase().replace(/[_-]+/g, " ");
  return POST_FIXING_OPTIONS.find(option => option.toLowerCase() === normalized) || raw;
}

type BeamOrientation = "H" | "V";

function parseSpecBeamPosition(pos: string): { idx: number; orientation: BeamOrientation } | null {
  const parts = pos.split(":");
  const idx = parseInt(parts[0] || "", 10);
  if (!Number.isFinite(idx)) return null;
  return { idx, orientation: parts[2] === "V" ? "V" : "H" };
}

function defaultBeamOrientationForWalls(houseWalls: string[]): BeamOrientation {
  const firstWall = houseWalls[0] || "A-B";
  return firstWall === "B-C" || firstWall === "D-A" ? "V" : "H";
}

function parseDimensionMetres(value?: string | null): number | null {
  const parsed = parseFloat(value || "");
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function resolveBeamPlacementMeta(
  index: number,
  beamPositions: string[],
  houseWalls: string[],
  width: string,
  length: string,
): { orientation: BeamOrientation; lm: number | null; source: "width" | "projection" } {
  const parsed = beamPositions
    .map(parseSpecBeamPosition)
    .find((position): position is { idx: number; orientation: BeamOrientation } => !!position && position.idx === index);
  const orientation = parsed?.orientation || defaultBeamOrientationForWalls(houseWalls);
  const source = orientation === "H" ? "width" : "projection";
  const dimension = orientation === "H" ? parseDimensionMetres(width) : parseDimensionMetres(length);
  return { orientation, lm: dimension === null ? null : Number(dimension.toFixed(3)), source };
}

function syncBeamEntriesToPlacement(
  entries: { type: "Steel" | "Aluminium"; size: string; lm: number }[],
  beamPositions: string[],
  houseWalls: string[],
  width: string,
  length: string,
) {
  let changed = false;
  const next = entries.map((entry, index) => {
    const { lm } = resolveBeamPlacementMeta(index, beamPositions, houseWalls, width, length);
    if (lm === null || Math.abs((entry.lm || 0) - lm) < 0.001) return entry;
    changed = true;
    return { ...entry, lm };
  });
  return changed ? next : entries;
}

function parsePositiveNumber(value: string | undefined | null, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseNumberAtLeast(value: string | undefined | null, fallback: number, min = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= min ? parsed : fallback;
}

function optionValueFromLabel<T extends string>(options: { value: T; label: string }[], label: unknown, fallback: T): T {
  const text = String(label || "").trim().toLowerCase();
  return options.find(option => option.value === text || option.label.toLowerCase() === text)?.value || fallback;
}

function optionLabel<T extends string>(options: { value: T; label: string }[], value: T): string {
  return options.find(option => option.value === value)?.label || value;
}

function buildStructureStairInputs(form: Record<string, string>): StairInputs {
  const defaultRise = parsePositiveNumber(form.specFloorHeight, parsePositiveNumber(form.specFloorToGround, DEFAULT_STAIR_INPUTS.totalRise));
  const stairType = optionValueFromLabel(STAIR_TYPE_OPTIONS, form.specStairsType, DEFAULT_STAIR_INPUTS.stairType);
  return {
    ...DEFAULT_STAIR_INPUTS,
    totalRise: parsePositiveNumber(form.specStairsTotalRise, defaultRise),
    targetRiser: parsePositiveNumber(form.specStairsRiserHeight, DEFAULT_STAIR_INPUTS.targetRiser),
    targetGoing: parsePositiveNumber(form.specStairsGoingDepth, DEFAULT_STAIR_INPUTS.targetGoing),
    stairWidth: parsePositiveNumber(form.specStairsWidth, DEFAULT_STAIR_INPUTS.stairWidth),
    stairType,
    treadMaterial: optionValueFromLabel(STAIR_TREAD_OPTIONS, form.specStairsTreads, DEFAULT_STAIR_INPUTS.treadMaterial),
    riserStyle: optionValueFromLabel(STAIR_RISER_OPTIONS, form.specStairsRiser, DEFAULT_STAIR_INPUTS.riserStyle),
    stringerMaterial: optionValueFromLabel(STAIR_STRINGER_OPTIONS, form.specStairsStringer, DEFAULT_STAIR_INPUTS.stringerMaterial),
    handrailStyle: optionValueFromLabel(STAIR_HANDRAIL_OPTIONS, form.specStairsHandrail, DEFAULT_STAIR_INPUTS.handrailStyle),
    nosing: parseNumberAtLeast(form.specStairsNosingOverhang, DEFAULT_STAIR_INPUTS.nosing, 0),
    flights: stairType === "straight" ? 1 : 2,
    landingDepth: parsePositiveNumber(form.specStairsLandingDepth, DEFAULT_STAIR_INPUTS.landingDepth),
  };
}

function formatStairNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1).replace(/\.0$/, "");
}

function StairStepperInput({
  label,
  value,
  onChange,
  min = 0,
  max = 10000,
  step = 10,
  unit = "mm",
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
}) {
  return (
    <div>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div className="mt-1 flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-9 w-9 p-0"
          onClick={() => onChange(Math.max(min, value - step))}
        >
          -
        </Button>
        <span className="min-w-[88px] text-center font-mono text-sm">
          {formatStairNumber(value)}{unit}
        </span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-9 w-9 p-0"
          onClick={() => onChange(Math.min(max, value + step))}
        >
          +
        </Button>
      </div>
    </div>
  );
}

function StairSegmented<T extends string>({
  label,
  options,
  value,
  onChange,
  disabledValues = [],
}: {
  label: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  disabledValues?: T[];
}) {
  return (
    <div>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div className="mt-1 grid grid-cols-1 gap-2 sm:grid-cols-3">
        {options.map(option => (
          <Button
            key={option.value}
            type="button"
            variant={value === option.value ? "default" : "outline"}
            className="h-10"
            disabled={disabledValues.includes(option.value)}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </Button>
        ))}
      </div>
    </div>
  );
}

// HOW tiers (default fallback if not configured in master data)
const HOW_TIERS = [
  { label: "20000+", min: 20000, max: Infinity, amount: 600 },
  { label: "25000+", min: 25000, max: Infinity, amount: 650 },
  { label: "35000+", min: 35000, max: Infinity, amount: 700 },
  { label: "50000+", min: 50000, max: Infinity, amount: 750 },
  { label: "100000+", min: 100000, max: Infinity, amount: 1000 },
];
type HowTier = { label: string; min: number; max: number; amount: number };

function parseHowTier(key: string, value: string): HowTier {
  const label = key || "Configured tier";
  const numericValue = parseFloat(value) || 0;
  const rangeMatch = key.match(/^\s*(\d+(?:\.\d+)?)\s*<\s*(\d+(?:\.\d+)?)\s*$/);
  if (rangeMatch) {
    return {
      label,
      min: parseFloat(rangeMatch[1]) || 0,
      max: parseFloat(rangeMatch[2]) || Infinity,
      amount: numericValue,
    };
  }
  const plusMatch = key.match(/^\s*(\d+(?:\.\d+)?)\s*(?:\+|>|and over)?\s*$/i);
  if (plusMatch) {
    return { label, min: parseFloat(plusMatch[1]) || 0, max: Infinity, amount: numericValue };
  }
  return { label, min: parseFloat(key) || 0, max: Infinity, amount: numericValue };
}

function getHowAmount(grandTotalExGst: number, tiers: HowTier[] = HOW_TIERS): number {
  let howAmount = 0;
  const sortedTiers = [...tiers].sort((a, b) => a.min - b.min);
  for (const tier of sortedTiers) {
    if (grandTotalExGst >= tier.min && grandTotalExGst <= tier.max) {
      howAmount = tier.amount;
      break;
    }
    if (grandTotalExGst >= tier.min) howAmount = tier.amount;
  }
  return howAmount;
}

function formatHowTierLabel(tier: HowTier): string {
  const amount = `$${tier.amount.toLocaleString()}`;
  return `${tier.label} - ${amount}`;
}

function quoteLooksNsw(quote: any): boolean {
  const haystack = [
    quote?.region,
    quote?.siteAddress,
    quote?.suburb,
    quote?.localCouncil,
  ].filter(Boolean).join(" ").toUpperCase();
  return /\bNSW\b/.test(haystack) || haystack.includes("NEW SOUTH WALES");
}

export default function SpecSheet({ quoteId }: { quoteId: number }) {
  const utils = trpc.useUtils();
  const { user } = useAuth();
  const isAdmin = isAdminRole(user?.role || "");
  const isSuperAdmin = user?.role === "super_admin";
  const { data: quote, isLoading } = trpc.quotes.get.useQuery({ id: quoteId });
  const updateMutation = trpc.quotes.updateSpec.useMutation({
    onSuccess: () => {
      utils.quotes.get.invalidate({ id: quoteId });
    },
    onError: (err: any) => toast.error(err.message),
  });

  // ─── Adjustments Section: master data, mutations, state ───
  const { data: allMasterData } = trpc.masterData.getAll.useQuery();
  const adjUpdateMutation = trpc.quotes.update.useMutation({
    onSuccess: () => {
      toast.success("Adjustments saved");
      utils.quotes.get.invalidate({ id: quoteId });
    },
    onError: (err: any) => toast.error(err.message),
  });
  const calculateTravelMutation = trpc.quotes.calculateTravel.useMutation({
    onSuccess: (data) => {
      toast.success(`Travel: ${data.distanceKm}km from ${data.branchName} - Band ${data.bandKey} = $${data.allowance}`);
      setTravelAllowance(String(data.allowance));
      utils.quotes.get.invalidate({ id: quoteId });
    },
    onError: (err: any) => toast.error(err.message),
  });
  const recalcMutation = trpc.quotes.recalculateFinancials.useMutation({
    onSuccess: (data) => {
      toast.success("Financials recalculated");
      if (data.complexity !== undefined) setComplexityLoading(String(data.complexity));
      if (data.constructionMgmt !== undefined) setConstructionMgmtAmount(String(data.constructionMgmt.toFixed ? data.constructionMgmt.toFixed(2) : data.constructionMgmt));
      if (data.delivery !== undefined) setDeliveryAmount(String(data.delivery.toFixed(2)));
      if (data.homeWarranty !== undefined) setHomeWarranty(String(data.homeWarranty.toFixed ? data.homeWarranty.toFixed(2) : data.homeWarranty));
      setDeliveryOverride(false);
      setConstructionMgmtOverride(false);
      setComplexityOverride(false);
      utils.quotes.get.invalidate({ id: quoteId });
    },
    onError: (err: any) => toast.error(err.message),
  });

  // Auto-save refs (declared early so handleRecalculateAll can reference them)
  const adjHasLoadedRef = useRef(false);
  const adjAutoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [adjSaveStatus, setAdjSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  // Spec auto-save ref (populated later, used by handleRecalculateAll)
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const performAutoSaveRef = useRef<(() => void) | null>(null);

  // Combined recalculate: flush ALL pending edits, travel first (to refresh distance), then financials
  const handleRecalculateAll = async () => {
    try {
      // Step 0a: Flush pending adjustment auto-save
      if (adjAutoSaveTimerRef.current) {
        clearTimeout(adjAutoSaveTimerRef.current);
        adjAutoSaveTimerRef.current = null;
      }
      await adjUpdateMutation.mutateAsync({
        id: quoteId,
        deliveryAmount,
        travelAllowance,
        smallJobSurcharge: "0",
        constructionMgmtAmount,
        constructionMgmtPercent: "0",
        constructionMgmtOverride,
        complexityLoading,
        complexityOverride,
        councilFees,
        homeWarranty,
        otherCost: professionalCost,
        otherCostDescription: professionalCostDescription || "Professional Costs",
        includeDelivery: parseFloat(deliveryAmount) > 0,
        includeTravelAllowance: parseFloat(travelAllowance) > 0,
        includeSmallJobSurcharge: false,
        includeConstructionMgmt: parseFloat(constructionMgmtAmount) > 0,
      });
      // Step 0b: Flush pending spec auto-save timer (actual spec save happens via invalidate after recalc)
      if (autoSaveTimerRef?.current) {
        clearTimeout(autoSaveTimerRef.current);
        autoSaveTimerRef.current = null;
        // Force immediate spec save via the updateSpec mutation
        performAutoSaveRef.current?.();
        await new Promise(resolve => setTimeout(resolve, 800));
      }
      // Step 1: Recalculate travel (updates travelDistanceKm on the quote)
      if ((quote as any)?.siteAddress) {
        try {
          await calculateTravelMutation.mutateAsync({ quoteId });
        } catch {
          toast.warning("Travel distance could not be recalculated. Continuing with the current travel allowance.");
        }
      }
      // Step 2: Recalculate financials (uses updated travelDistanceKm for delivery)
      await recalcMutation.mutateAsync({ id: quoteId });
    } catch (err: any) {
      // Individual mutation onError handlers will show toasts
    }
  };

  // Adjustment form state
  const [deliveryAmount, setDeliveryAmount] = useState("0");
  const [deliveryOverride, setDeliveryOverride] = useState(false);
  const [travelAllowance, setTravelAllowance] = useState("0");
  const [constructionMgmtAmount, setConstructionMgmtAmount] = useState("0");
  const [constructionMgmtOverride, setConstructionMgmtOverride] = useState(false);
  const [complexityLoading, setComplexityLoading] = useState("0");
  const [complexityOverride, setComplexityOverride] = useState(false);
  const [councilFees, setCouncilFees] = useState("0");
  const [homeWarranty, setHomeWarranty] = useState("0");
  const [professionalCost, setProfessionalCost] = useState("0");
  const [professionalCostDescription, setProfessionalCostDescription] = useState("Professional Costs");

  // Load adjustment values from quote
  useEffect(() => {
    if (quote) {
      setDeliveryAmount((quote as any).deliveryAmount || "0");
      setDeliveryOverride(!!(quote as any).deliveryOverride);
      setTravelAllowance((quote as any).travelAllowance || "0");
      setConstructionMgmtAmount((quote as any).constructionMgmtAmount || "0");
      setConstructionMgmtOverride(!!(quote as any).constructionMgmtOverride);
      setComplexityLoading((quote as any).complexityLoading || "0");
      setComplexityOverride(!!(quote as any).complexityOverride);
      setCouncilFees((quote as any).councilFees || "0");
      setHomeWarranty((quote as any).homeWarranty || "0");
      setProfessionalCost((quote as any).otherCost || "0");
      setProfessionalCostDescription((quote as any).otherCostDescription || "Professional Costs");
    }
  }, [quote]);

  // Parse price settings from master data
  const priceSettings = useMemo(() => {
    if (!allMasterData) return { deliveryOptions: [] as { key: string; value: string }[], travelBands: [] as { key: string; value: string }[], constructionMgmtRates: [] as { key: string; value: string }[], complexity: [] as { key: string; value: string }[], councilFees: [] as { key: string; value: string }[], homeWarrantyTiers: HOW_TIERS as HowTier[], regionHowFlags: {} as Record<string, boolean> };
    const deliveryOptions = allMasterData.filter((d: any) => d.category === "delivery").sort((a: any, b: any) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)).map((d: any) => ({ key: d.key, value: d.value }));
    const travelBands = allMasterData.filter((d: any) => d.category === "travel_band").map((d: any) => ({ key: d.key, value: d.value }));
    const constructionMgmtRates = allMasterData.filter((d: any) => d.category === "construction_mgmt" || d.category === "construction_mgmt_rates").sort((a: any, b: any) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)).map((d: any) => ({ key: d.key, value: d.value }));
    const complexity = allMasterData.filter((d: any) => d.category === "complexity").map((d: any) => ({ key: d.key, value: d.value }));
    const councilFeesData = allMasterData.filter((d: any) => d.category === "council_fee").map((d: any) => ({ key: d.key, value: d.value }));
    const hwTiers = allMasterData.filter((d: any) => d.category === "home_warranty").sort((a: any, b: any) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
    const homeWarrantyTiers = hwTiers.length > 0 ? hwTiers.map((d: any) => parseHowTier(d.key, d.value)) : HOW_TIERS;
    const regionHowFlags: Record<string, boolean> = {};
    allMasterData.filter((d: any) => d.category === "region").forEach((d: any) => {
      const meta = d.metadata as any;
      if (meta && meta.howApplicable) regionHowFlags[d.key] = true;
    });
    return { deliveryOptions, travelBands, constructionMgmtRates, complexity, councilFees: councilFeesData, homeWarrantyTiers, regionHowFlags };
  }, [allMasterData]);

  // Auto-save adjustments with debounce (3s after last change)

  useEffect(() => {
    if (quote) {
      setTimeout(() => { adjHasLoadedRef.current = true; }, 1200);
    }
  }, [quote]);

  const performAdjSave = useCallback(() => {
    const travelChanged = (quote as any)?.travelDistanceKm && travelAllowance !== ((quote as any)?.travelAllowance || "0");
    setAdjSaveStatus("saving");
    adjUpdateMutation.mutate({
      id: quoteId,
      deliveryAmount,
      travelAllowance,
      smallJobSurcharge: "0",
      constructionMgmtAmount,
      constructionMgmtPercent: "0",
      constructionMgmtOverride,
      complexityLoading,
      complexityOverride,
      councilFees,
      homeWarranty,
      otherCost: professionalCost,
      otherCostDescription: professionalCostDescription || "Professional Costs",
      includeDelivery: parseFloat(deliveryAmount) > 0,
      includeTravelAllowance: parseFloat(travelAllowance) > 0,
      includeSmallJobSurcharge: false,
      includeConstructionMgmt: parseFloat(constructionMgmtAmount) > 0,
      ...(travelChanged ? { travelOverridden: true } : {}),
    }, {
      onSuccess: () => { setAdjSaveStatus("saved"); setTimeout(() => setAdjSaveStatus("idle"), 2000); },
      onError: () => { setAdjSaveStatus("idle"); },
    });
  }, [quoteId, deliveryAmount, travelAllowance, constructionMgmtAmount, constructionMgmtOverride, complexityLoading, complexityOverride, councilFees, homeWarranty, professionalCost, professionalCostDescription, adjUpdateMutation, quote]);

  useEffect(() => {
    if (!adjHasLoadedRef.current) return;
    if (adjAutoSaveTimerRef.current) clearTimeout(adjAutoSaveTimerRef.current);
    adjAutoSaveTimerRef.current = setTimeout(() => { performAdjSave(); }, 9000);
    return () => { if (adjAutoSaveTimerRef.current) clearTimeout(adjAutoSaveTimerRef.current); };
  }, [deliveryAmount, travelAllowance, constructionMgmtAmount, constructionMgmtOverride, complexityLoading, complexityOverride, councilFees, homeWarranty, professionalCost, professionalCostDescription]);

  const skipFormResetRef = useRef(false);
  const pendingAiDescRef = useRef<string | null>(null);
  const genDescMutation = trpc.assistant.generateDescription.useMutation({
    onSuccess: (data: any) => {
      if (data.description) {
        setForm(prev => ({ ...prev, descriptionOfWork: data.description }));
        toast.success("Description generated by AI");
        setShowRefinement(false);
        setRefinementInstruction("");
        // Mark that we have a pending AI description that needs immediate save
        // The actual save is triggered via the useEffect on form changes (debounced auto-save)
        // but we skip the next form reset from query invalidation
        skipFormResetRef.current = true;
        pendingAiDescRef.current = data.description;
      }
    },
  });

  // DOW groups for roof shape selector
  const { data: dowGroups } = trpc.assistant.listDowGroups.useQuery();

  // Save to master library mutation
  const saveToLibraryMutation = trpc.assistant.saveDescriptionToLibrary.useMutation({
    onSuccess: () => {
      toast.success("Description saved to master library");
      setSaveToLibraryGroup("");
      setShowSaveToLibrary(false);
    },
    onError: (err: any) => toast.error(err.message),
  });

  // Angle cutting cost auto-update mutation (fired when angle cutting metres change)
  const updateAngleCuttingCostMutation = trpc.specItems.updateAngleCuttingCost.useMutation({
    onSuccess: (data: any) => {
      if (data.success) {
        toast.success(data.message);
        utils.specItems.items.list.invalidate({ quoteId });
      } else {
        toast.info(data.message);
      }
    },
    onError: (err: any) => toast.error(`Angle cutting cost update failed: ${err.message}`),
  });

  // AI Description refinement state
  const [showRefinement, setShowRefinement] = useState(false);
  const [refinementInstruction, setRefinementInstruction] = useState("");
  const [selectedRoofShapeGroup, setSelectedRoofShapeGroup] = useState<string>("auto");
  const [showSaveToLibrary, setShowSaveToLibrary] = useState(false);
  const [saveToLibraryGroup, setSaveToLibraryGroup] = useState("");
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);
  const [templateFilterGroup, setTemplateFilterGroup] = useState<string>("all");
  const [templateSearchQuery, setTemplateSearchQuery] = useState("");
  const [editingTemplateKey, setEditingTemplateKey] = useState<string | null>(null);
  const [editingTemplateText, setEditingTemplateText] = useState("");

  // Fetch DOW items for template picker
  const { data: dowItems } = trpc.assistant.listDowItems.useQuery(undefined, { enabled: showTemplatePicker });

  // Fetch design advisors list for restricted dropdown
  const { data: designAdvisorsList } = trpc.designAdvisors.list.useQuery({ includePendingInvites: true });
  const designAdvisorNames = useMemo(() => designAdvisorsList?.map((da: any) => da.name) || [], [designAdvisorsList]);

  // Fetch the lead record to get the authoritative designAdvisor
  const leadId = (quote as any)?.clientId;
  const { data: leadData } = trpc.crm.leads.get.useQuery({ id: leadId! }, { enabled: !!leadId });

  // ─── Dynamic Spec Field Options (from product_tab metadata.specField mapping) ───
  const { data: specFieldData } = trpc.products.getSpecFieldOptions.useQuery();
  const specFieldOptions = specFieldData?.fields ?? specFieldData;
  const productColourGroups: Record<string, string> = (specFieldData as any)?.productColourGroups ?? {};
  const productColourGroupsBottom: Record<string, string> = (specFieldData as any)?.productColourGroupsBottom ?? {};

  // Helper: get categories for a given specField name
  const getSpecFieldCategories = useCallback((fieldName: string): FilteredSelectCategory[] => {
    if (!specFieldOptions || !(specFieldOptions as any)[fieldName]) return [];
    return (specFieldOptions as any)[fieldName].categories;
  }, [specFieldOptions]);

  // Helper: get all flat options for a specField (for fallback SelectField)
  const getSpecFieldAllOptions = useCallback((fieldName: string): string[] => {
    const cats = getSpecFieldCategories(fieldName);
    const opts: string[] = [];
    for (const cat of cats) {
      for (const opt of cat.options) {
        if (!opts.includes(opt)) opts.push(opt);
      }
    }
    return opts;
  }, [getSpecFieldCategories]);

  // Legacy fallback names (used if specField has no mapping yet)
  const roofProductNames = useMemo(() => getSpecFieldAllOptions("specRoofType"), [getSpecFieldAllOptions]);
  const postProductNames = useMemo(() => getSpecFieldAllOptions("specPostsType"), [getSpecFieldAllOptions]);
  const postFixingProductNames = useMemo(() => getSpecFieldAllOptions("specPostsFixing"), [getSpecFieldAllOptions]);
  const gutterProductNames = useMemo(() => getSpecFieldAllOptions("specGutterType"), [getSpecFieldAllOptions]);
  const downpipeProductNames = useMemo(() => getSpecFieldAllOptions("specDownpipeType"), [getSpecFieldAllOptions]);
  const wallProductNames = useMemo(() => getSpecFieldAllOptions("specWallType"), [getSpecFieldAllOptions]);
  const backChannelProductNames = useMemo(() => getSpecFieldAllOptions("specBackChannelType"), [getSpecFieldAllOptions]);
  const sideChannelsProductNames = useMemo(() => getSpecFieldAllOptions("specSideChannelsType"), [getSpecFieldAllOptions]);
  const flashingsProductNames = useMemo(() => getSpecFieldAllOptions("specFlashingsType"), [getSpecFieldAllOptions]);
  const bracketInfillProductNames = useMemo(() => getSpecFieldAllOptions("specBracketInfillType"), [getSpecFieldAllOptions]);
  const electricalLightProductNames = useMemo(() => getSpecFieldAllOptions("specElecLightType"), [getSpecFieldAllOptions]);
  const electricalFanProductNames = useMemo(() => getSpecFieldAllOptions("specElecFanType"), [getSpecFieldAllOptions]);
  const electricalLightOptions = useMemo(
    () => electricalLightProductNames.length > 0 ? electricalLightProductNames : ELECTRICAL_LIGHT_FALLBACK_OPTIONS,
    [electricalLightProductNames]
  );
  const electricalFanOptions = useMemo(
    () => electricalFanProductNames.length > 0 ? electricalFanProductNames : ELECTRICAL_FAN_FALLBACK_OPTIONS,
    [electricalFanProductNames]
  );
  const defaultElectricalLightType = electricalLightOptions[0] || "LED Downlight";
  const defaultElectricalFanType = electricalFanOptions[0] || "";

  // Category arrays for FilteredSelect (from dynamic specField mapping)
  const roofCategories = useMemo(() => getSpecFieldCategories("specRoofType"), [getSpecFieldCategories]);
  const postCategories = useMemo(() => getSpecFieldCategories("specPostsType"), [getSpecFieldCategories]);
  const postFixingCategories = useMemo(() => getSpecFieldCategories("specPostsFixing"), [getSpecFieldCategories]);
  const gutterCategories = useMemo(() => getSpecFieldCategories("specGutterType"), [getSpecFieldCategories]);
  const downpipeCategories = useMemo(() => getSpecFieldCategories("specDownpipeType"), [getSpecFieldCategories]);
  const wallCategories = useMemo(() => getSpecFieldCategories("specWallType"), [getSpecFieldCategories]);
  const beamCategories = useMemo(() => getSpecFieldCategories("specBeamSize"), [getSpecFieldCategories]);
  const backChannelCategories = useMemo(() => getSpecFieldCategories("specBackChannelType"), [getSpecFieldCategories]);
  const sideChannelsCategories = useMemo(() => getSpecFieldCategories("specSideChannelsType"), [getSpecFieldCategories]);
  const flashingsCategories = useMemo(() => getSpecFieldCategories("specFlashingsType"), [getSpecFieldCategories]);
  const bracketInfillCategories = useMemo(() => getSpecFieldCategories("specBracketInfillType"), [getSpecFieldCategories]);
  const electricalLightCategories = useMemo(() => getSpecFieldCategories("specElecLightType"), [getSpecFieldCategories]);
  const electricalFanCategories = useMemo(() => getSpecFieldCategories("specElecFanType"), [getSpecFieldCategories]);

  // Derive beam size options from product database, extracting just the dimension (e.g. "140×50")
  const dbSteelSizes = useMemo(() => {
    if (!beamCategories || beamCategories.length === 0) return ["140\u00d750", "150\u00d760", "200\u00d760"]; // fallback
    const steelCat = beamCategories.find((c: any) => c.label.toLowerCase().includes("steel"));
    if (!steelCat || steelCat.options.length === 0) return ["140\u00d750", "150\u00d760", "200\u00d760"];
    // Extract dimension from product name e.g. "Steel Roll Form Beam 140 x 50" -> "140×50"
    return steelCat.options.map((name: string) => {
      const match = name.match(/(\d+)\s*x\s*(\d+)/);
      return match ? `${match[1]}\u00d7${match[2]}` : name;
    });
  }, [beamCategories]);

  const dbAluSizes = useMemo(() => {
    if (!beamCategories || beamCategories.length === 0) return ["100\u00d750", "150\u00d750", "200\u00d750", "250\u00d750"]; // fallback
    const aluCat = beamCategories.find((c: any) => c.label.toLowerCase().includes("aluminium"));
    if (!aluCat || aluCat.options.length === 0) return ["100\u00d750", "150\u00d750", "200\u00d750", "250\u00d750"];
    // Extract dimension from product name e.g. "Beam 250 x 50 x 3" -> "250×50"
    // Filter out non-beam items (joiners, end caps, screen bars, cross bars)
    return aluCat.options
      .filter((name: string) => /beam\s+\d/i.test(name) && !/joiner|end cap|cross bar/i.test(name))
      .map((name: string) => {
        const match = name.match(/(\d+)\s*x\s*(\d+)/);
        return match ? `${match[1]}\u00d7${match[2]}` : name;
      });
  }, [beamCategories]);

  const skylightCategories = useMemo(() => getSpecFieldCategories("specSpanlitesType"), [getSpecFieldCategories]);

  // Fetch colour options from master data
  const { data: masterData } = trpc.masterData.getByCategory.useQuery(
    { category: "colour" },
    { refetchOnMount: "always", refetchOnWindowFocus: true },
  );
  const allColourOptions = useMemo(() => {
    if (!masterData) return [];
    return Array.from(new Set(masterData.map((d: any) => String(d.value || "").trim()).filter(Boolean))).sort();
  }, [masterData]);
  const validColourValues = useMemo(() => new Set(allColourOptions), [allColourOptions]);

  // Fetch colour groups and members for filtering
  const { data: colourGroupsList } = trpc.colourGroups.getAll.useQuery(undefined, {
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });
  const { data: allColourGroupMembers } = trpc.colourGroups.getAllMembers.useQuery(undefined, {
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });

  // Build a map of group name -> colour values
  const coloursByGroup = useMemo(() => {
    const map: Record<string, string[]> = {};
    if (colourGroupsList && allColourGroupMembers) {
      for (const g of colourGroupsList) {
        map[g.name] = allColourGroupMembers
          .filter(m => m.colourGroupId === g.id)
          .map(m => String(m.colourValue || "").trim())
          .filter(colour => colour && validColourValues.has(colour))
          .sort();
      }
    }
    return map;
  }, [colourGroupsList, allColourGroupMembers, validColourValues]);
  const productColourGroupsByLookup = useMemo(() => {
    const map: Record<string, string> = {};
    for (const [productName, groupName] of Object.entries(productColourGroups)) {
      if (!groupName) continue;
      const nameKey = normaliseLookupKey(productName);
      if (nameKey && !map[nameKey]) map[nameKey] = groupName;
      const dimensionKey = extractDimensionLookupKey(productName);
      if (dimensionKey && !map[dimensionKey]) map[dimensionKey] = groupName;
    }
    return map;
  }, [productColourGroups]);

  const isMobile = useIsMobile();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [form, setForm] = useState<Record<string, string>>({});
  const [activeSection, setActiveSection] = useState<string>("client");

  // ─── Per-quote section preferences (DB-backed, falls back to localStorage) ───
  const { data: quotePrefs, isLoading: prefsLoading } = trpc.sectionTemplates.getQuotePrefs.useQuery(
    { quoteId },
    { staleTime: 60_000 }
  );
  const saveQuotePrefsMutation = trpc.sectionTemplates.saveQuotePrefs.useMutation();
  const { data: sectionTemplatesList } = trpc.sectionTemplates.list.useQuery();
  const [activeTemplateId, setActiveTemplateId] = useState<number | null>(null);
  const [prefsInitialized, setPrefsInitialized] = useState(false);

  const [sectionOrder, setSectionOrder] = useState<string[]>(() => loadSectionOrder());
  const [hiddenSections, setHiddenSections] = useState<Set<string>>(() => loadHiddenSections());

  // Load per-quote prefs from DB when available (overrides localStorage)
  useEffect(() => {
    if (prefsLoading || prefsInitialized) return;
    if (quotePrefs) {
      if (quotePrefs.sectionOrder && quotePrefs.sectionOrder.length > 0) {
        setSectionOrder(ensureDefaultSections(quotePrefs.sectionOrder));
      }
      if (quotePrefs.hiddenSections) {
        setHiddenSections(new Set(quotePrefs.hiddenSections));
      }
      if (quotePrefs.templateId) {
        setActiveTemplateId(quotePrefs.templateId);
      }
    }
    setPrefsInitialized(true);
  }, [prefsLoading, quotePrefs, prefsInitialized]);

  // Auto-save prefs to quote (debounced)
  const prefsSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savePrefsToQuote = useCallback((order: string[], hidden: Set<string>, templateId: number | null) => {
    if (prefsSaveTimerRef.current) clearTimeout(prefsSaveTimerRef.current);
    prefsSaveTimerRef.current = setTimeout(() => {
      saveQuotePrefsMutation.mutate({
        quoteId,
        sectionOrder: order,
        hiddenSections: Array.from(hidden),
        templateId,
      });
    }, 9000);
  }, [quoteId, saveQuotePrefsMutation]);

  // Also persist to localStorage as fallback
  useEffect(() => {
    if (!prefsInitialized) return;
    saveSectionOrder(sectionOrder);
  }, [sectionOrder, prefsInitialized]);
  useEffect(() => {
    if (!prefsInitialized) return;
    saveHiddenSections(hiddenSections);
  }, [hiddenSections, prefsInitialized]);

  const handleReorder = useCallback((newOrder: string[]) => {
    setSectionOrder(newOrder);
    setHiddenSections(prev => {
      savePrefsToQuote(newOrder, prev, activeTemplateId);
      return prev;
    });
  }, [savePrefsToQuote, activeTemplateId]);

  const handleToggleHidden = useCallback((id: string) => {
    setHiddenSections(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      savePrefsToQuote(sectionOrder, next, activeTemplateId);
      return next;
    });
  }, [sectionOrder, savePrefsToQuote, activeTemplateId]);

  const handleResetPreferences = useCallback(() => {
    resetAllPreferences();
    const defaultOrder = [...DEFAULT_SECTION_ORDER];
    setSectionOrder(defaultOrder);
    setHiddenSections(new Set());
    setActiveTemplateId(null);
    savePrefsToQuote(defaultOrder, new Set(), null);
    toast.success("Section order reset to default");
  }, [savePrefsToQuote]);

  // Apply a section template to this quote
  const handleApplyTemplate = useCallback((templateId: number) => {
    const template = sectionTemplatesList?.find(t => t.id === templateId);
    if (!template) return;
    const hidden = new Set<string>(template.hiddenSections as string[]);
    const order = ensureDefaultSections((template.sectionOrder as string[] | null) || [...DEFAULT_SECTION_ORDER]);
    setSectionOrder(order);
    setHiddenSections(hidden);
    setActiveTemplateId(templateId);
    savePrefsToQuote(order, hidden, templateId);
    toast.success(`Template "${template.name}" applied`);
  }, [sectionTemplatesList, savePrefsToQuote]);

  // ─── Copy Layout from Another Quote ───
  const [showCopyDialog, setShowCopyDialog] = useState(false);
  const [copySearchTerm, setCopySearchTerm] = useState("");
  const { data: allQuotesList } = trpc.quotes.list.useQuery(
    { search: copySearchTerm || undefined },
    { enabled: showCopyDialog }
  );

  const handleCopyFromQuote = useCallback(async (sourceQuoteId: number) => {
    try {
      const prefs = await utils.client.sectionTemplates.getQuotePrefs.query({ quoteId: sourceQuoteId });
      if (!prefs || (!prefs.sectionOrder?.length && !prefs.hiddenSections?.length)) {
        toast.error("That quote has no custom section layout to copy");
        return;
      }
      const order = ensureDefaultSections(prefs.sectionOrder?.length ? prefs.sectionOrder : [...DEFAULT_SECTION_ORDER]);
      const hidden = new Set<string>(prefs.hiddenSections || []);
      setSectionOrder(order);
      setHiddenSections(hidden);
      setActiveTemplateId(prefs.templateId || null);
      savePrefsToQuote(order, hidden, prefs.templateId || null);
      setShowCopyDialog(false);
      toast.success("Section layout copied from quote");
    } catch {
      toast.error("Failed to load layout from that quote");
    }
  }, [utils, savePrefsToQuote]);

  // Build ordered visible sections for navigation
  const sectionMap = useMemo(() => new Map(SECTIONS.map(s => [s.id as string, s])), []);
  const orderedVisibleSections = useMemo(() => {
    return sectionOrder
      .filter(id => !hiddenSections.has(id) && sectionMap.has(id))
      .map(id => sectionMap.get(id)!)
  }, [sectionOrder, hiddenSections, sectionMap]);

  // Derive openSections from activeSection for Accordion compatibility
  const openSections = useMemo(() => [activeSection], [activeSection]);
  const setOpenSections = useCallback((val: string[] | ((prev: string[]) => string[])) => {
    const newVal = typeof val === "function" ? val([activeSection]) : val;
    if (newVal.length > 0) {
      const newSection = newVal.find(s => s !== activeSection) || newVal[0];
      setActiveSection(newSection);
    }
  }, [activeSection]);
  const [categoryFilter, setCategoryFilter] = useState<string>("all");

  // ─── JSON-backed state for complex fields ───
  type LightTypeRow = { type: string; qty: number };
  type GpoRow = { type: "Single GPO" | "Double GPO"; location: "Indoor" | "Outdoor"; qty: number; onIwp?: boolean };
  type BeamEntry = { type: "Steel" | "Aluminium"; size: string; lm: number };
  type ElecExtraItem = CheckItem & { task: string; responsibility: "" | "By Builder" | "By Client" };
  type WindowEntry = { style: "Sliding" | "Awning" | "Fixed"; height: number; width: number; qty: number; screen?: string };

  const WINDOW_HEIGHTS = [600, 800, 900, 1000, 1200, 1300, 1400, 1500, 1800, 2000, 2100];
  const WINDOW_WIDTHS = [600, 700, 800, 900, 1200, 1300, 1400, 1500, 1600, 1800, 2100, 2200, 2400, 2700];

  type DoorEntry = { style: "Sliding" | "Hinged" | "Bi-fold" | "Stacker"; height: number; width: number; qty: number; panels?: number; screen?: string };
  type IwpEntry = { type: string; width: number; height: number; outsideColour: string; outsideFinish: string; insideColour: string; insideFinish: string; wallSides?: string };
  const SCREEN_OPTIONS = ["N/A", "Fly", "Pet", "Diamond", "Security", "Invis-gard"];
  const DOOR_HEIGHTS = [2100, 2400];
  const DOOR_WIDTHS = [1500, 1600, 1800, 2100, 2200, 2400, 2700, 2900, 3200, 3300, 3500, 3600, 4200, 4300, 4800];
  const STACKER_DOOR_WIDTHS = [2100, 2700, 3100, 3200, 3600, 4200, 5300, 6200];
  const BIFOLD_DOOR_WIDTHS = [1300, 1500, 1700, 1900, 2200, 2500, 2600, 3000, 3200, 3400, 3700, 3800, 4200, 4400, 5000, 5100, 5800];
  const BIFOLD_PANELS_MAP: Record<number, number[]> = {
    1300: [3], 1500: [3], 1700: [3], 1900: [3], 2200: [3], 2500: [3],
    2600: [3, 4], 3000: [4], 3200: [4, 5, 6], 3400: [4, 5, 6],
    3700: [5, 6], 3800: [6], 4200: [5, 6], 4400: [7], 5000: [7], 5100: [7], 5800: [7],
  };
  const checklistLabel = (row: CheckItem) => row.item || row.task || "";
  const checklistDetail = (row: CheckItem) => [
    row.responsibility,
    row.qty !== undefined && row.qty !== "" ? `${row.qty} ${row.unit || "ea"}` : "",
    row.notes,
  ].filter(Boolean).join(" - ");

  const [iwpEntries, setIwpEntries] = useState<IwpEntry[]>([]);
  const [wallWorkItems, setWallWorkItems] = useState<CheckItem[]>([]);
  const [existingChecks, setExistingChecks] = useState<CheckItem[]>([]);
  const [plumbChecks, setPlumbChecks] = useState<CheckItem[]>([]);
  const [stairsChecks, setStairsChecks] = useState<CheckItem[]>([]);
  const [concreteChecks, setConcreteChecks] = useState<CheckItem[]>([]);
  const [elecLightTypes, setElecLightTypes] = useState<LightTypeRow[]>([]);
  const [elecGpos, setElecGpos] = useState<GpoRow[]>([]);
  const [beamEntries, setBeamEntries] = useState<BeamEntry[]>([]);
  const [elecExtraWork, setElecExtraWork] = useState<ElecExtraItem[]>([]);
  const [floorWorkItems, setFloorWorkItems] = useState<ElecExtraItem[]>([]);
  const [demolitionWorkItems, setDemolitionWorkItems] = useState<CheckItem[]>([]);
  const [windowEntries, setWindowEntries] = useState<WindowEntry[]>([]);
  const [doorEntries, setDoorEntries] = useState<DoorEntry[]>([]);
  const beamColourLookupValue = form.specBeamSize || beamEntries.find(entry => entry.size)?.size || "";
  const backChannelColourLookupValue = form.specBackChannelType || beamColourLookupValue;
  const sideChannelsColourLookupValue = form.specSideChannelsType || beamColourLookupValue;
  const flashingsColourLookupValue = form.specFlashingsType || beamColourLookupValue;
  const bracketInfillColourLookupValue = form.specBracketInfillType || "";
  const beamPositionList = useMemo(() => (form.specBeamPositions || "").split(";").filter(Boolean), [form.specBeamPositions]);
  const postPositionList = useMemo(() => (form.specPostPositions || "").split(",").filter(Boolean), [form.specPostPositions]);
  const houseWallList = useMemo(() => (form.specHouseWalls || "").split(",").filter(Boolean), [form.specHouseWalls]);
  const beamMountedPostLoadSummary = useMemo(() => (
    validateBeamMountedPostLoads({
      structureWidthMm: ((parseFloat(form.specWidth || "0") || 0) * 1000),
      structureLengthMm: ((parseFloat(form.specLength || "0") || 0) * 1000),
      postPositions: postPositionList,
      beamPositions: beamPositionList,
      beamEntries,
      fallbackBeamSize: form.specBeamSize || "",
      windCat: form.specWindCat || "",
      cpn: form.specCpn || "",
    })
  ), [
    form.specWidth,
    form.specLength,
    form.specBeamSize,
    form.specWindCat,
    form.specCpn,
    postPositionList,
    beamPositionList,
    beamEntries,
  ]);
  const bracketInfillOptions = bracketInfillProductNames.length > 0 ? bracketInfillProductNames : BRACKET_INFILL_FALLBACK_OPTIONS;
  const totalElecLights = useMemo(
    () => elecLightTypes.reduce((sum, row) => sum + (Number(row.qty) || 0), 0),
    [elecLightTypes]
  );
  const legacyElecLightType = useMemo(() => {
    const uniqueTypes = Array.from(new Set(elecLightTypes.map(row => row.type).filter(Boolean)));
    return uniqueTypes.length === 1 ? uniqueTypes[0] : "";
  }, [elecLightTypes]);

  const deriveBeamEntriesFromPlacement = useCallback((entries: BeamEntry[], positions = beamPositionList) => (
    syncBeamEntriesToPlacement(entries, positions, houseWallList, form.specWidth || "", form.specLength || "")
  ), [beamPositionList, houseWallList, form.specWidth, form.specLength]);

  useEffect(() => {
    setBeamEntries(prev => deriveBeamEntriesFromPlacement(prev));
  }, [deriveBeamEntriesFromPlacement]);

  // ─── Checklist Pricing Selections ───
  type ChecklistSelection = { itemId: number; label: string; unitPrice: number; qty: number; total: number; section: string; unit: string };
  const [checklistSelections, setChecklistSelections] = useState<ChecklistSelection[]>([]);
  const { data: activeChecklistItems } = trpc.checklistItems.listActive.useQuery();
  const activeAdditionalCostItems = useMemo(
    () => (activeChecklistItems || []).filter((item) => isPricedAdditionalCostSection(item.section)),
    [activeChecklistItems],
  );
  const { data: tenantChecklistDefaults = [] } = trpc.checklistDefaults.listActive.useQuery(undefined, { staleTime: 60_000 });
  const checklistDefaultsBySection = useMemo<Record<string, CheckItem[]>>(() => {
    return tenantChecklistDefaults.reduce<Record<string, CheckItem[]>>((acc, row) => {
      if (!row.section || !row.label) return acc;
      const defaults = acc[row.section] ?? [];
      defaults.push(checklistDefaultFromLabel(row.section, row.label, {
        notes: row.notes || "",
        responsibility: (row.responsibility || "") as "" | "By Builder" | "By Client",
        unit: row.unit || "ea",
        productMatch: row.productMatch || "",
      }) as CheckItem);
      acc[row.section] = defaults;
      return acc;
    }, {});
  }, [tenantChecklistDefaults]);
  const defaultChecklistItems = useCallback((section: string): CheckItem[] => {
    const tenantDefaults = checklistDefaultsBySection[section];
    if (tenantDefaults?.length) return tenantDefaults.map((row) => ({ ...row }));
    return getBuiltinWorkChecklistDefaults(section).map((row) => ({ ...row })) as CheckItem[];
  }, [checklistDefaultsBySection]);

  // Filter sections by category (legacy compat) + use ordered visible sections
  const filteredSections = useMemo(() => {
    return orderedVisibleSections as unknown as typeof SECTIONS;
  }, [orderedVisibleSections]);

  const isSectionVisible = useCallback((sectionId: string) => {
    return sectionId === activeSection && !hiddenSections.has(sectionId);
  }, [activeSection, hiddenSections]);

  // Fetch global colour palette settings (managed in Sales Data > Settings)
  const { data: globalColourPalette } = trpc.globalSettings.getColourPalette.useQuery();

  // Default colour group from global settings
  const defaultColourGroup = globalColourPalette?.defaultGroup || "";

  // Helper: get the effective colour groups for a section from global settings
  const getColourGroupsForSection = useCallback((section: string): string[] => {
    const override = globalColourPalette?.sectionOverrides?.[section];
    if (override) {
      return override.split(",").map(s => s.trim()).filter(Boolean);
    }
    return defaultColourGroup ? [defaultColourGroup] : [];
  }, [globalColourPalette, defaultColourGroup]);
  const resolveColourGroupName = useCallback((groupName?: string | null) => {
    const raw = (groupName || "").trim();
    if (!raw) return "";
    if (coloursByGroup[raw]) return raw;
    const normalised = normaliseLookupKey(raw);
    return Object.keys(coloursByGroup).find(name => normaliseLookupKey(name) === normalised) || raw;
  }, [coloursByGroup]);
  const getColourValuesForGroup = useCallback((groupName?: string | null) => {
    const resolved = resolveColourGroupName(groupName);
    return resolved ? coloursByGroup[resolved] || [] : [];
  }, [coloursByGroup, resolveColourGroupName]);

  // Helper: get filtered colours for a section with group prefix labels
  const getColoursForSection = useCallback((section: string): { label: string; value: string; group: string }[] => {
    const groups = getColourGroupsForSection(section);
    if (groups.length === 0) {
      return allColourOptions.map(c => ({ label: c, value: c, group: "" }));
    }
    if (groups.length === 1) {
      const g = resolveColourGroupName(groups[0]);
      const colours = getColourValuesForGroup(g);
      if (colours.length === 0) return allColourOptions.map(c => ({ label: c, value: c, group: "" }));
      return colours.map(c => ({ label: `${g} - ${c}`, value: c, group: g }));
    }
    const result: { label: string; value: string; group: string }[] = [];
    for (const group of groups) {
      const g = resolveColourGroupName(group);
      const colours = getColourValuesForGroup(g);
      for (const c of colours) {
        result.push({ label: `${g} - ${c}`, value: c, group: g });
      }
    }
    return result.length > 0 ? result : allColourOptions.map(c => ({ label: c, value: c, group: "" }));
  }, [getColourGroupsForSection, resolveColourGroupName, getColourValuesForGroup, allColourOptions]);

  // Helper: get colours filtered by the selected product's colour group
  // Falls back to getColoursForSection if no product is selected or product has no colour group
  const getColoursForProduct = useCallback((productName: string | undefined, sectionFallback: string): { label: string; value: string; group: string }[] => {
    if (productName) {
      const groupName = productColourGroups[productName]
        || productColourGroupsByLookup[normaliseLookupKey(productName)]
        || productColourGroupsByLookup[extractDimensionLookupKey(productName)];
      const resolvedGroupName = resolveColourGroupName(groupName);
      const colours = getColourValuesForGroup(resolvedGroupName);
      if (colours.length > 0) {
        return colours.map(c => ({ label: c, value: c, group: resolvedGroupName }));
      }
    }
    // Fallback to section-based colour filtering
    return getColoursForSection(sectionFallback);
  }, [productColourGroups, productColourGroupsByLookup, resolveColourGroupName, getColourValuesForGroup, getColoursForSection]);

  // Get colours for the bottom/ceiling side of a product (uses colourGroupBottom if set, otherwise falls back to colourGroup)
  const getColoursForProductBottom = useCallback((productName: string | undefined, sectionFallback: string): { label: string; value: string; group: string }[] => {
    if (productName && productColourGroupsBottom[productName]) {
      const groupName = resolveColourGroupName(productColourGroupsBottom[productName]);
      const colours = getColourValuesForGroup(groupName);
      if (colours.length > 0) {
        return colours.map(c => ({ label: c, value: c, group: groupName }));
      }
    }
    // Fallback to the top colour group (same as getColoursForProduct)
    return getColoursForProduct(productName, sectionFallback);
  }, [productColourGroupsBottom, resolveColourGroupName, getColourValuesForGroup, getColoursForProduct]);

  // Legacy: colourOptions for backward compatibility
  const colourOptions = useMemo(() => {
    if (!defaultColourGroup || !coloursByGroup[defaultColourGroup]) return allColourOptions;
    return coloursByGroup[defaultColourGroup];
  }, [defaultColourGroup, coloursByGroup, allColourOptions]);

  const printRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (quote) {
      // Skip form reset if we just did an AI-generated save to prevent race condition
      if (skipFormResetRef.current) {
        skipFormResetRef.current = false;
        return;
      }
      const f: Record<string, string> = {};
      Object.entries(quote).forEach(([k, v]) => {
        if (typeof v === "string" || v === null) f[k] = v || "";
      });
      // Auto-populate Design Adviser: prefer lead record's designAdvisor, fallback to quote's designAdvisor
      if (!f.specDesignAdviser) {
        const leadAdvisor = (leadData as any)?.designAdvisor;
        const quoteAdvisor = (quote as any).designAdvisor;
        if (leadAdvisor) {
          f.specDesignAdviser = leadAdvisor;
        } else if (quoteAdvisor) {
          f.specDesignAdviser = quoteAdvisor;
        }
      }
      // Note: colour group overrides are now managed globally in Sales Data > Settings
      setForm(f);

      // Load JSON-backed fields
      const q = quote as any;
      if (q.specIwpEntries && Array.isArray(q.specIwpEntries)) {
        setIwpEntries(q.specIwpEntries);
      }
      if (q.specWallWorkItems && Array.isArray(q.specWallWorkItems)) {
        setWallWorkItems(q.specWallWorkItems);
      }
      if (q.specExistingChecks && Array.isArray(q.specExistingChecks)) {
        setExistingChecks(q.specExistingChecks);
      }
      if (q.specPlumbChecks && Array.isArray(q.specPlumbChecks)) {
        setPlumbChecks(q.specPlumbChecks);
      }
      if (q.specElecLightTypes && Array.isArray(q.specElecLightTypes)) {
        setElecLightTypes(q.specElecLightTypes);
      }
      if (q.specElecGpos && Array.isArray(q.specElecGpos)) {
        setElecGpos(q.specElecGpos);
      }
      if (q.specBeamEntries && Array.isArray(q.specBeamEntries)) {
        setBeamEntries(q.specBeamEntries);
      }
      if (q.specStairsChecks && Array.isArray(q.specStairsChecks)) {
        setStairsChecks(q.specStairsChecks);
      }
      if (q.specConcreteItemChecks && Array.isArray(q.specConcreteItemChecks)) {
        setConcreteChecks(q.specConcreteItemChecks);
      }
      if (q.specElecExtraWork && Array.isArray(q.specElecExtraWork)) {
        setElecExtraWork(q.specElecExtraWork);
      }
      if (q.specWindowEntries && Array.isArray(q.specWindowEntries)) {
        setWindowEntries(q.specWindowEntries);
      }
      if (q.specDoorEntries && Array.isArray(q.specDoorEntries)) {
        setDoorEntries(q.specDoorEntries);
      }
      if (q.specFloorWorkItems && Array.isArray(q.specFloorWorkItems)) {
        setFloorWorkItems(q.specFloorWorkItems);
      }
      if (q.specDemolitionWorkItems && Array.isArray(q.specDemolitionWorkItems)) {
        setDemolitionWorkItems(q.specDemolitionWorkItems);
      }
      if (q.specChecklistSelections && Array.isArray(q.specChecklistSelections)) {
        setChecklistSelections(q.specChecklistSelections);
      }
    }
  }, [quote, leadData]);

  const update = useCallback((key: string, value: string) => setForm(prev => ({ ...prev, [key]: value })), []);
  const cutBackEaveValue = normalizeCutBackEaveOption(form.specCutBackEave);
  const displayedBracketAttachmentMethod = form.specBracketAttachmentMethod || inferBracketAttachmentMethod(form);
  const displayedNumberOfBrackets = form.specNumberOfBrackets || bracketQuantityForMethod(form, displayedBracketAttachmentMethod);
  const isFreeStandingStructure = form.specFreeStanding === "Yes";
  const activeBracketMethod = displayedBracketAttachmentMethod && displayedBracketAttachmentMethod !== "None" ? displayedBracketAttachmentMethod : "";
  const showGableBracketOptions = !isFreeStandingStructure && activeBracketMethod === "Gable brackets";
  const showPopupBracketOptions = !isFreeStandingStructure && activeBracketMethod === "popup brackets";
  const showWallBracketOptions = !isFreeStandingStructure && activeBracketMethod === "wall brackets";
  const updateFreeStanding = useCallback((value: string) => {
    setForm(prev => {
      if (value === "Yes") {
        return {
          ...clearBracketMethodOptions(prev),
          specFreeStanding: "Yes",
          specAttachmentMethod: "",
        };
      }
      return { ...prev, specFreeStanding: value };
    });
  }, []);
  const updateAttachedSideCount = useCallback((value: string) => {
    setForm(prev => {
      if (value === "") {
        return {
          ...clearBracketMethodOptions(prev),
          specAttachmentMethod: "",
        };
      }
      return { ...prev, specAttachmentMethod: value };
    });
  }, []);
  const updateBracketAttachmentMethod = useCallback((method: string) => {
    setForm(prev => applyBracketMethod(prev, method));
  }, []);
  const updateNumberOfBrackets = useCallback((quantity: string) => {
    setForm(prev => {
      const method = prev.specBracketAttachmentMethod || inferBracketAttachmentMethod(prev);
      if (!method || method === "None") {
        return { ...prev, specNumberOfBrackets: quantity };
      }
      return applyBracketMethod({ ...prev, specNumberOfBrackets: quantity }, method);
    });
  }, []);

  const stairInputs = useMemo(() => buildStructureStairInputs(form), [form]);
  const stairResult = useMemo(() => calculateStairs(stairInputs), [stairInputs]);
  const updateStairInput = useCallback(<K extends keyof StairInputs>(key: K, value: StairInputs[K]) => {
    setForm(prev => {
      const current = buildStructureStairInputs(prev);
      const nextInputs: StairInputs = { ...current, [key]: value };
      if (key === "stairType") {
        nextInputs.flights = value === "straight" ? 1 : 2;
      }
      const nextResult = calculateStairs(nextInputs);
      return {
        ...prev,
        specStairsType: optionLabel(STAIR_TYPE_OPTIONS, nextInputs.stairType),
        specStairsTotalRise: String(nextInputs.totalRise),
        specStairsWidth: String(nextInputs.stairWidth),
        specStairsRiserHeight: String(nextInputs.targetRiser),
        specStairsGoingDepth: String(nextInputs.targetGoing),
        specStairsNosingOverhang: String(nextInputs.nosing),
        specStairsLandingDepth: String(nextInputs.landingDepth),
        specStairsFlights: String(nextInputs.flights),
        specStairsTreads: optionLabel(STAIR_TREAD_OPTIONS, nextInputs.treadMaterial),
        specStairsRiser: optionLabel(STAIR_RISER_OPTIONS, nextInputs.riserStyle),
        specStairsStringer: optionLabel(STAIR_STRINGER_OPTIONS, nextInputs.stringerMaterial),
        specStairsHandrail: optionLabel(STAIR_HANDRAIL_OPTIONS, nextInputs.handrailStyle),
        specStairsSteps: String(nextResult.geometry.numberOfGoings),
        specStairsGoings: String(nextResult.geometry.numberOfGoings),
        specStairsActualRiser: formatStairNumber(nextResult.geometry.actualRiser),
        specStairsTotalRun: String(nextResult.geometry.totalGoing),
        specStairsStringerLength: String(nextResult.geometry.stringerLength),
        specStairsAngle: formatStairNumber(nextResult.geometry.stairAngle),
      };
    });
  }, []);

  // Auto-set Box Gutter Overflow to "Yes" when gutter type includes "box"
  useEffect(() => {
    const isBox = (form.specGutterType || "").toLowerCase().includes("box");
    if (isBox && form.specOverflow !== "Yes") {
      setForm(prev => ({ ...prev, specOverflow: "Yes" }));
    } else if (!isBox && form.specOverflow) {
      setForm(prev => ({ ...prev, specOverflow: "" }));
    }
  }, [form.specGutterType]);

  // Helper: recalculate Total Gutter Length from active sides and given width/length (in metres, stored as mm)
  const recalcGutterLength = useCallback((widthM: string, lengthM: string, gutterSidesStr: string) => {
    const sides = gutterSidesStr.split(",").filter(Boolean);
    if (sides.length === 0) return;
    const w = parseFloat(widthM || "0") || 0;
    const l = parseFloat(lengthM || "0") || 0;
    let total = 0;
    sides.forEach((s) => {
      if (s === "A-B" || s === "C-D") total += w;
      else if (s === "B-C" || s === "D-A") total += l;
    });
    if (total > 0) setForm(prev => ({ ...prev, specBoxGutter: String(Math.round(total)) }));
  }, []);

  // ─── Debounced Auto-Save ───────────────────────────────────────────────────
  const [autoSaveStatus, setAutoSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const formRef = useRef(form);
  formRef.current = form;
  const hasLoadedRef = useRef(false);

  // Track whether initial load has completed (don't auto-save on first mount)
  useEffect(() => {
    if (quote) {
      setTimeout(() => { hasLoadedRef.current = true; }, 1000);
    }
  }, [quote]);

  // Debounced auto-save: triggers 9 seconds after last change
  // Exception: AI-generated descriptions save immediately (50ms) to prevent race condition
  useEffect(() => {
    if (!hasLoadedRef.current) return;
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    const delay = pendingAiDescRef.current ? 50 : 9000;
    autoSaveTimerRef.current = setTimeout(() => {
      pendingAiDescRef.current = null;
      performAutoSave();
    }, delay);
    return () => { if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current); };
  }, [form, iwpEntries, wallWorkItems, existingChecks, plumbChecks, stairsChecks, concreteChecks, elecLightTypes, elecGpos, beamEntries, elecExtraWork, floorWorkItems, demolitionWorkItems, windowEntries, doorEntries, checklistSelections]);

  const performAutoSave = useCallback(() => {
    const currentForm = formRef.current;
    const decimalFields = ["specWidth", "specLength"];
    const specFields: Record<string, any> = {};
    Object.entries(currentForm).forEach(([k, v]) => {
      if (k.startsWith("specColourGroup_")) return; // Skip - now managed globally
      if (k.startsWith("spec") || k === "descriptionOfWork" || k === "localCouncil") {
        if (decimalFields.includes(k)) {
          specFields[k] = v && v.trim() !== "" ? v : null;
        } else {
          specFields[k] = v || null;
        }
      }
    });
    // Include JSON-backed fields
    specFields.specIwpEntries = iwpEntries.length > 0 ? iwpEntries : null;
    specFields.specWallWorkItems = wallWorkItems.length > 0 ? wallWorkItems : null;
    specFields.specExistingChecks = existingChecks.length > 0 ? existingChecks : null;
    specFields.specPlumbChecks = plumbChecks.length > 0 ? plumbChecks : null;
    specFields.specElecLightTypes = elecLightTypes.length > 0 ? elecLightTypes : null;
    specFields.specElecLights = totalElecLights > 0 ? String(totalElecLights) : null;
    specFields.specElecLightType = legacyElecLightType || null;
    specFields.specElecGpos = elecGpos.length > 0 ? elecGpos : null;
    specFields.specBeamEntries = beamEntries.length > 0 ? beamEntries : null;
    specFields.specStairsChecks = stairsChecks.length > 0 ? stairsChecks : null;
    specFields.specConcreteItemChecks = concreteChecks.length > 0 ? concreteChecks : null;
    specFields.specElecExtraWork = elecExtraWork.length > 0 ? elecExtraWork : null;
    specFields.specFloorWorkItems = floorWorkItems.length > 0 ? floorWorkItems : null;
    specFields.specDemolitionWorkItems = demolitionWorkItems.length > 0 ? demolitionWorkItems : null;
    specFields.specWindowEntries = windowEntries.length > 0 ? windowEntries : null;
    specFields.specDoorEntries = doorEntries.length > 0 ? doorEntries : null;
    specFields.specChecklistSelections = checklistSelections.length > 0 ? checklistSelections : null;

    setAutoSaveStatus("saving");
    updateMutation.mutate({ id: quoteId, data: specFields }, {
      onSuccess: () => {
        setAutoSaveStatus("saved");
        setTimeout(() => setAutoSaveStatus("idle"), 2000);
      },
      onError: () => {
        setAutoSaveStatus("idle");
      },
    });
  }, [quoteId, updateMutation, iwpEntries, wallWorkItems, existingChecks, plumbChecks, stairsChecks, concreteChecks, elecLightTypes, totalElecLights, legacyElecLightType, elecGpos, beamEntries, elecExtraWork, floorWorkItems, demolitionWorkItems, windowEntries, doorEntries, checklistSelections]);
  performAutoSaveRef.current = performAutoSave;

  // Validation: required fields for the spec sheet
  const REQUIRED_FIELDS: { key: string; label: string }[] = [
    { key: "specWidth", label: "Width" },
    { key: "specLength", label: "Length" },
  ];
  const [validationErrors, setValidationErrors] = useState<Set<string>>(new Set());

  const handleSave = () => {
    if (adjAutoSaveTimerRef.current) {
      clearTimeout(adjAutoSaveTimerRef.current);
      adjAutoSaveTimerRef.current = null;
    }

    // Check required fields
    const missing = REQUIRED_FIELDS.filter(f => !form[f.key] || form[f.key].trim() === "");
    if (missing.length > 0) {
      setValidationErrors(new Set(missing.map(f => f.key)));
      toast.warning(`Required fields missing: ${missing.map(f => f.label).join(", ")}`, {
        description: "Please fill in the highlighted fields before saving.",
      });
    } else {
      setValidationErrors(new Set());
    }

    const decimalFields = ["specWidth", "specLength"];
    const specFields: Record<string, any> = {};
    Object.entries(form).forEach(([k, v]) => {
      if (k.startsWith("specColourGroup_")) return; // Skip - now managed globally
      if (k.startsWith("spec") || k === "descriptionOfWork" || k === "localCouncil") {
        if (decimalFields.includes(k)) {
          specFields[k] = v && v.trim() !== "" ? v : null;
        } else {
          specFields[k] = v || null;
        }
      }
    });
    // Include JSON-backed fields
    specFields.specIwpEntries = iwpEntries.length > 0 ? iwpEntries : null;
    specFields.specWallWorkItems = wallWorkItems.length > 0 ? wallWorkItems : null;
    specFields.specExistingChecks = existingChecks.length > 0 ? existingChecks : null;
    specFields.specPlumbChecks = plumbChecks.length > 0 ? plumbChecks : null;
    specFields.specElecLightTypes = elecLightTypes.length > 0 ? elecLightTypes : null;
    specFields.specElecLights = totalElecLights > 0 ? String(totalElecLights) : null;
    specFields.specElecLightType = legacyElecLightType || null;
    specFields.specElecGpos = elecGpos.length > 0 ? elecGpos : null;
    specFields.specBeamEntries = beamEntries.length > 0 ? beamEntries : null;
    specFields.specStairsChecks = stairsChecks.length > 0 ? stairsChecks : null;
    specFields.specConcreteItemChecks = concreteChecks.length > 0 ? concreteChecks : null;
    specFields.specElecExtraWork = elecExtraWork.length > 0 ? elecExtraWork : null;
    specFields.specFloorWorkItems = floorWorkItems.length > 0 ? floorWorkItems : null;
    specFields.specDemolitionWorkItems = demolitionWorkItems.length > 0 ? demolitionWorkItems : null;
    specFields.specWindowEntries = windowEntries.length > 0 ? windowEntries : null;
    specFields.specDoorEntries = doorEntries.length > 0 ? doorEntries : null;
    specFields.specChecklistSelections = checklistSelections.length > 0 ? checklistSelections : null;

    performAdjSave();
    updateMutation.mutate({ id: quoteId, data: specFields });
  };

  const handleExportPDF = () => {
    if (!printRef.current) return;
    const printWindow = window.open("", "_blank");
    if (!printWindow) { toast.error("Please allow popups to export PDF"); return; }
    const content = printRef.current.innerHTML;
    printWindow.document.write(`<!DOCTYPE html><html><head><title>Project Specification Sheet - ${form.clientName || "Quote"}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');
  @page { size: A4 portrait; margin: 10mm; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Inter', sans-serif; font-size: 9pt; color: #1a1a1a; padding: 10mm; line-height: 1.4; width: 210mm; min-height: 297mm; }
  .spec-header { text-align: center; border-bottom: 2px solid #1a1a1a; padding-bottom: 8px; margin-bottom: 12px; }
  .spec-header h1 { font-size: 14pt; font-weight: 700; letter-spacing: -0.5px; }
  .spec-header .sub { font-size: 7.5pt; color: #555; margin-top: 2px; }
  .spec-grid { display: grid; gap: 2px; margin-bottom: 8px; }
  .spec-section { border: 1px solid #ddd; padding: 6px 8px; margin-bottom: 6px; break-inside: avoid; }
  .spec-section h3 { font-size: 8.5pt; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 1px solid #e5e5e5; padding-bottom: 3px; margin-bottom: 5px; color: #333; }
  .spec-row { display: flex; gap: 10px; margin-bottom: 2px; align-items: baseline; }
  .spec-label { font-size: 7pt; color: #666; min-width: 80px; font-weight: 500; }
  .spec-value { font-size: 8pt; font-weight: 400; border-bottom: 1px dotted #ccc; flex: 1; min-height: 12px; padding-bottom: 1px; }
  .spec-3col { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 6px; }
  .spec-2col { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
  .spec-4col { display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap: 6px; }
  .spec-top-row { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 8px; }
  .sig-line { border-bottom: 1px solid #1a1a1a; min-width: 160px; height: 20px; display: inline-block; }
  .sig-section { display: flex; gap: 30px; margin-top: 10px; break-before: page; page-break-before: always; }
  .sig-block { flex: 1; }
  .sig-label { font-size: 7.5pt; font-weight: 500; margin-bottom: 3px; }
  .legal { font-size: 6.5pt; color: #666; margin-top: 8px; padding-top: 5px; border-top: 1px solid #ddd; line-height: 1.4; }
  .legal p { margin-bottom: 2px; }
  .colour-group-badge { display: inline-block; font-size: 6pt; font-weight: 500; color: #fff; background: #4a5568; border-radius: 3px; padding: 1px 4px; margin-left: 5px; vertical-align: middle; letter-spacing: 0.3px; }
  .section-colour-group { font-size: 6.5pt; color: #666; font-weight: 400; margin-left: 6px; font-style: italic; }
  .colour-swatch { display: inline-block; width: 9px; height: 9px; border-radius: 2px; border: 0.5px solid #999; margin-right: 4px; vertical-align: middle; flex-shrink: 0; }
  .colour-swatch-split { display: inline-flex; width: 9px; height: 9px; border-radius: 2px; border: 0.5px solid #999; margin-right: 4px; vertical-align: middle; flex-shrink: 0; overflow: hidden; }
  .colour-swatch-split .swatch-half { flex: 1; height: 100%; }
  .spec-value-with-swatch { display: flex; align-items: center; font-size: 8pt; font-weight: 400; border-bottom: 1px dotted #ccc; flex: 1; min-height: 12px; padding-bottom: 1px; }
  @media print { body { padding: 0; width: auto; min-height: auto; } }
  @media screen { body { max-width: 210mm; margin: 0 auto; background: #fff; box-shadow: 0 0 10px rgba(0,0,0,0.1); } }
</style></head><body>${content}</body></html>`);
    printWindow.document.close();
    setTimeout(() => printWindow.print(), 600);
  };

  // Section completion check
  const sectionHasData = useCallback((sectionId: string): boolean => {
    const sectionFieldPrefixes: Record<string, string[]> = {
      client: ["clientName", "siteAddress", "descriptionOfWork"],
      siteDetails: ["specSiteAccess", "specSiteRestricted", "specSiteConditions", "specSiteOther", "specSiteMixed", "specSiteNotes"],
      dimensions: ["specWidth", "specLength", "specRoofToFloor"],
      brackets: ["specFreeStanding", "specAttachmentMethod", "specBracketAttachmentMethod", "specNumberOfBrackets", "specFasciaBrackets", "specExtendaBrackets", "specGableBrackets", "specPopupBrackets", "specWallFixingBracket", "specBracketColour", "specBracketInfillType", "specBracketInfillLength", "specBracketInfillHeight", "specBracketInfillColour"],
      posts: ["specPostsNumber", "specPostsType"],
      gutter: ["specGutterType", "specGutterColour"],
      walls: ["specWallType", "specWallColour", "specWallNotes"],
      beams: ["specBeamSize", "specBeamColour", "specBackChannelType", "specBackChannelLength", "specBackChannelColour", "specSideChannelsType", "specSideChannelsLength", "specSideChannelsColour", "specFlashingsType", "specFlashingsLength", "specFlashingsQty", "specFlashingsColour"],
      roof: ["specRoofType", "specRoofTopColour"],
      windows: ["specWindowsFrameColour", "specDoorsFrameColour"],
      floor: ["specFloorPrep", "specElecFrameType", "specFloorFinish", "specSubfloorM2"],
      stairs: ["specStairsType", "specStairsTotalRise", "specStairsWidth", "specStairsSteps", "specStairsStringer", "specStairsTreads", "specStairsHandrail"],
      balustrade: ["specBalustradeTubular", "specBalustradeGlass", "specBalustradeWire"],
      electrical: ["specElecLights", "specElecSwitches", "specElecPowerPoints"],
      concreting: ["specConcreteType", "specConcreteFinish"],
      existingHouse: ["specExistingEave", "specExistingWalls", "specExistingFascia"],
      plumbing: ["specPlumbStormwater", "specPlumbGas", "specPlumbPipes"],
      glass: ["specGlassWindows", "specGlassDoors", "specGlassToning"],
    };
    const prefixes = sectionFieldPrefixes[sectionId] || [];
    return prefixes.some(prefix => form[prefix] && form[prefix].trim() !== "");
  }, [form]);

  // Navigate to section
  const navigateToSection = useCallback((sectionId: string) => {
    setActiveSection(sectionId);
    setMobileMenuOpen(false);
    // Scroll to top of the section content
    setTimeout(() => {
      const el = document.getElementById(`spec-section-${sectionId}`);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
  }, []);

  // Completed sections count for progress bar
  const completedCount = useMemo(() => {
    return orderedVisibleSections.filter(s => sectionHasData(s.id)).length;
  }, [orderedVisibleSections, sectionHasData]);

  // Prev/Next section navigation
  const currentSectionIndex = useMemo(() => filteredSections.findIndex(s => s.id === activeSection), [filteredSections, activeSection]);
  const canGoPrev = currentSectionIndex > 0;
  const canGoNext = currentSectionIndex < filteredSections.length - 1;
  const goToPrevSection = useCallback(() => {
    if (canGoPrev) navigateToSection(filteredSections[currentSectionIndex - 1].id);
  }, [canGoPrev, currentSectionIndex, filteredSections, navigateToSection]);
  const goToNextSection = useCallback(() => {
    if (canGoNext) navigateToSection(filteredSections[currentSectionIndex + 1].id);
  }, [canGoNext, currentSectionIndex, filteredSections, navigateToSection]);

  if (isLoading) return <Skeleton className="h-96 w-full" />;
  if (!quote) return <p className="text-sm text-muted-foreground">Quote not found</p>;

  // Sidebar section metadata
  const sidebarSections: SectionMeta[] = useMemo(() => {
    return SECTIONS.map(s => ({ id: s.id, label: s.label, category: s.category }));
  }, []);

  // Current section label for mobile header
  const currentSectionLabel = useMemo(() => {
    const s = SECTIONS.find(s => s.id === activeSection);
    return s?.label || "Spec Sheet";
  }, [activeSection]);

  const sidebarContent = (
    <SpecSheetSidebar
      sections={sidebarSections}
      sectionOrder={sectionOrder}
      hiddenSections={hiddenSections}
      activeSection={activeSection}
      sectionHasData={sectionHasData}
      onNavigate={navigateToSection}
      onReorder={handleReorder}
      onToggleHidden={handleToggleHidden}
      onResetPreferences={handleResetPreferences}
      completedCount={completedCount}
      totalVisible={orderedVisibleSections.length}
      templates={sectionTemplatesList?.map(t => ({ id: t.id, name: t.name, description: t.description }))}
      activeTemplateId={activeTemplateId}
      onApplyTemplate={handleApplyTemplate}
      onCopyFromQuote={() => setShowCopyDialog(true)}
      quickSummary={{
        width: form.specWidth || undefined,
        length: form.specLength || undefined,
        fall: form.specFall || undefined,
        windCat: form.specWindCat || undefined,
        roofArea: form.specWidth && form.specLength
          ? (() => {
              const w = parseFloat(form.specWidth);
              const l = parseFloat(form.specLength);
              const fall = form.specFall ? parseFloat(form.specFall) : 0;
              const pitchRad = (fall * Math.PI) / 180;
              const area = fall > 0 ? (w * l) / Math.cos(pitchRad) : w * l;
              return `${area.toFixed(1)} m²`;
            })()
          : undefined,
        roofColour: form.specRoofTopColour || undefined,
        postColour: form.specPostsColour || undefined,
        beamColour: form.specBeamColour || undefined,
        gutterColour: form.specGutterColour || undefined,
      }}
    />
  );

  return (
    <div className="flex flex-col h-full -m-2 sm:-m-4">
      {/* ─── Top Bar (title + actions) ─── */}
      <div className="sticky top-0 z-20 bg-background/95 backdrop-blur-sm border-b px-3 py-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {/* Mobile hamburger */}
            {isMobile && (
              <button
                onClick={() => setMobileMenuOpen(true)}
                className="h-8 w-8 flex items-center justify-center rounded-md hover:bg-accent transition-colors shrink-0"
                aria-label="Open section navigation"
              >
                <Menu className="h-4.5 w-4.5 text-muted-foreground" />
              </button>
            )}
            <h2 className="text-sm sm:text-base font-semibold truncate">
              {isMobile ? currentSectionLabel : "Project Specification Sheet"}
            </h2>
            {autoSaveStatus === "saving" && (
              <span className="text-[11px] text-muted-foreground animate-pulse">Saving...</span>
            )}
            {autoSaveStatus === "saved" && (
              <span className="text-[11px] text-emerald-600 flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3" /> Saved
              </span>
            )}
          </div>
          <div className="flex gap-1.5">
            <Button variant="outline" size="sm" onClick={handleExportPDF} className="gap-1.5 text-xs h-7">
              <Printer className="h-3.5 w-3.5" /><span className="hidden sm:inline">Print / PDF</span>
            </Button>
            <Button size="sm" onClick={handleSave} disabled={updateMutation.isPending || adjUpdateMutation.isPending} className="gap-1.5 text-xs h-7">
              <Save className="h-3.5 w-3.5" /> <span className="hidden sm:inline">{updateMutation.isPending || adjUpdateMutation.isPending ? "Saving..." : "Save"}</span>
            </Button>
          </div>
        </div>
      </div>

      {/* ─── Main Layout: Sidebar + Content ─── */}
      <div className="flex flex-1 overflow-hidden">
        {/* Desktop sidebar */}
        {!isMobile && (
          <aside className="w-52 shrink-0 border-r bg-muted/20 overflow-y-auto">
            {sidebarContent}
          </aside>
        )}

        {/* Mobile sidebar sheet */}
        {isMobile && (
          <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
            <SheetContent side="left" className="w-64 p-0 [&>button]:hidden">
              <SheetHeader className="sr-only">
                <SheetTitle>Spec Sheet Sections</SheetTitle>
                <SheetDescription>Navigate between spec sheet sections</SheetDescription>
              </SheetHeader>
              {sidebarContent}
            </SheetContent>
          </Sheet>
        )}

        {/* Content area */}
        <div className="flex-1 overflow-y-auto">
          <div className="p-3 sm:p-5 space-y-4">

      {/* ─── Section Content (single section visible, no accordion wrappers) ─── */}
      <Accordion type="multiple" value={openSections} onValueChange={setOpenSections} className="space-y-3">

          {/* Client & Job Info */}
          {isSectionVisible("client") && (
          <AccordionItem value="client" id="spec-section-client" className="border rounded-lg px-4">
            <AccordionTrigger className="text-sm font-medium">Client & Job Information</AccordionTrigger>
            <AccordionContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Client Name" value={form.clientName || ""} readOnly />
                <Field label="Site Address" value={form.siteAddress || ""} readOnly />
                <Field label="Phone" value={form.clientPhone || ""} readOnly />
                <Field label="Email" value={form.clientEmail || ""} readOnly />
                <Field label="Region" value={form.region || ""} readOnly />
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-muted-foreground">Local Council</Label>
                  <CouncilSelect value={form.localCouncil || ""} onChange={(v) => update("localCouncil", v)} className="h-8 text-sm" />
                </div>
              </div>
              <div className="space-y-2 mt-4">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-medium">Description of Work</Label>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="sm" onClick={() => setShowTemplatePicker(!showTemplatePicker)} className="h-7 text-xs gap-1.5 text-blue-600">
                      <FileText className="h-3 w-3" /> Use Template
                    </Button>
                    {form.descriptionOfWork && (
                      <>
                        <Button variant="ghost" size="sm" onClick={() => setShowRefinement(!showRefinement)} className="h-7 text-xs gap-1.5">
                          <RefreshCw className="h-3 w-3" /> Refine
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => setShowSaveToLibrary(!showSaveToLibrary)} className="h-7 text-xs gap-1.5 text-green-600">
                          <BookmarkPlus className="h-3 w-3" /> Save to Library
                        </Button>
                      </>
                    )}
                    <Button variant="ghost" size="sm" onClick={() => genDescMutation.mutate({ quoteId, roofShapeGroupKey: selectedRoofShapeGroup === "auto" ? undefined : selectedRoofShapeGroup || undefined })} disabled={genDescMutation.isPending} className="h-7 text-xs gap-1.5">
                      <Wand2 className="h-3 w-3" /> {genDescMutation.isPending ? "Generating..." : "AI Generate"}
                    </Button>
                  </div>
                </div>
                {/* Roof Shape Group Selector */}
                {dowGroups && dowGroups.length > 0 && (
                  <div className="flex items-center gap-2">
                    <Label className="text-[10px] text-muted-foreground whitespace-nowrap">Style from:</Label>
                    <Select value={selectedRoofShapeGroup} onValueChange={setSelectedRoofShapeGroup}>
                      <SelectTrigger className="h-7 text-xs w-[180px]">
                        <SelectValue placeholder="Auto-detect" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="auto">Auto-detect from spec</SelectItem>
                        {dowGroups.map(g => (
                          <SelectItem key={g.key} value={g.key}>{g.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <Textarea value={form.descriptionOfWork || ""} onChange={(e) => update("descriptionOfWork", e.target.value)} rows={3} className="text-sm" />
                {/* Refinement panel */}
                {showRefinement && form.descriptionOfWork && (
                  <div className="flex items-center gap-2 p-2 bg-muted/40 rounded-md">
                    <Input
                      value={refinementInstruction}
                      onChange={(e) => setRefinementInstruction(e.target.value)}
                      placeholder="e.g. make it shorter, emphasise the insulated roof, add more detail about posts..."
                      className="h-7 text-xs flex-1"
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && refinementInstruction.trim()) {
                          genDescMutation.mutate({
                            quoteId,
                            roofShapeGroupKey: selectedRoofShapeGroup === "auto" ? undefined : selectedRoofShapeGroup || undefined,
                            refinementInstruction: refinementInstruction.trim(),
                            previousDescription: form.descriptionOfWork || "",
                          });
                        }
                      }}
                    />
                    <Button
                      variant="default"
                      size="sm"
                      className="h-7 text-xs"
                      disabled={!refinementInstruction.trim() || genDescMutation.isPending}
                      onClick={() => {
                        genDescMutation.mutate({
                          quoteId,
                          roofShapeGroupKey: selectedRoofShapeGroup === "auto" ? undefined : selectedRoofShapeGroup || undefined,
                          refinementInstruction: refinementInstruction.trim(),
                          previousDescription: form.descriptionOfWork || "",
                        });
                      }}
                    >
                      {genDescMutation.isPending ? "Refining..." : "Regenerate"}
                    </Button>
                  </div>
                )}
                {/* Save to Library panel */}
                {showSaveToLibrary && form.descriptionOfWork && (
                  <div className="flex items-center gap-2 p-2 bg-green-50 dark:bg-green-950/30 rounded-md border border-green-200 dark:border-green-800">
                    <Label className="text-[10px] text-muted-foreground whitespace-nowrap">Save to group:</Label>
                    <Select value={saveToLibraryGroup} onValueChange={setSaveToLibraryGroup}>
                      <SelectTrigger className="h-7 text-xs w-[180px]">
                        <SelectValue placeholder="Select roof shape group" />
                      </SelectTrigger>
                      <SelectContent>
                        {(dowGroups || []).map(g => (
                          <SelectItem key={g.key} value={g.key}>{g.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      variant="default"
                      size="sm"
                      className="h-7 text-xs bg-green-600 hover:bg-green-700"
                      disabled={!saveToLibraryGroup || saveToLibraryMutation.isPending}
                      onClick={() => {
                        if (saveToLibraryGroup && form.descriptionOfWork) {
                          saveToLibraryMutation.mutate({
                            description: form.descriptionOfWork,
                            groupKey: saveToLibraryGroup,
                          });
                        }
                      }}
                    >
                      {saveToLibraryMutation.isPending ? "Saving..." : "Save"}
                    </Button>
                    <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setShowSaveToLibrary(false)}>Cancel</Button>
                  </div>
                )}
                {/* Use Template picker panel */}
                {showTemplatePicker && (
                  <div className="p-3 bg-blue-50 dark:bg-blue-950/30 rounded-md border border-blue-200 dark:border-blue-800 space-y-2">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <Label className="text-xs font-medium">Select a template description</Label>
                      <div className="flex items-center gap-2">
                        <Select value={templateFilterGroup} onValueChange={setTemplateFilterGroup}>
                          <SelectTrigger className="h-7 text-xs w-[160px]">
                            <SelectValue placeholder="All groups" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">All groups</SelectItem>
                            {(dowGroups || []).map(g => (
                              <SelectItem key={g.key} value={g.key}>{g.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => { setShowTemplatePicker(false); setEditingTemplateKey(null); setTemplateSearchQuery(""); }}>Close</Button>
                      </div>
                    </div>
                    {/* Search box */}
                    <div className="relative">
                      <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
                      <Input
                        value={templateSearchQuery}
                        onChange={(e) => setTemplateSearchQuery(e.target.value)}
                        placeholder="Search templates by keyword..."
                        className="h-7 text-xs pl-7"
                      />
                    </div>
                    <div className="max-h-[220px] overflow-y-auto space-y-1">
                      {(dowItems || [])
                        .filter(item => templateFilterGroup === "all" || item.groupKey === templateFilterGroup)
                        .filter(item => !templateSearchQuery.trim() || item.value.toLowerCase().includes(templateSearchQuery.toLowerCase()))
                        .map(item => {
                          const groupName = (dowGroups || []).find(g => g.key === item.groupKey)?.name || "";
                          const isEditing = editingTemplateKey === item.key;
                          return (
                            <div key={item.key} className="rounded border border-transparent hover:border-blue-300 transition-colors">
                              {isEditing ? (
                                <div className="p-2 space-y-2">
                                  <Textarea
                                    value={editingTemplateText}
                                    onChange={(e) => setEditingTemplateText(e.target.value)}
                                    rows={3}
                                    className="text-xs"
                                    autoFocus
                                  />
                                  <div className="flex items-center gap-2">
                                    <Button
                                      variant="default"
                                      size="sm"
                                      className="h-6 text-xs gap-1"
                                      onClick={() => {
                                        let desc = editingTemplateText;
                                        if (form.specWidth && form.specLength) {
                                          desc = desc.replace(/\d+(\.\d+)?m\s*[Ww]\s*x\s*\d+(\.\d+)?m\s*[Ll]/g, `${form.specWidth}m W x ${form.specLength}m L`);
                                        }
                                        update("descriptionOfWork", desc);
                                        setShowTemplatePicker(false);
                                        setEditingTemplateKey(null);
                                        setTemplateSearchQuery("");
                                        toast.success("Edited template applied");
                                      }}
                                    >
                                      <Check className="h-3 w-3" /> Apply
                                    </Button>
                                    <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => setEditingTemplateKey(null)}>Cancel</Button>
                                  </div>
                                </div>
                              ) : (
                                <div className="flex items-start gap-1 p-2 hover:bg-blue-100 dark:hover:bg-blue-900/40 rounded">
                                  <button
                                    className="flex-1 text-left text-xs"
                                    onClick={() => {
                                      let desc = item.value;
                                      if (form.specWidth && form.specLength) {
                                        desc = desc.replace(/\d+(\.\d+)?m\s*[Ww]\s*x\s*\d+(\.\d+)?m\s*[Ll]/g, `${form.specWidth}m W x ${form.specLength}m L`);
                                      }
                                      update("descriptionOfWork", desc);
                                      setShowTemplatePicker(false);
                                      setEditingTemplateKey(null);
                                      setTemplateSearchQuery("");
                                      toast.success("Template applied");
                                    }}
                                  >
                                    <div className="flex items-start gap-2">
                                      <span className="inline-block px-1.5 py-0.5 bg-blue-100 dark:bg-blue-800 text-[9px] font-medium rounded text-blue-700 dark:text-blue-200 whitespace-nowrap mt-0.5">{groupName}</span>
                                      <span className="text-foreground leading-snug">{item.value}</span>
                                    </div>
                                  </button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-6 w-6 p-0 shrink-0 text-muted-foreground hover:text-blue-600"
                                    title="Edit before applying"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setEditingTemplateKey(item.key);
                                      setEditingTemplateText(item.value);
                                    }}
                                  >
                                    <Pencil className="h-3 w-3" />
                                  </Button>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      {(dowItems || [])
                        .filter(item => templateFilterGroup === "all" || item.groupKey === templateFilterGroup)
                        .filter(item => !templateSearchQuery.trim() || item.value.toLowerCase().includes(templateSearchQuery.toLowerCase()))
                        .length === 0 && (
                        <p className="text-xs text-muted-foreground text-center py-4">
                          {templateSearchQuery.trim() ? "No templates match your search." : "No templates found. Add descriptions in Sales Data > Descriptions of Work."}
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>
              <div className="mt-4">
                <SelectField label="Design Adviser" value={form.specDesignAdviser || ""} onChange={(v) => update("specDesignAdviser", v)} options={designAdvisorNames} />
              </div>
            </AccordionContent>
          </AccordionItem>
          )}


          {/* Site Details */}
          {isSectionVisible("siteDetails") && (
          <AccordionItem value="siteDetails" id="spec-section-siteDetails" className="border rounded-lg px-4">
            <AccordionTrigger className="text-sm font-medium">Site Details</AccordionTrigger>
            <AccordionContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="flex items-start gap-2 p-2 rounded-md bg-secondary/50 cursor-pointer">
                  <input type="checkbox" className="mt-0.5 rounded border-border" checked={form.specSiteAccess === "1"} onChange={(e) => update("specSiteAccess", e.target.checked ? "1" : "")} />
                  <div>
                    <span className="text-xs font-medium">Access difficult</span>
                    <p className="text-[10px] text-muted-foreground">e.g. delivery time, lack of space</p>
                  </div>
                </label>
                <label className="flex items-start gap-2 p-2 rounded-md bg-secondary/50 cursor-pointer">
                  <input type="checkbox" className="mt-0.5 rounded border-border" checked={form.specSiteRestricted === "1"} onChange={(e) => update("specSiteRestricted", e.target.checked ? "1" : "")} />
                  <div>
                    <span className="text-xs font-medium">Restricted work times</span>
                    <p className="text-[10px] text-muted-foreground">e.g. client always needs to be home, Body Corporate rules</p>
                  </div>
                </label>
                <label className="flex items-start gap-2 p-2 rounded-md bg-secondary/50 cursor-pointer">
                  <input type="checkbox" className="mt-0.5 rounded border-border" checked={form.specSiteConditions === "1"} onChange={(e) => update("specSiteConditions", e.target.checked ? "1" : "")} />
                  <div>
                    <span className="text-xs font-medium">Site conditions</span>
                    <p className="text-[10px] text-muted-foreground">e.g. other trades on site, not much room</p>
                  </div>
                </label>
                <label className="flex items-start gap-2 p-2 rounded-md bg-secondary/50 cursor-pointer">
                  <input type="checkbox" className="mt-0.5 rounded border-border" checked={form.specSiteOther === "1"} onChange={(e) => update("specSiteOther", e.target.checked ? "1" : "")} />
                  <div>
                    <span className="text-xs font-medium">Other</span>
                    <p className="text-[10px] text-muted-foreground">Other site-specific considerations</p>
                  </div>
                </label>
                <label className="flex items-start gap-2 p-2 rounded-md bg-secondary/50 cursor-pointer">
                  <input type="checkbox" className="mt-0.5 rounded border-border" checked={form.specSiteMixed === "1"} onChange={(e) => update("specSiteMixed", e.target.checked ? "1" : "")} />
                  <div>
                    <span className="text-xs font-medium">Mixed materials/angles design</span>
                    <p className="text-[10px] text-muted-foreground">e.g. multiple roof materials, complex angles</p>
                  </div>
                </label>
              </div>
              <div className="mt-3">
                <Label className="text-xs text-muted-foreground mb-1 block">Site Notes</Label>
                <textarea
                  className="w-full h-20 px-3 py-2 rounded-md border bg-background text-sm resize-y"
                  value={form.specSiteNotes || ""}
                  onChange={(e) => update("specSiteNotes", e.target.value)}
                  placeholder="Additional site details..."
                />
              </div>
            </AccordionContent>
          </AccordionItem>
          )}


          {/* Dimensions & Structure */}
          {isSectionVisible("dimensions") && (
          <AccordionItem value="dimensions" id="spec-section-dimensions" className="border rounded-lg px-4">
            <AccordionTrigger className="text-sm font-medium">Dimensions & Structure</AccordionTrigger>
            <AccordionContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                <Field label="Width (m)" placeholder="e.g. 4.00" value={form.specWidth || ""} onChange={(v) => { update("specWidth", v); if (v) setValidationErrors(prev => { const n = new Set(prev); n.delete("specWidth"); return n; }); recalcGutterLength(v, form.specLength || "", form.specGutterSides || ""); }} hasError={validationErrors.has("specWidth")} />
                <Field label="Length (m)" placeholder="e.g. 5.00" value={form.specLength || ""} onChange={(v) => { update("specLength", v); if (v) setValidationErrors(prev => { const n = new Set(prev); n.delete("specLength"); return n; }); recalcGutterLength(form.specWidth || "", v, form.specGutterSides || ""); }} hasError={validationErrors.has("specLength")} />
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Structure Size</label>
                  <div className="h-9 px-3 flex items-center rounded-md border bg-muted/50 text-sm font-medium">
                    {form.specWidth && form.specLength
                      ? `${(parseFloat(form.specWidth) * parseFloat(form.specLength)).toFixed(2)} m²`
                      : <span className="text-muted-foreground italic">Enter width & length</span>}
                  </div>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Perimeter</label>
                  <div className="h-9 px-3 flex items-center rounded-md border bg-muted/50 text-sm font-medium">
                    {form.specWidth && form.specLength
                      ? `${(2 * parseFloat(form.specWidth) + 2 * parseFloat(form.specLength)).toFixed(2)} m`
                      : <span className="text-muted-foreground italic">Enter width & length</span>}
                  </div>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Roof Area</label>
                  <div className="h-9 px-3 flex items-center rounded-md border bg-muted/50 text-sm font-medium">
                    {form.specWidth && form.specLength
                      ? (() => {
                          const w = parseFloat(form.specWidth);
                          const l = parseFloat(form.specLength);
                          const fall = form.specFall ? parseFloat(form.specFall) : 0;
                          const shape = form.specRoofShape || "Flat/Skillion";
                          const pitchRad = (fall * Math.PI) / 180;
                          let roofArea: number;
                          switch (shape) {
                            case "Gable":
                              roofArea = fall > 0 ? 2 * ((w / 2) / Math.cos(pitchRad)) * l : w * l;
                              break;
                            case "Dutch Gable":
                              roofArea = fall > 0 ? 2 * ((w / 2) / Math.cos(pitchRad)) * l * 1.1 : w * l * 1.1;
                              break;
                            case "Split Gable":
                              roofArea = fall > 0 ? 2 * ((w / 2) / Math.cos(pitchRad)) * l : w * l;
                              break;
                            case "Flat-Gable-Flat":
                              { const gableW = w / 3;
                                const flatW = w / 3;
                                const gableArea = fall > 0 ? 2 * ((gableW / 2) / Math.cos(pitchRad)) * l : gableW * l;
                                roofArea = gableArea + 2 * (flatW * l); }
                              break;
                            default:
                              roofArea = fall > 0 ? (w * l) / Math.cos(pitchRad) : w * l;
                          }
                          return `${roofArea.toFixed(2)} m²${fall > 0 ? ` (${shape}, ${fall}°)` : ` (${shape})`}`;
                        })()
                      : <span className="text-muted-foreground italic">Enter width & length</span>}
                  </div>
                </div>
                <SelectField label="Existing Roof Type of house" value={form.specHouseRoofType || ""} onChange={(v) => update("specHouseRoofType", v)} options={HOUSE_ROOF_TYPE_OPTIONS} />
                <SelectField label="Existing House Wall" value={form.specHouseWallType || ""} onChange={(v) => update("specHouseWallType", v)} options={EXISTING_HOUSE_WALL_OPTIONS} />
                <Field label="Floor Height" suffix="mm" placeholder="e.g. 2400" min={0} max={5000} value={form.specFloorHeight || ""} onChange={(v) => update("specFloorHeight", v)} />
                <Field label="Under Eave to Floor" suffix="mm" placeholder="e.g. 2250" min={2100} max={6000} value={form.specRoofToFloor || ""} onChange={(v) => update("specRoofToFloor", v)} />
                <Field label="Floor to Ground" suffix="mm" placeholder="e.g. 300" min={0} max={3000} value={form.specFloorToGround || ""} onChange={(v) => update("specFloorToGround", v)} />
                <Field label="House Eave" suffix="mm" placeholder="e.g. 600" min={0} max={1500} value={form.specHouseEave || ""} onChange={(v) => update("specHouseEave", v)} />
                <SelectField label="Cut Back Eave" value={cutBackEaveValue} onChange={(v) => update("specCutBackEave", v)} options={YES_NO_OPTIONS} />
                <Field label="Job Eave" suffix="mm" placeholder="e.g. 600" min={0} max={1500} value={form.specJobEave || ""} onChange={(v) => update("specJobEave", v)} />
                <SelectField label="Wind Category" value={form.specWindCat || ""} onChange={(v) => update("specWindCat", v)} options={["N1", "N2", "N3", "N4", "C1", "C2", "C3", "C4"]} />
                <SelectField label="Cp'n" value={form.specCpn || ""} onChange={(v) => update("specCpn", v)} options={["0.45 — Open 3 Sides (Single)", "0.7 — Open 3 Sides (Double)", "1.0 — Open 2 Sides", "1.1 — Screen Enclosed", "1.2 — Open 1 Side / Fully Enclosed"]} />
                <Field label="Fall in degrees" suffix="°" placeholder="e.g. 2" min={0.5} max={15} value={form.specFall || ""} onChange={(v) => update("specFall", v)} />
              </div>

              {/* Side Elevation Diagram with Annotations */}
              <div className="mt-5 border-t pt-4">
                <DiagramAnnotation
                  annotations={(() => {
                    try {
                      const all = JSON.parse(form.specDiagramAnnotations || "[]") as (Annotation & { diagram?: string })[];
                      return all.filter(a => a.diagram === "side-elevation");
                    } catch { return []; }
                  })()}
                  onChange={(anns) => {
                    try {
                      const all = JSON.parse(form.specDiagramAnnotations || "[]") as (Annotation & { diagram?: string })[];
                      const others = all.filter(a => a.diagram !== "side-elevation");
                      const tagged = anns.map(a => ({ ...a, diagram: "side-elevation" }));
                      update("specDiagramAnnotations", JSON.stringify([...others, ...tagged]));
                    } catch {
                      update("specDiagramAnnotations", JSON.stringify(anns.map(a => ({ ...a, diagram: "side-elevation" }))));
                    }
                  }}
                >
                  <SideElevationDiagram
                    projection={form.specLength ? String(parseFloat(form.specLength) * 1000) : ""}
                    beamHeight={form.specRoofToFloor || (parseFloat(form.specFloorHeight || "") >= 1800 ? form.specFloorHeight : "")}
                    roofFall={form.specFall || ""}
                    roofType={form.specRoofType || "Flat"}
                    postSize={form.specPostsType || ""}
                    beamSize={form.specBeamSize || ""}
                    cutBackEave={cutBackEaveValue}
                    jobEave={form.specJobEave || ""}
                    connectionType={(() => {
                      if (form.specFreeStanding === "Yes") return "FSS";
                      const method = form.specAttachmentMethod || "";
                      if (!method || method === "None") return undefined;
                      if (parseInt(form.specPopupBrackets || "0") > 0) return "POP";
                      if (parseInt(form.specGableBrackets || "0") > 0) return "GBL";
                      if (parseInt(form.specExtendaBrackets || "0") > 0) return "FLY";
                      if (form.specWallFixingBeam || form.specWallFixingBracket) return "WFX";
                      if (parseInt(form.specFasciaBrackets || "0") > 0) return "BCH";
                      return "BCH";
                    })()}
                  />
                </DiagramAnnotation>
              </div>
            </AccordionContent>
          </AccordionItem>
          )}

          {/* Attachment & Brackets */}
          {isSectionVisible("brackets") && (
          <AccordionItem value="brackets" id="spec-section-brackets" className="border rounded-lg px-4">
            <AccordionTrigger className="text-sm font-medium">Attachment & Brackets</AccordionTrigger>
            <AccordionContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                <SelectField label="Free Standing" value={form.specFreeStanding || ""} onChange={updateFreeStanding} options={YES_NO_OPTIONS} />
                {!isFreeStandingStructure && (<>
                  <SelectField label="No. of Attached Side" value={form.specAttachmentMethod === "None" ? "" : form.specAttachmentMethod || ""} onChange={updateAttachedSideCount} options={ATTACHED_SIDE_OPTIONS} allowNone={false} />
                  <SelectField label="Attachment Method" value={activeBracketMethod} onChange={updateBracketAttachmentMethod} options={BRACKET_ATTACHMENT_METHOD_OPTIONS} />
                  {activeBracketMethod && <Field label="Number of Brackets" value={displayedNumberOfBrackets} onChange={updateNumberOfBrackets} min={0} max={20} placeholder="0" />}
                  {showGableBracketOptions && (<>
                    <SelectField label="Oversized D Gutter" value={form.specOversizedDGutter || ""} onChange={(v) => update("specOversizedDGutter", v)} options={["1 to 5m", "6 to 10m", "11 to 15m", "16 to 20m", "Other"]} />
                    <SelectField label="Bracket Cover" value={form.specBracketCover || ""} onChange={(v) => update("specBracketCover", v)} options={["1 to 5m", "6 to 10m", "11 to 15m", "16 to 20m", "Other"]} />
                    <ColourField label="Bracket Colour" value={form.specBracketColour || ""} onChange={(v) => update("specBracketColour", v)} colours={getColoursForSection("brackets")} />
                  </>)}
                  {showPopupBracketOptions && (
                    <ColourField label="Pop-up Colour" value={form.specPopupColour || ""} onChange={(v) => update("specPopupColour", v)} colours={getColoursForSection("brackets")} />
                  )}
                  {(showGableBracketOptions || showPopupBracketOptions) && (<>
                    {bracketInfillCategories.length > 0 ? (
                      <FilteredSelect label="Infill Type" value={form.specBracketInfillType || ""} onChange={(v) => update("specBracketInfillType", v)} categories={bracketInfillCategories} />
                    ) : (
                      <SelectField label="Infill Type" value={form.specBracketInfillType || ""} onChange={(v) => update("specBracketInfillType", v)} options={bracketInfillOptions} />
                    )}
                    <Field label="Infill Length" suffix="mm" value={form.specBracketInfillLength || ""} onChange={(v) => update("specBracketInfillLength", v)} placeholder="e.g. 3000" min={0} />
                    <Field label="Infill Height" suffix="mm" value={form.specBracketInfillHeight || ""} onChange={(v) => update("specBracketInfillHeight", v)} placeholder="e.g. 600" min={0} />
                    <ColourField label="Infill Colour" value={form.specBracketInfillColour || ""} onChange={(v) => update("specBracketInfillColour", v)} colours={getColoursForProduct(bracketInfillColourLookupValue, "brackets")} />
                  </>)}
                  {showWallBracketOptions && (<>
                    <SelectField label="Wall Fixing Beam" value={form.specWallFixingBeam || ""} onChange={(v) => update("specWallFixingBeam", v)} options={["1 to 5m", "6 to 10m", "11 to 15m", "16 to 20m", "Other"]} />
                    <SelectField label="Foam Cut" value={form.specFoamCut || ""} onChange={(v) => update("specFoamCut", v)} options={["1 to 5m", "6 to 10m", "11 to 15m", "16 to 20m", "Other"]} />
                  </>)}
                </>)}
              </div>
            </AccordionContent>
          </AccordionItem>
          )}

          {/* Posts */}
          {isSectionVisible("posts") && (
          <AccordionItem value="posts" id="spec-section-posts" className="border rounded-lg px-4">
            <AccordionTrigger className="text-sm font-medium">Posts</AccordionTrigger>
            <AccordionContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                <SelectField label="Number of Posts" value={form.specPostsNumber || ""} onChange={(v) => update("specPostsNumber", v)} options={["none", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10"]} />
                {postCategories.length > 0 ? (
                  <FilteredSelect label="Post Type" value={form.specPostsType || ""} onChange={(v) => update("specPostsType", v)} categories={postCategories} />
                ) : (
                  <SelectField label="Post Type" value={form.specPostsType || ""} onChange={(v) => update("specPostsType", v)} options={postProductNames} />
                )}
                <ColourField label="Post Colour" value={form.specPostsColour || ""} onChange={(v) => update("specPostsColour", v)} colours={getColoursForProduct(form.specPostsType, "posts")} />
                {postFixingCategories.length > 0 ? (
                  <FilteredSelect label="Post Fixing" value={form.specPostsFixing || ""} onChange={(v) => update("specPostsFixing", v)} categories={postFixingCategories} />
                ) : (
                  <SelectField label="Post Fixing" value={normalizePostFixingOption(form.specPostsFixing)} onChange={(v) => update("specPostsFixing", v)} options={postFixingProductNames.length > 0 ? postFixingProductNames : POST_FIXING_OPTIONS} />
                )}
              </div>

              {/* Post Position Diagram */}
              <div className="mt-4">
                <Label className="text-xs font-medium text-muted-foreground mb-1 block">Post Positions (click edges to place posts, click a post to remove)</Label>
                <PostPositionDiagram
                  width={form.specWidth || ""}
                  length={form.specLength || ""}
                  postPositions={postPositionList}
                  houseWalls={form.specHouseWalls ? form.specHouseWalls.split(",").filter(Boolean) : []}
                  onPostPositionsChange={(positions) => update("specPostPositions", positions.join(","))}
                  fallDirection={form.specFallDirection || ""}
                  beamPositions={(form.specBeamPositions || "").split(";").filter(Boolean)}
                  beamEntries={beamEntries}
                />
                <p className="text-[10px] text-muted-foreground mt-1">Click on an edge to place a post (green). Click a beam line (indigo dashed) to mount a post on the beam (creates eave). Click an existing post to remove it. Hover for distance info.</p>
                {beamMountedPostLoadSummary.checks.length > 0 && (() => {
                  const tone = beamMountedPostLoadSummary.status === "fail"
                    ? {
                        wrap: "border-red-200 bg-red-50 text-red-900",
                        badge: "bg-red-100 text-red-800 border-red-200",
                        icon: <AlertCircle className="h-4 w-4 text-red-600" />,
                      }
                    : beamMountedPostLoadSummary.status === "warning"
                      ? {
                          wrap: "border-amber-200 bg-amber-50 text-amber-900",
                          badge: "bg-amber-100 text-amber-800 border-amber-200",
                          icon: <AlertCircle className="h-4 w-4 text-amber-600" />,
                        }
                      : {
                          wrap: "border-emerald-200 bg-emerald-50 text-emerald-900",
                          badge: "bg-emerald-100 text-emerald-800 border-emerald-200",
                          icon: <CheckCircle2 className="h-4 w-4 text-emerald-600" />,
                        };
                  return (
                    <div className={`mt-3 rounded-md border p-3 ${tone.wrap}`}>
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <div className="flex min-w-0 items-start gap-2">
                          <span className="mt-0.5 shrink-0">{tone.icon}</span>
                          <div className="min-w-0">
                            <p className="text-sm font-semibold">Beam-mounted post load distribution</p>
                            <p className="mt-0.5 text-xs leading-relaxed">{beamMountedPostLoadSummary.message}</p>
                            <p className="mt-1 text-[10px] leading-relaxed opacity-80">
                              Estimated from RB100 span-table capacity and tributary roof area. Engineering review is still required for final certification.
                            </p>
                          </div>
                        </div>
                        <Badge variant="outline" className={`w-fit shrink-0 ${tone.badge}`}>
                          {beamMountedPostLoadSummary.label}
                          {beamMountedPostLoadSummary.worstUtilisation !== null ? ` ${beamMountedPostLoadSummary.worstUtilisation}%` : ""}
                        </Badge>
                      </div>
                      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
                        {beamMountedPostLoadSummary.checks.map((check) => (
                          <div
                            key={check.marker}
                            title={check.tooltip}
                            className="rounded-md border border-black/10 bg-white/80 p-2 text-xs text-foreground shadow-sm"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <p className="font-semibold">Beam {check.beamIndex + 1} at {check.positionPct}%</p>
                                <p className="truncate text-muted-foreground">{check.beamSize}</p>
                              </div>
                              <span className={`shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-semibold ${
                                check.status === "fail"
                                  ? "border-red-200 bg-red-50 text-red-700"
                                  : check.status === "warning" || check.status === "unknown"
                                    ? "border-amber-200 bg-amber-50 text-amber-700"
                                    : "border-emerald-200 bg-emerald-50 text-emerald-700"
                              }`}>
                                {check.label}
                              </span>
                            </div>
                            <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1">
                              <span className="text-muted-foreground">Load</span>
                              <span className="text-right font-medium">{check.estimatedLoadKn.toFixed(1)}kN</span>
                              <span className="text-muted-foreground">Capacity</span>
                              <span className="text-right font-medium">
                                {check.pointLoadCapacityKn === null ? "Check" : `${check.pointLoadCapacityKn.toFixed(1)}kN`}
                              </span>
                              <span className="text-muted-foreground">Tributary</span>
                              <span className="text-right font-medium">
                                {(check.tributaryLengthMm / 1000).toFixed(2)}m x {(check.tributaryDepthMm / 1000).toFixed(2)}m
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* Plan View Diagram with Annotations */}
              <div className="mt-4">
                <DiagramAnnotation
                  annotations={(() => {
                    try {
                      const all = JSON.parse(form.specDiagramAnnotations || "[]") as (Annotation & { diagram?: string })[];
                      return all.filter(a => a.diagram === "plan-view");
                    } catch { return []; }
                  })()}
                  onChange={(anns) => {
                    try {
                      const all = JSON.parse(form.specDiagramAnnotations || "[]") as (Annotation & { diagram?: string })[];
                      const others = all.filter(a => a.diagram !== "plan-view");
                      const tagged = anns.map(a => ({ ...a, diagram: "plan-view" }));
                      update("specDiagramAnnotations", JSON.stringify([...others, ...tagged]));
                    } catch {
                      update("specDiagramAnnotations", JSON.stringify(anns.map(a => ({ ...a, diagram: "plan-view" }))));
                    }
                  }}
                >
                  <PlanViewDiagram
                    width={form.specWidth || ""}
                    length={form.specLength || ""}
                    postPositions={(form.specPostPositions || "").split(",").filter(Boolean)}
                    houseWalls={form.specHouseWalls ? form.specHouseWalls.split(",").filter(Boolean) : []}
                    beamSize={form.specBeamSize || ""}
                    roofType={form.specRoofType || ""}
                    postSpacing={form.specPostSpacing || ""}
                    fallDirection={form.specFallDirection || ""}
                    hasBeams={beamEntries.length > 0}
                    beamPositions={(form.specBeamPositions || "").split(";").filter(Boolean)}
                    beamEntries={beamEntries}
                    gutterSides={(form.specGutterSides || "").split(",").filter(Boolean)}
                    downpipeMarkers={(form.specDownpipeMarkers || "").split(",").filter(Boolean)}
                    downpipeLocations={(form.specDownpipeLocation || "").split(",").filter(s => s && s !== "No")}
                    postSize={form.specPostsType || ""}
                    connectionType={(() => {
                      if (form.specFreeStanding === "Yes") return "FSS";
                      const method = form.specAttachmentMethod || "";
                      if (method === "None" || !method) return undefined;
                      // Determine connection type from bracket fields
                      if (parseInt(form.specPopupBrackets || "0") > 0) return "POP";
                      if (parseInt(form.specGableBrackets || "0") > 0) return "GBL";
                      if (parseInt(form.specExtendaBrackets || "0") > 0) return "FLY";
                      if (form.specWallFixingBeam || form.specWallFixingBracket) return "WFX";
                      if (parseInt(form.specFasciaBrackets || "0") > 0) return "BCH";
                      return "BCH"; // default for attached structures
                    })()}
                  />
                </DiagramAnnotation>
              </div>
            </AccordionContent>
          </AccordionItem>
          )}

          {/* Gutter & Downpipe */}
          {isSectionVisible("gutter") && (
          <AccordionItem value="gutter" id="spec-section-gutter" className="border rounded-lg px-4">
            <AccordionTrigger className="text-sm font-medium">Gutter & Downpipe</AccordionTrigger>
            <AccordionContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                {gutterCategories.length > 0 ? (
                  <FilteredSelect label="Gutter Type" value={form.specGutterType || ""} onChange={(v) => update("specGutterType", v)} categories={gutterCategories} />
                ) : (
                  <SelectField label="Gutter Type" value={form.specGutterType || ""} onChange={(v) => update("specGutterType", v)} options={gutterProductNames} />
                )}
                <ColourField label="Gutter Colour" value={form.specGutterColour || ""} onChange={(v) => update("specGutterColour", v)} colours={getColoursForProduct(form.specGutterType, "gutter")} />
                <Field label="Total Gutter Length" suffix="mm" placeholder="e.g. 3000" value={form.specBoxGutter || ""} onChange={(v) => update("specBoxGutter", v)} />
                {(form.specGutterType || "").toLowerCase().includes("box") && (
                  <div>
                    <label className="text-xs font-medium text-muted-foreground block mb-1">Box Gutter Overflow</label>
                    <div className="h-9 px-3 flex items-center rounded-md border bg-muted text-sm text-muted-foreground cursor-not-allowed">Yes</div>
                  </div>
                )}
                {downpipeCategories.length > 0 ? (
                  <FilteredSelect label="Downpipe Type" value={form.specDownpipeType || ""} onChange={(v) => update("specDownpipeType", v)} categories={downpipeCategories} />
                ) : (
                  <SelectField label="Downpipe Type" value={form.specDownpipeType || ""} onChange={(v) => update("specDownpipeType", v)} options={downpipeProductNames} />
                )}
                <ColourField label="Downpipe Colour" value={form.specDownpipeColour || ""} onChange={(v) => update("specDownpipeColour", v)} colours={getColoursForProduct(form.specGutterType, "gutter")} />
                <MultiSelectField label="Downpipe Location" value={form.specDownpipeLocation || ""} onChange={(v) => update("specDownpipeLocation", v)} options={["A", "B", "C", "D"]} />
                {/* Validation: warn if DP locations set but no DP type selected */}
                {form.specDownpipeLocation && form.specDownpipeLocation !== "No" && form.specDownpipeLocation.trim() !== "" && !form.specDownpipeType && (
                  <p className="text-xs text-amber-600 mt-1">⚠ Please select a Downpipe Type above when DP locations are set.</p>
                )}
              </div>

              {/* Gutter Plan Diagram */}
              <div className="mt-4">
                <Label className="text-xs font-medium text-muted-foreground mb-1 block">Gutter Plan (click sides to toggle gutter, click on gutter to place downpipe)</Label>
                <GutterPlanDiagram
                  width={form.specWidth || ""}
                  length={form.specLength || ""}
                  gutterSides={(form.specGutterSides || "").split(",").filter(Boolean)}
                  downpipeMarkers={(form.specDownpipeMarkers || "").split(",").filter(Boolean)}
                  downpipeLocations={(form.specDownpipeLocation || "").split(",").filter(s => s && s !== "No")}
                  onGutterSidesChange={(sides) => {
                    update("specGutterSides", sides.join(","));
                    recalcGutterLength(form.specWidth || "", form.specLength || "", sides.join(","));
                  }}
                  onDownpipeMarkersChange={(markers) => update("specDownpipeMarkers", markers.join(","))}
                  onDownpipeLocationsChange={(locs) => update("specDownpipeLocation", locs.length > 0 ? locs.join(",") : "")}
                  fallDirection={form.specFallDirection || ""}
                />
                <p className="text-[10px] text-muted-foreground mt-1">Click edges to toggle gutter (blue). Click on a gutter edge to place a downpipe marker (green DP). Click a corner letter to toggle DP location.</p>
              </div>
            </AccordionContent>
          </AccordionItem>
          )}

          {/* Walls - Insulated Wall Panels */}
          {isSectionVisible("walls") && (
          <AccordionItem value="walls" id="spec-section-walls" className="border rounded-lg px-4">
            <AccordionTrigger className="text-sm font-medium">Walls</AccordionTrigger>
            <AccordionContent>
              {/* Insulated Wall Panels - multiple entries */}
                                <div className="border-b pb-3 mb-3">
                                  <div className="flex items-center justify-between mb-2">
                                    <Label className="text-xs font-medium text-muted-foreground">Insulated Wall Panels</Label>
                                    <Button variant="outline" size="sm" className="h-6 text-xs" onClick={() => setIwpEntries(prev => [...prev, { type: "", width: 0, height: 0, outsideColour: "", outsideFinish: "", insideColour: "", insideFinish: "", wallSides: "" }])}>
                                      <Plus className="h-3 w-3 mr-1" /> Add Wall
                                    </Button>
                                  </div>
                                  {iwpEntries.map((entry, idx) => (
                                    <div key={idx} className="border rounded-md p-3 mb-2 bg-muted/30">
                                      <div className="flex items-center justify-between mb-2">
                                        <span className="text-xs font-medium">Wall {idx + 1}</span>
                                        <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => setIwpEntries(prev => prev.filter((_, i) => i !== idx))}>
                                          <Trash2 className="h-3.5 w-3.5" />
                                        </Button>
                                      </div>
                                      <div className="mb-3">
                                        <Label className="text-[11px] text-muted-foreground mb-1 block">Wall Position</Label>
                                        <div className="overflow-x-auto">
                                          <RoofPlanDiagram
                                            width={form.specWidth || ""}
                                            length={form.specLength || ""}
                                            fallDirection=""
                                            houseWalls={(entry.wallSides || "").split(",").filter(Boolean)}
                                            onHouseWallsChange={(walls) => {
                                              const next = [...iwpEntries];
                                              next[idx] = { ...next[idx], wallSides: walls.join(",") };
                                              setIwpEntries(next);
                                            }}
                                            selectedSideLabel="WALL"
                                          />
                                        </div>
                                      </div>
                                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                      <div>
                        <Label className="text-[11px] text-muted-foreground">IWP Type</Label>
                        {wallCategories.length > 0 ? (
                          <FilteredSelect label="" value={entry.type} onChange={(v) => { const next = [...iwpEntries]; next[idx] = { ...next[idx], type: v }; setIwpEntries(next); }} categories={wallCategories} />
                        ) : (
                          <Select value={entry.type} onValueChange={(v) => { const next = [...iwpEntries]; next[idx] = { ...next[idx], type: v }; setIwpEntries(next); }}>
                            <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Select type" /></SelectTrigger>
                            <SelectContent>
                              {wallProductNames.map(n => <SelectItem key={n} value={n}>{n}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        )}
                      </div>
                      <div>
                        <Label className="text-[11px] text-muted-foreground">Width (mm)</Label>
                        <Input className="h-8 text-sm" type="number" min={0} placeholder="mm" value={entry.width || ""} onChange={(e) => { const next = [...iwpEntries]; next[idx] = { ...next[idx], width: parseInt(e.target.value) || 0 }; setIwpEntries(next); }} />
                      </div>
                      <div>
                        <Label className="text-[11px] text-muted-foreground">Height (mm)</Label>
                        <Input className="h-8 text-sm" type="number" min={0} placeholder="mm" value={entry.height || ""} onChange={(e) => { const next = [...iwpEntries]; next[idx] = { ...next[idx], height: parseInt(e.target.value) || 0 }; setIwpEntries(next); }} />
                      </div>
                      <div>
                        <Label className="text-[11px] text-muted-foreground">Outside Colour</Label>
                        <ColourField label="" value={entry.outsideColour} onChange={(v) => { const next = [...iwpEntries]; next[idx] = { ...next[idx], outsideColour: v }; setIwpEntries(next); }} colours={getColoursForProduct(form.specWallType, "walls")} />
                      </div>
                      <div>
                        <Label className="text-[11px] text-muted-foreground">Outside Finish</Label>
                        <Select value={entry.outsideFinish} onValueChange={(v) => { const next = [...iwpEntries]; next[idx] = { ...next[idx], outsideFinish: v }; setIwpEntries(next); }}>
                          <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Select" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Smooth">Smooth</SelectItem>
                            <SelectItem value="Luxaline">Luxaline</SelectItem>
                            <SelectItem value="Micraline">Micraline</SelectItem>
                            <SelectItem value="Embossed">Embossed</SelectItem>
                            <SelectItem value="FC Painted">FC Painted</SelectItem>
                            <SelectItem value="FC Unpainted">FC Unpainted</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label className="text-[11px] text-muted-foreground">Inside Colour</Label>
                        <ColourField label="" value={entry.insideColour} onChange={(v) => { const next = [...iwpEntries]; next[idx] = { ...next[idx], insideColour: v }; setIwpEntries(next); }} colours={getColoursForProduct(form.specWallType, "walls")} />
                      </div>
                      <div>
                        <Label className="text-[11px] text-muted-foreground">Inside Finish</Label>
                        <Select value={entry.insideFinish} onValueChange={(v) => { const next = [...iwpEntries]; next[idx] = { ...next[idx], insideFinish: v }; setIwpEntries(next); }}>
                          <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Select" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Smooth">Smooth</SelectItem>
                            <SelectItem value="Luxaline">Luxaline</SelectItem>
                            <SelectItem value="Micraline">Micraline</SelectItem>
                            <SelectItem value="Embossed">Embossed</SelectItem>
                            <SelectItem value="FC Painted">FC Painted</SelectItem>
                            <SelectItem value="FC Unpainted">FC Unpainted</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>
                ))}
                {iwpEntries.length === 0 && <p className="text-xs text-muted-foreground italic">No wall panels added yet. Click "Add Wall" to begin.</p>}
              </div>

              {/* Work Checklist */}
              <div className="mt-3">
                <SortableChecklist
                  label="Work Checklist"
                  items={wallWorkItems}
                  onChange={setWallWorkItems}
                  placeholder="Wall work item..."
                  notesPlaceholder="Notes (optional)..."
                  showResponsibility
                  lockItemLabels={!isSuperAdmin}
                  defaultItems={defaultChecklistItems("walls")}
                />
              </div>

              {/* General Notes */}
              <div className="mt-3">
                <Label className="text-xs font-medium text-muted-foreground mb-1 block">General Notes</Label>
                <textarea className="w-full border rounded-md p-2 text-sm min-h-[60px] resize-y" value={form.specWallNotes || ""} onChange={(e) => update("specWallNotes", e.target.value)} placeholder="Wall notes..." />
              </div>
            </AccordionContent>
          </AccordionItem>
          )}

          {/* Beams, Channels & Flashings */}
          {isSectionVisible("beams") && (
          <AccordionItem value="beams" id="spec-section-beams" className="border rounded-lg px-4">
            <AccordionTrigger className="text-sm font-medium">Beams, Channels & Flashings</AccordionTrigger>
            <AccordionContent>
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                  <ColourField label="Beam Colour" value={form.specBeamColour || ""} onChange={(v) => update("specBeamColour", v)} colours={getColoursForProduct(beamColourLookupValue, "beams")} />
                </div>

                <div className="grid grid-cols-1 gap-4">
                  <div className="rounded-md border border-border/60 bg-muted/20 p-3">
                    <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Back Channel</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                      {backChannelCategories.length > 0 ? (
                        <FilteredSelect label="Back Channel Type" value={form.specBackChannelType || ""} onChange={(v) => update("specBackChannelType", v)} categories={backChannelCategories} />
                      ) : (
                        <SelectField label="Back Channel Type" value={form.specBackChannelType || ""} onChange={(v) => update("specBackChannelType", v)} options={backChannelProductNames} />
                      )}
                      <Field label="Back Channel Length" suffix="mm" value={form.specBackChannelLength || ""} onChange={(v) => update("specBackChannelLength", v)} placeholder="e.g. 6000" min={0} />
                      <ColourField label="Back Channel Colour" value={form.specBackChannelColour || ""} onChange={(v) => update("specBackChannelColour", v)} colours={getColoursForProduct(backChannelColourLookupValue, "beams")} />
                    </div>
                  </div>

                  <div className="rounded-md border border-border/60 bg-muted/20 p-3">
                    <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Side Channels</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                      {sideChannelsCategories.length > 0 ? (
                        <FilteredSelect label="Side Channels Type" value={form.specSideChannelsType || ""} onChange={(v) => update("specSideChannelsType", v)} categories={sideChannelsCategories} />
                      ) : (
                        <SelectField label="Side Channels Type" value={form.specSideChannelsType || ""} onChange={(v) => update("specSideChannelsType", v)} options={sideChannelsProductNames} />
                      )}
                      <Field label="Side Channels Length" suffix="mm" value={form.specSideChannelsLength || ""} onChange={(v) => update("specSideChannelsLength", v)} placeholder="e.g. 12000" min={0} />
                      <ColourField label="Side Channels Colour" value={form.specSideChannelsColour || ""} onChange={(v) => update("specSideChannelsColour", v)} colours={getColoursForProduct(sideChannelsColourLookupValue, "beams")} />
                    </div>
                  </div>

                  <div className="rounded-md border border-border/60 bg-muted/20 p-3">
                    <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Flashings</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                      {flashingsCategories.length > 0 ? (
                        <FilteredSelect label="Flashings Type" value={form.specFlashingsType || ""} onChange={(v) => update("specFlashingsType", v)} categories={flashingsCategories} />
                      ) : (
                        <SelectField label="Flashings Type" value={form.specFlashingsType || ""} onChange={(v) => update("specFlashingsType", v)} options={flashingsProductNames} />
                      )}
                      <Field label="Flashings Length" suffix="mm" value={form.specFlashingsLength || ""} onChange={(v) => update("specFlashingsLength", v)} placeholder="e.g. 6000" min={0} />
                      <Field label="Flashings Qty" value={form.specFlashingsQty || ""} onChange={(v) => update("specFlashingsQty", v)} placeholder="e.g. 1" min={0} />
                      <ColourField label="Flashings Colour" value={form.specFlashingsColour || ""} onChange={(v) => update("specFlashingsColour", v)} colours={getColoursForProduct(flashingsColourLookupValue, "beams")} />
                    </div>
                  </div>
                </div>
              </div>

              {/* Beams - Multi-row entries */}
              <div className="mt-4 border-t pt-3">
                <div className="flex items-center justify-between mb-2">
                  <Label className="text-sm font-medium">Beams</Label>
                  <Button variant="outline" size="sm" onClick={() => {
                    const defaultSize = dbSteelSizes.length > 0 ? dbSteelSizes[0] : "140×50";
                    setBeamEntries(deriveBeamEntriesFromPlacement([...beamEntries, { type: "Steel", size: defaultSize, lm: 0 }]));
                  }}>
                    <Plus className="h-3 w-3 mr-1" /> Add Beam
                  </Button>
                </div>
                {beamEntries.length === 0 && <p className="text-xs text-muted-foreground">No beam entries yet. Click "Add Beam" to start.</p>}
                {beamEntries.map((entry, i) => {
                  const sizes = entry.type === "Steel" ? dbSteelSizes : dbAluSizes;
                  const placementMeta = resolveBeamPlacementMeta(i, beamPositionList, houseWallList, form.specWidth || "", form.specLength || "");
                  const hasDerivedLength = placementMeta.lm !== null;
                  return (
                    <div key={i} className="flex flex-wrap items-center gap-2 mb-2 px-2 py-1 rounded">
                      <Select value={entry.type} onValueChange={(v) => {
                        const next = [...beamEntries];
                        next[i] = { ...next[i], type: v as "Steel" | "Aluminium", size: v === "Steel" ? (dbSteelSizes[0] || "140×50") : (dbAluSizes[0] || "100×50") };
                        setBeamEntries(next);
                      }}>
                        <SelectTrigger className="w-[100px] h-8 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Steel">Steel</SelectItem>
                          <SelectItem value="Aluminium">Aluminium</SelectItem>
                        </SelectContent>
                      </Select>
                      <Select value={entry.size} onValueChange={(v) => {
                        const next = [...beamEntries];
                        next[i] = { ...next[i], size: v };
                        setBeamEntries(next);
                      }}>
                        <SelectTrigger className="w-[100px] h-8 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {sizes.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <div className="flex items-center gap-1">
                        <Input type="number" className="w-[72px] h-8 text-xs" placeholder="LM" readOnly={hasDerivedLength} value={entry.lm || ""} onChange={(e) => {
                          const next = [...beamEntries];
                          next[i] = { ...next[i], lm: parseFloat(e.target.value) || 0 };
                          setBeamEntries(next);
                        }} />
                        <span className="text-xs text-muted-foreground">LM</span>
                        <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                          {placementMeta.source === "width" ? "width" : "projection"}
                        </span>
                      </div>
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-destructive" onClick={() => setBeamEntries(beamEntries.filter((_, j) => j !== i))}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  );
                })}
                {beamEntries.length > 0 && (
                  <div className="mt-2 text-xs text-muted-foreground space-y-1">
                    {["Steel", "Aluminium"].map(type => {
                      const total = beamEntries.filter(e => e.type === type).reduce((sum, e) => sum + (e.lm || 0), 0);
                      return total > 0 ? <div key={type}><span className="font-medium">{type} Total:</span> {total.toFixed(1)} LM</div> : null;
                    })}
                  </div>
                )}

                {/* Beam Position Plan SVG */}
                {beamEntries.length > 0 && (
                  <div className="mt-4">
                    <Label className="text-xs font-medium text-muted-foreground mb-1 block">Beam Position Plan (drag beams to position)</Label>
                    <BeamPositionPlan
                      width={form.specWidth || ""}
                      length={form.specLength || ""}
                      houseWalls={form.specHouseWalls ? form.specHouseWalls.split(",").filter(Boolean) : []}
                      fallDirection={form.specFallDirection || ""}
                      beamEntries={beamEntries}
                      beamPositions={beamPositionList}
                      onBeamPositionsChange={(positions: string[]) => {
                        update("specBeamPositions", positions.join(";"));
                        setBeamEntries(prev => deriveBeamEntriesFromPlacement(prev, positions));
                      }}
                    />
                    <p className="text-[10px] text-muted-foreground mt-1">Drag beam lines to position them within the structure. Beams are shown as dashed lines parallel to the house wall.</p>
                  </div>
                )}
              </div>
            </AccordionContent>
          </AccordionItem>
          )}

          {/* Roof */}
          {isSectionVisible("roof") && (
          <AccordionItem value="roof" id="spec-section-roof" className="border rounded-lg px-4">
            <AccordionTrigger className="text-sm font-medium">Roof</AccordionTrigger>
            <AccordionContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                <SelectField label="Roof Shape" value={form.specRoofShape || ""} onChange={(v) => update("specRoofShape", v)} options={["Flat/Skillion", "Gable", "Dutch Gable", "Split Gable", "Flat-Gable-Flat"]} />
                {roofCategories.length > 0 ? (
                  <FilteredSelect label="Roof Type" value={form.specRoofType || ""} onChange={(v) => update("specRoofType", v)} categories={roofCategories} />
                ) : (
                  <SelectField label="Roof Type" value={form.specRoofType || ""} onChange={(v) => update("specRoofType", v)} options={roofProductNames} />
                )}
                <ColourField label="Roof Top Colour" value={form.specRoofTopColour || ""} onChange={(v) => update("specRoofTopColour", v)} colours={getColoursForProduct(form.specRoofType, "roof")} />
                <ColourField label="Roof Bottom Colour" value={form.specRoofBottomColour || ""} onChange={(v) => update("specRoofBottomColour", v)} colours={getColoursForProductBottom(form.specRoofType, "roof")} />
                <SelectField label="Fall Direction" value={form.specFallDirection || ""} onChange={(v) => update("specFallDirection", v)} options={["A-B", "B-C", "C-D", "D-A"]} />
                <MultiSelectField label="Angle Cutting" value={form.specAngleCutting || ""} onChange={(v) => {
                  update("specAngleCutting", v);
                  // Auto-calculate angle cutting metres from selected edges + dimensions
                  const selectedEdges = v.split(",").filter(Boolean) as RakedEdge[];
                  const widthMm = (parseFloat(form.specWidth || "0") * 1000) || 0;
                  const projMm = (parseFloat(form.specLength || "0") * 1000) || 0;
                  if (selectedEdges.length > 0 && widthMm > 0 && projMm > 0) {
                    const result = calculateRakedGeometry({ widthMm, projectionMm: projMm, rakedEdges: selectedEdges });
                    const lm = result.totalCutLengthM;
                    update("specAngleCuttingMetres", lm.toFixed(2));
                    // Auto-update angle cutting line item in costing tab
                    updateAngleCuttingCostMutation.mutate({ quoteId, angleCuttingMetres: lm });
                  } else {
                    update("specAngleCuttingMetres", "");
                  }
                }} options={["A-B", "B-C", "C-D", "D-A"]} />
                <div>
                  <label className="text-xs font-medium">Angle Cutting Metres (LM)</label>
                  <Input
                    type="number"
                    min="0"
                    step="0.1"
                    className="h-8 text-sm"
                    value={form.specAngleCuttingMetres || ""}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === "" || /^\d*\.?\d*$/.test(val)) {
                        update("specAngleCuttingMetres", val);
                        // Auto-update angle cutting line item when manually overridden
                        const lm = parseFloat(val);
                        if (lm > 0) {
                          updateAngleCuttingCostMutation.mutate({ quoteId, angleCuttingMetres: lm });
                        }
                      }
                    }}
                    placeholder="Auto-calculated"
                  />
                  <p className="text-[9px] text-muted-foreground mt-0.5">Diagonal cut length (auto-calculated, editable override). Cost auto-updates in OPQ.</p>
                </div>
                {/* Raked geometry detail panel */}
                {(() => {
                  const selectedEdges = (form.specAngleCutting || "").split(",").filter(Boolean) as RakedEdge[];
                  const widthMm = (parseFloat(form.specWidth || "0") * 1000) || 0;
                  const projMm = (parseFloat(form.specLength || "0") * 1000) || 0;
                  if (selectedEdges.length === 0 || widthMm <= 0 || projMm <= 0) return null;
                  const result = calculateRakedGeometry({ widthMm, projectionMm: projMm, rakedEdges: selectedEdges });
                  return (
                    <div className="col-span-1 sm:col-span-2 md:col-span-3 bg-amber-50 border border-amber-200 rounded-md p-3 mt-1">
                      <p className="text-xs font-semibold text-amber-800 mb-2">Angle Cut Details (per side)</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {result.edges.map((e) => (
                          <div key={e.edge} className="bg-white rounded border border-amber-100 p-2">
                            <p className="text-xs font-medium text-amber-900">{e.edge}</p>
                            <div className="text-[10px] text-muted-foreground mt-1 space-y-0.5">
                              <p>Edge length: {(e.edgeLengthMm / 1000).toFixed(2)}m</p>
                              <p>Cut angle: <span className="font-semibold text-amber-700">{e.cutAngleDeg}°</span></p>
                              <p>Diagonal cut: <span className="font-semibold text-amber-700">{(e.cutLengthMm / 1000).toFixed(2)}m</span></p>
                              <p>Panel range: {(e.shortestPanelMm / 1000).toFixed(2)}m → {(e.longestPanelMm / 1000).toFixed(2)}m</p>
                            </div>
                          </div>
                        ))}
                      </div>
                      <div className="mt-2 pt-2 border-t border-amber-200 flex items-center gap-4 text-[10px]">
                        <span className="text-amber-800 font-medium">Total cut LM: {result.totalCutLengthM.toFixed(2)}m</span>
                        <span className="text-muted-foreground">Sheets costed at full rectangle width</span>
                      </div>
                    </div>
                  );
                })()}
                {/* Dynamic Roof Plan Diagram */}
                <div className="col-span-1 sm:col-span-2 md:col-span-3 mt-2">
                  <Label className="text-xs font-medium text-muted-foreground mb-1 block">Roof Plan (click sides to mark house walls)</Label>
                  <RoofPlanDiagram
                    width={form.specWidth || ""}
                    length={form.specLength || ""}
                    fallDirection={form.specFallDirection || ""}
                    houseWalls={(form.specHouseWalls || "").split(",").filter(Boolean)}
                    onHouseWallsChange={(walls) => update("specHouseWalls", walls.join(","))}
                    rakedEdges={form.specAngleCutting || ""}
                  />
                  <p className="text-[10px] text-muted-foreground mt-1">Click edges to toggle house walls. Arrow shows fall direction. Lines show roof sheet orientation.</p>
                </div>

                {/* Gable Details - conditional on Roof Shape */}
                {(form.specRoofShape === "Gable" || form.specRoofShape === "Split Gable" || form.specRoofShape === "Dutch Gable") && (
                  <div className="col-span-1 sm:col-span-2 md:col-span-3 mt-4 border-t pt-3">
                    <Label className="text-sm font-medium mb-3 block">Gable Details</Label>
                    
                    <div className="space-y-4">
                      {/* Gable Infill */}
                      <div>
                        <Label className="text-xs font-medium text-muted-foreground mb-2 block">Gable Infill</Label>
                        <div className="flex flex-wrap gap-4">
                          {["Std Glass", "Dble Glazed Glass", "Twin Wall Polycarbonate", "IWP"].map(opt => (
                            <label key={opt} className="flex items-center gap-2 text-xs cursor-pointer">
                              <Checkbox checked={(form.specGableInfill || "").split(",").includes(opt)} onCheckedChange={(checked) => {
                                const current = (form.specGableInfill || "").split(",").filter(Boolean);
                                const next = checked ? [...current, opt] : current.filter(v => v !== opt);
                                update("specGableInfill", next.join(","));
                              }} />
                              {opt}
                            </label>
                          ))}
                        </div>
                      </div>

                      {/* Gable Style */}
                      <div>
                        <Label className="text-xs font-medium text-muted-foreground mb-2 block">Gable Style</Label>
                        <div className="flex flex-wrap gap-4">
                          {["Sunrise 3 spoke", "King Post 50×50", "Collar Ties 100×50", "Finial 50×50"].map(opt => (
                            <label key={opt} className="flex items-center gap-2 text-xs cursor-pointer">
                              <Checkbox checked={(form.specGableStyle || "").split(",").includes(opt)} onCheckedChange={(checked) => {
                                const current = (form.specGableStyle || "").split(",").filter(Boolean);
                                const next = checked ? [...current, opt] : current.filter(v => v !== opt);
                                update("specGableStyle", next.join(","));
                              }} />
                              {opt}
                            </label>
                          ))}
                        </div>
                      </div>

                      {/* Rafter Size */}
                      <div>
                        <Label className="text-xs font-medium text-muted-foreground mb-2 block">Rafter Size</Label>
                        <div className="flex flex-wrap gap-4">
                          {["50\u00d750", "100\u00d750", "200\u00d750"].map(opt => (
                            <label key={opt} className="flex items-center gap-2 text-xs cursor-pointer">
                              <Checkbox checked={(form.specRafterSize || "").split(",").includes(opt)} onCheckedChange={(checked) => {
                                const current = (form.specRafterSize || "").split(",").filter(Boolean);
                                const next = checked ? [...current, opt] : current.filter(v => v !== opt);
                                update("specRafterSize", next.join(","));
                              }} />
                              {opt}
                            </label>
                          ))}
                        </div>
                      </div>

                      {/* Rafter Material */}
                      <div>
                        <Label className="text-xs font-medium text-muted-foreground mb-2 block">Rafter Material</Label>
                        <div className="flex flex-wrap gap-4">
                          {["Aluminium", "Steel", "Timber"].map(opt => (
                            <label key={opt} className="flex items-center gap-2 text-xs cursor-pointer">
                              <Checkbox checked={(form.specRafterMaterial || "").split(",").includes(opt)} onCheckedChange={(checked) => {
                                const current = (form.specRafterMaterial || "").split(",").filter(Boolean);
                                const next = checked ? [...current, opt] : current.filter(v => v !== opt);
                                update("specRafterMaterial", next.join(","));
                              }} />
                              {opt}
                            </label>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Skylights */}
                <div className="col-span-1 sm:col-span-2 md:col-span-3 mt-4 border-t pt-3">
                  <Label className="text-sm font-medium mb-3 block">Skylights</Label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                    {skylightCategories.length > 0 ? (
                      <FilteredSelect label="Skylight Type" value={form.specSpanlitesType || ""} onChange={(v) => update("specSpanlitesType", v)} categories={skylightCategories} />
                    ) : (
                      <Field label="Skylight Type" placeholder="e.g. Spanlites 16mm" value={form.specSpanlitesType || ""} onChange={(v) => update("specSpanlitesType", v)} />
                    )}
                    {form.specSpanlitesType && form.specSpanlitesType !== "None" && (<>
                    <Field label="LM (Linear Metres)" suffix="m" placeholder="e.g. 3.5" value={form.specSkylightLm || ""} onChange={(v) => update("specSkylightLm", v)} />
                    <Field label="Qty" placeholder="e.g. 2" value={form.specSkylightQty || ""} onChange={(v) => update("specSkylightQty", v)} />
                    <SelectField label="Skylight Finish" value={form.specSpanlitesFinish || ""} onChange={(v) => update("specSpanlitesFinish", v)} options={["Clear", "Opal", "Diffused"]} />
                    </>)}
                  </div>
                </div>

                {/* Roofing - Poly */}
                <div className="col-span-1 sm:col-span-2 md:col-span-3 mt-4 border-t pt-3">
                  <Label className="text-sm font-medium mb-3 block">Roofing - Poly</Label>
                  
                  <div className="space-y-4">
                    {/* Poly Type */}
                    <div>
                      <Label className="text-xs font-medium text-muted-foreground mb-2 block">Type</Label>
                      <div className="flex flex-wrap gap-4">
                        {["Sunglaze", "EzGlaze", "TwinWall", "Beehive"].map(opt => (
                          <label key={opt} className="flex items-center gap-2 text-xs cursor-pointer">
                            <Checkbox checked={(form.specPolyType || "").split(",").includes(opt)} onCheckedChange={(checked) => {
                              const current = (form.specPolyType || "").split(",").filter(Boolean);
                              const next = checked ? [...current, opt] : current.filter(v => v !== opt);
                              update("specPolyType", next.join(","));
                            }} />
                            {opt}
                          </label>
                        ))}
                      </div>
                    </div>

                    {/* Poly Rafters - only show when a Poly Type is selected */}
                    {form.specPolyType && (
                    <div>
                      <Label className="text-xs font-medium text-muted-foreground mb-2 block">Rafters</Label>
                      <div className="flex flex-wrap gap-4">
                        {["50×50", "100×50", "200×50"].map(opt => (
                          <label key={opt} className="flex items-center gap-2 text-xs cursor-pointer">
                            <Checkbox checked={(form.specPolyRafters || "").split(",").includes(opt)} onCheckedChange={(checked) => {
                              const current = (form.specPolyRafters || "").split(",").filter(Boolean);
                              const next = checked ? [...current, opt] : current.filter(v => v !== opt);
                              update("specPolyRafters", next.join(","));
                            }} />
                            {opt}
                          </label>
                        ))}
                      </div>
                    </div>
                    )}
                  </div>
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>
          )}

          {/* Windows & Doors (original) */}
          {isSectionVisible("windows") && (
          <AccordionItem value="windows" id="spec-section-windows" className="border rounded-lg px-4">
            <AccordionTrigger className="text-sm font-medium">Windows, Doors & Finishes</AccordionTrigger>
            <AccordionContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                <ColourField label="Windows Frame Colour" value={form.specWindowsFrameColour || ""} onChange={(v) => update("specWindowsFrameColour", v)} colours={getColoursForSection("windows")} />
                <ColourField label="Doors Frame Colour" value={form.specDoorsFrameColour || ""} onChange={(v) => update("specDoorsFrameColour", v)} colours={getColoursForSection("windows")} />
              </div>

              {/* Multi-Window Entries */}
              <div className="mt-4 border-t pt-3">
                <div className="flex items-center justify-between mb-2">
                  <Label className="text-sm font-medium">Windows</Label>
                  <Button variant="outline" size="sm" className="h-6 text-xs" onClick={() => setWindowEntries(prev => [...prev, { style: "Sliding", height: 600, width: 600, qty: 1 }])}>
                    <Plus className="h-3 w-3 mr-1" /> Add Window
                  </Button>
                </div>
                {windowEntries.length === 0 && (
                  <p className="text-xs text-muted-foreground italic">No windows added. Click "+ Add Window" to add entries.</p>
                )}
                {windowEntries.length > 0 && (
                  <div className="space-y-2">
                    {windowEntries.map((entry, idx) => (
                      <div key={idx} className="border rounded-md p-3 relative">
                        <div className="absolute top-2 right-2 flex gap-1">
                          <Button variant="ghost" size="icon" className="h-5 w-5 text-muted-foreground hover:text-foreground" onClick={() => setWindowEntries(prev => [...prev.slice(0, idx + 1), { ...entry }, ...prev.slice(idx + 1)])}>
                            <Copy className="h-3 w-3" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-5 w-5 text-destructive" onClick={() => setWindowEntries(prev => prev.filter((_, i) => i !== idx))}>
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <Label className="text-xs text-muted-foreground">Style</Label>
                            <Select value={entry.style} onValueChange={(v) => {
                              const next = [...windowEntries];
                              next[idx] = { ...next[idx], style: v as WindowEntry["style"] };
                              setWindowEntries(next);
                            }}>
                              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="Sliding">Sliding</SelectItem>
                                <SelectItem value="Awning">Awning</SelectItem>
                                <SelectItem value="Fixed">Fixed</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div>
                            <Label className="text-xs text-muted-foreground">Height (mm)</Label>
                            <Select value={String(entry.height)} onValueChange={(v) => {
                              const next = [...windowEntries];
                              next[idx] = { ...next[idx], height: Number(v) };
                              setWindowEntries(next);
                            }}>
                              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                {WINDOW_HEIGHTS.map(h => (
                                  <SelectItem key={h} value={String(h)}>{h}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div>
                            <Label className="text-xs text-muted-foreground">Width (mm)</Label>
                            <Select value={String(entry.width)} onValueChange={(v) => {
                              const next = [...windowEntries];
                              next[idx] = { ...next[idx], width: Number(v) };
                              setWindowEntries(next);
                            }}>
                              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                {WINDOW_WIDTHS.map(w => (
                                  <SelectItem key={w} value={String(w)}>{w}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div>
                            <Label className="text-xs text-muted-foreground">Qty</Label>
                            <Input className="h-8 text-xs text-center" type="number" min={1} value={entry.qty} onChange={(e) => {
                              const next = [...windowEntries];
                              next[idx] = { ...next[idx], qty: Math.max(1, Number(e.target.value) || 1) };
                              setWindowEntries(next);
                            }} />
                          </div>
                          <div>
                            <Label className="text-xs text-muted-foreground">Screen</Label>
                            <Select value={entry.screen || "N/A"} onValueChange={(v) => {
                              const next = [...windowEntries];
                              next[idx] = { ...next[idx], screen: v };
                              setWindowEntries(next);
                            }}>
                              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                {SCREEN_OPTIONS.map(opt => (
                                  <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      </div>
                    ))}
                    <p className="text-xs text-muted-foreground mt-1">Total: {windowEntries.reduce((sum, e) => sum + e.qty, 0)} window(s)</p>
                  </div>
                )}
              </div>

              {/* Multi-Door Entries */}
              <div className="mt-4 border-t pt-3">
                <div className="flex items-center justify-between mb-2">
                  <Label className="text-sm font-medium">Doors</Label>
                  <Button variant="outline" size="sm" className="h-6 text-xs" onClick={() => setDoorEntries(prev => [...prev, { style: "Sliding", height: 2100, width: 1800, qty: 1 }])}>
                    <Plus className="h-3 w-3 mr-1" /> Add Door
                  </Button>
                </div>
                {doorEntries.length === 0 && (
                  <p className="text-xs text-muted-foreground italic">No doors added. Click "+ Add Door" to add entries.</p>
                )}
                {doorEntries.length > 0 && (
                  <div className="space-y-2">
                    {doorEntries.map((entry, idx) => (
                      <div key={idx} className="border rounded-md p-3 relative">
                        <div className="absolute top-2 right-2 flex gap-1">
                          <Button variant="ghost" size="icon" className="h-5 w-5 text-muted-foreground hover:text-foreground" onClick={() => setDoorEntries(prev => [...prev.slice(0, idx + 1), { ...entry }, ...prev.slice(idx + 1)])}>
                            <Copy className="h-3 w-3" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-5 w-5 text-destructive" onClick={() => setDoorEntries(prev => prev.filter((_, i) => i !== idx))}>
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <Label className="text-xs text-muted-foreground">Style</Label>
                            <Select value={entry.style} onValueChange={(v) => {
                              const next = [...doorEntries];
                              const newStyle = v as DoorEntry["style"];
                              const widths = newStyle === "Stacker" ? STACKER_DOOR_WIDTHS : newStyle === "Bi-fold" ? BIFOLD_DOOR_WIDTHS : DOOR_WIDTHS;
                              const currentWidthValid = widths.includes(entry.width);
                              const newWidth = currentWidthValid ? entry.width : widths[0];
                              const panels = newStyle === "Bi-fold" ? (BIFOLD_PANELS_MAP[newWidth]?.[0] || undefined) : undefined;
                              next[idx] = { ...next[idx], style: newStyle, width: newWidth, panels };
                              setDoorEntries(next);
                            }}>
                              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="Sliding">Sliding</SelectItem>
                                <SelectItem value="Hinged">Hinged</SelectItem>
                                <SelectItem value="Bi-fold">Bi-fold</SelectItem>
                                <SelectItem value="Stacker">Stacker</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div>
                            <Label className="text-xs text-muted-foreground">Height (mm)</Label>
                            <Select value={String(entry.height)} onValueChange={(v) => {
                              const next = [...doorEntries];
                              next[idx] = { ...next[idx], height: Number(v) };
                              setDoorEntries(next);
                            }}>
                              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                {DOOR_HEIGHTS.map(h => (
                                  <SelectItem key={h} value={String(h)}>{h}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div>
                            <Label className="text-xs text-muted-foreground">Width (mm)</Label>
                            <Select value={String(entry.width)} onValueChange={(v) => {
                              const next = [...doorEntries];
                              const newWidth = Number(v);
                              const panelOpts = entry.style === "Bi-fold" ? (BIFOLD_PANELS_MAP[newWidth] || []) : [];
                              const panels = panelOpts.length > 0 ? (panelOpts.includes(entry.panels || 0) ? entry.panels : panelOpts[0]) : undefined;
                              next[idx] = { ...next[idx], width: newWidth, panels };
                              setDoorEntries(next);
                            }}>
                              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                {(entry.style === "Stacker" ? STACKER_DOOR_WIDTHS : entry.style === "Bi-fold" ? BIFOLD_DOOR_WIDTHS : DOOR_WIDTHS).map(w => (
                                  <SelectItem key={w} value={String(w)}>{w}{entry.style === "Bi-fold" && BIFOLD_PANELS_MAP[w] ? ` (${BIFOLD_PANELS_MAP[w].join("/")}p)` : ""}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          {entry.style === "Bi-fold" ? (
                            <div>
                              <Label className="text-xs text-muted-foreground">Panels</Label>
                              <Select value={String(entry.panels || "")} onValueChange={(v) => {
                                const next = [...doorEntries];
                                next[idx] = { ...next[idx], panels: Number(v) };
                                setDoorEntries(next);
                              }}>
                                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="-" /></SelectTrigger>
                                <SelectContent>
                                  {(BIFOLD_PANELS_MAP[entry.width] || []).map(p => (
                                    <SelectItem key={p} value={String(p)}>{p}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          ) : (
                            <div>
                              <Label className="text-xs text-muted-foreground">Qty</Label>
                              <Input className="h-8 text-xs text-center" type="number" min={1} value={entry.qty} onChange={(e) => {
                                const next = [...doorEntries];
                                next[idx] = { ...next[idx], qty: Math.max(1, Number(e.target.value) || 1) };
                                setDoorEntries(next);
                              }} />
                            </div>
                          )}
                          {entry.style === "Bi-fold" && (
                            <div>
                              <Label className="text-xs text-muted-foreground">Qty</Label>
                              <Input className="h-8 text-xs text-center" type="number" min={1} value={entry.qty} onChange={(e) => {
                                const next = [...doorEntries];
                                next[idx] = { ...next[idx], qty: Math.max(1, Number(e.target.value) || 1) };
                                setDoorEntries(next);
                              }} />
                            </div>
                          )}
                          <div>
                            <Label className="text-xs text-muted-foreground">Screen</Label>
                            <Select value={entry.screen || "N/A"} onValueChange={(v) => {
                              const next = [...doorEntries];
                              next[idx] = { ...next[idx], screen: v };
                              setDoorEntries(next);
                            }}>
                              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                {SCREEN_OPTIONS.map(opt => (
                                  <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      </div>
                    ))}
                    <p className="text-xs text-muted-foreground mt-1">Total: {doorEntries.reduce((sum, e) => sum + e.qty, 0)} door(s)</p>
                  </div>
                )}
              </div>

              {/* Glass Options (merged from separate section) */}
              <div className="mt-4 border-t pt-4">
                <Label className="text-sm font-medium mb-3 block">Glass Options</Label>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                  <SelectField label="Window Glass Type" value={form.specWindowGlassType || ""} onChange={(v) => update("specWindowGlassType", v)} options={["Single Glaze", "Double Glaze", "Thermal Break", "Toughened", "Elow Glass"]} />
                  <SelectField label="Door Glass Type" value={form.specDoorGlassType || ""} onChange={(v) => update("specDoorGlassType", v)} options={["Single Glaze", "Double Glaze", "Thermal Break", "Toughened"]} />
                  <Field label="Windows (description)" placeholder="e.g. 2x awning 1200×900" value={form.specGlassWindows || ""} onChange={(v) => update("specGlassWindows", v)} />
                  <Field label="Doors (description)" placeholder="e.g. 1x sliding 2400×2100" value={form.specGlassDoors || ""} onChange={(v) => update("specGlassDoors", v)} />
                </div>
                {/* Glass Toning */}
                <div className="mt-4 border-t pt-3">
                  <Label className="text-xs font-medium mb-3 block">Glass Toning</Label>
                  <div className="space-y-3">
                    <div>
                      <Label className="text-xs font-medium text-muted-foreground mb-2 block">Obscurity</Label>
                      <div className="flex flex-wrap gap-4">
                        {["Standard (Clear)", "Translucent", "Acid Etched"].map(opt => (
                          <label key={opt} className="flex items-center gap-2 text-xs cursor-pointer">
                            <Checkbox checked={(form.specGlassObscurity || "").split(",").includes(opt)} onCheckedChange={(checked) => {
                              const current = (form.specGlassObscurity || "").split(",").filter(Boolean);
                              const next = checked ? [...current, opt] : current.filter(v => v !== opt);
                              update("specGlassObscurity", next.join(","));
                            }} />
                            {opt}
                          </label>
                        ))}
                      </div>
                    </div>
                    <div>
                      <Label className="text-xs font-medium text-muted-foreground mb-2 block">Tint</Label>
                      <div className="flex flex-wrap gap-4">
                        {["Grey", "Bronze", "Green"].map(opt => (
                          <label key={opt} className="flex items-center gap-2 text-xs cursor-pointer">
                            <Checkbox checked={(form.specGlassTint || "").split(",").includes(opt)} onCheckedChange={(checked) => {
                              const current = (form.specGlassTint || "").split(",").filter(Boolean);
                              const next = checked ? [...current, opt] : current.filter(v => v !== opt);
                              update("specGlassTint", next.join(","));
                            }} />
                            {opt}
                          </label>
                        ))}
                      </div>
                    </div>
                    <div>
                      <Label className="text-xs font-medium text-muted-foreground mb-2 block">Etched</Label>
                      <div className="flex flex-wrap gap-4">
                        {["Satinlite", "Cathedral", "Spotswood"].map(opt => (
                          <label key={opt} className="flex items-center gap-2 text-xs cursor-pointer">
                            <Checkbox checked={(form.specGlassEtched || "").split(",").includes(opt)} onCheckedChange={(checked) => {
                              const current = (form.specGlassEtched || "").split(",").filter(Boolean);
                              const next = checked ? [...current, opt] : current.filter(v => v !== opt);
                              update("specGlassEtched", next.join(","));
                            }} />
                            {opt}
                          </label>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 mt-4">
                  <SelectField label="Pet Door" value={form.specGlassPetDoor || ""} onChange={(v) => update("specGlassPetDoor", v)} options={["None", "Small", "Medium", "Large"]} />
                  <Field label="Glass Notes" placeholder="Additional glass requirements..." value={form.specGlassNotes || ""} onChange={(v) => update("specGlassNotes", v)} />
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>
          )}

          {/* ─── NEW SECTIONS ─── */}

          {/* Internal Floor */}
          {isSectionVisible("floor") && (
          <AccordionItem value="floor" id="spec-section-floor" className="border rounded-lg px-4">
            <AccordionTrigger className="text-sm font-medium">Internal Floor</AccordionTrigger>
            <AccordionContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                <SelectField label="Floor Preparation" value={form.specFloorPrep || ""} onChange={(v) => update("specFloorPrep", v)} options={["None", "Existing slab", "New slab", "Timber deck", "Strip & re-lay"]} />
                <SelectField label="Frame Type" value={form.specElecFrameType || ""} onChange={(v) => update("specElecFrameType", v)} options={["Steel", "Aluminum", "Timber", "Pedestal", "Existing Frame (subject to confirmation)"]} />
                <SelectField label="Floor Finish" value={form.specFloorFinish || ""} onChange={(v) => update("specFloorFinish", v)} options={["None", "Tiles", "Timber", "Vinyl", "Carpet", "Polished concrete", "Epoxy"]} />
                <div>
                  <label className="text-xs font-medium">Subfloor m²</label>
                  <Input
                    type="number"
                    min="0"
                    step="0.1"
                    className="h-8 text-sm"
                    value={form.specSubfloorM2 || ""}
                    onChange={(e) => update("specSubfloorM2", e.target.value)}
                    placeholder="e.g. 24.5"
                  />
                </div>
                <Field label="Floor Notes" placeholder="Additional floor requirements..." value={form.specFloorNotes || ""} onChange={(v) => update("specFloorNotes", v)} />
              </div>

              {/* Floor Work Checklist */}
              <div className="mt-4 border-t pt-4">
                <SortableChecklist
                  label="Site Work Checklist"
                  items={floorWorkItems}
                  onChange={(items) => setFloorWorkItems(items as ElecExtraItem[])}
                  placeholder="Site work item..."
                  notesPlaceholder="Notes (optional)..."
                  showResponsibility
                  lockItemLabels={!isSuperAdmin}
                  defaultItems={defaultChecklistItems("floor")}
                />
              </div>
            </AccordionContent>
          </AccordionItem>
          )}

          {/* Stairs */}
          {isSectionVisible("stairs") && (
          <AccordionItem value="stairs" id="spec-section-stairs" className="border rounded-lg px-4">
            <AccordionTrigger className="text-sm font-medium">Stairs</AccordionTrigger>
            <AccordionContent>
              <Card className="border-muted">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base">
                    Stair Design
                    {stairResult.validation.valid ? (
                      <Badge variant="secondary" className="gap-1">
                        <CheckCircle2 className="h-3 w-3" /> NCC Compliant
                      </Badge>
                    ) : (
                      <Badge variant="destructive" className="gap-1">
                        <AlertCircle className="h-3 w-3" /> Check Errors
                      </Badge>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-5">
                  <StairSegmented
                    label="Stair Type"
                    options={STAIR_TYPE_OPTIONS}
                    value={stairInputs.stairType}
                    onChange={(value) => updateStairInput("stairType", value)}
                  />

                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <StairStepperInput
                      label="Total Rise"
                      value={stairInputs.totalRise}
                      min={100}
                      max={4000}
                      step={50}
                      onChange={(value) => updateStairInput("totalRise", value)}
                    />
                    <StairStepperInput
                      label="Stair Width"
                      value={stairInputs.stairWidth}
                      min={600}
                      max={2400}
                      step={50}
                      onChange={(value) => updateStairInput("stairWidth", value)}
                    />
                    <StairStepperInput
                      label="Riser Height"
                      value={stairInputs.targetRiser}
                      min={STAIR_LIMITS.riserMin}
                      max={STAIR_LIMITS.riserMax}
                      step={5}
                      onChange={(value) => updateStairInput("targetRiser", value)}
                    />
                    <StairStepperInput
                      label="Going Depth"
                      value={stairInputs.targetGoing}
                      min={STAIR_LIMITS.goingMin}
                      max={STAIR_LIMITS.goingMax}
                      step={10}
                      onChange={(value) => updateStairInput("targetGoing", value)}
                    />
                    <StairStepperInput
                      label="Nosing Overhang"
                      value={stairInputs.nosing}
                      min={0}
                      max={40}
                      step={5}
                      onChange={(value) => updateStairInput("nosing", value)}
                    />
                    {stairInputs.stairType !== "straight" && (
                      <StairStepperInput
                        label="Landing Depth"
                        value={stairInputs.landingDepth}
                        min={750}
                        max={2400}
                        step={50}
                        onChange={(value) => updateStairInput("landingDepth", value)}
                      />
                    )}
                  </div>

                  <div className="border-t pt-4 space-y-4">
                    <h4 className="text-sm font-semibold">Materials</h4>
                    <StairSegmented
                      label="Tread Material"
                      options={STAIR_TREAD_OPTIONS}
                      value={stairInputs.treadMaterial}
                      onChange={(value) => updateStairInput("treadMaterial", value)}
                    />
                    <StairSegmented
                      label="Riser Style"
                      options={STAIR_RISER_OPTIONS}
                      value={stairInputs.riserStyle}
                      onChange={(value) => updateStairInput("riserStyle", value)}
                    />
                    <StairSegmented
                      label="Stringer Material"
                      options={STAIR_STRINGER_OPTIONS}
                      value={stairInputs.stringerMaterial}
                      onChange={(value) => updateStairInput("stringerMaterial", value)}
                    />
                    <StairSegmented
                      label="Handrail"
                      options={STAIR_HANDRAIL_OPTIONS}
                      value={stairInputs.handrailStyle}
                      disabledValues={stairResult.geometry.handrailRequired ? ["none"] : []}
                      onChange={(value) => updateStairInput("handrailStyle", value)}
                    />
                    {stairResult.geometry.handrailRequired && (
                      <p className="text-xs text-amber-700">Handrail is required when total rise exceeds 1000mm.</p>
                    )}
                  </div>

                  <div className="border-t pt-4">
                    <h4 className="text-sm font-semibold">Geometry</h4>
                    <div className="mt-2 grid grid-cols-1 gap-x-8 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
                      <div><span className="text-muted-foreground">Risers:</span> <span className="font-mono">{stairResult.geometry.numberOfRisers}</span></div>
                      <div><span className="text-muted-foreground">Actual riser:</span> <span className="font-mono">{formatStairNumber(stairResult.geometry.actualRiser)}mm</span></div>
                      <div><span className="text-muted-foreground">Goings:</span> <span className="font-mono">{stairResult.geometry.numberOfGoings}</span></div>
                      <div><span className="text-muted-foreground">Going depth:</span> <span className="font-mono">{stairResult.geometry.going}mm</span></div>
                      <div><span className="text-muted-foreground">2R + G:</span> <span className={`font-mono ${stairResult.geometry.slopeValue < STAIR_LIMITS.slopeMin || stairResult.geometry.slopeValue > STAIR_LIMITS.slopeMax ? "text-destructive" : "text-green-600"}`}>{stairResult.geometry.slopeValue}mm</span></div>
                      <div><span className="text-muted-foreground">Stair angle:</span> <span className="font-mono">{formatStairNumber(stairResult.geometry.stairAngle)}°</span></div>
                      <div><span className="text-muted-foreground">Stringer length:</span> <span className="font-mono">{stairResult.geometry.stringerLength}mm</span></div>
                      <div><span className="text-muted-foreground">Total run:</span> <span className="font-mono">{stairResult.geometry.totalGoing}mm</span></div>
                      <div><span className="text-muted-foreground">Tread depth:</span> <span className="font-mono">{stairResult.geometry.treadDepth}mm ({stairResult.geometry.boardsPerTread} boards)</span></div>
                    </div>
                  </div>

                  <div className="border-t pt-4">
                    <h4 className="text-sm font-semibold">Bill of Materials</h4>
                    <div className="mt-2 grid grid-cols-1 gap-x-8 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
                      <div><span className="text-muted-foreground">Stringers:</span> <span className="font-mono">{stairResult.bom.stringerCount} x {stairResult.bom.stringerLengthMm}mm</span></div>
                      <div><span className="text-muted-foreground">Tread boards:</span> <span className="font-mono">{stairResult.bom.treadBoards} x {stairResult.bom.treadCutLength}mm</span></div>
                      {stairResult.bom.riserBoards > 0 && (
                        <div><span className="text-muted-foreground">Riser boards:</span> <span className="font-mono">{stairResult.bom.riserBoards} x {stairResult.bom.riserCutLength}mm</span></div>
                      )}
                      {stairResult.bom.handrailLength > 0 && (
                        <div><span className="text-muted-foreground">Handrail:</span> <span className="font-mono">{stairResult.bom.handrailLength}mm total</span></div>
                      )}
                      {stairResult.bom.balustradePosts > 0 && (
                        <div><span className="text-muted-foreground">Posts:</span> <span className="font-mono">{stairResult.bom.balustradePosts}</span></div>
                      )}
                      {stairResult.bom.landingBoards > 0 && (
                        <div><span className="text-muted-foreground">Landing boards:</span> <span className="font-mono">{stairResult.bom.landingBoards}</span></div>
                      )}
                    </div>
                  </div>

                  {(stairResult.validation.errors.length > 0 || stairResult.validation.warnings.length > 0) && (
                    <div className="border-t pt-4 space-y-2">
                      {stairResult.validation.errors.map((message, index) => (
                        <p key={`stair-error-${index}`} className="flex items-start gap-2 text-xs text-destructive">
                          <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" /> {message}
                        </p>
                      ))}
                      {stairResult.validation.warnings.map((message, index) => (
                        <p key={`stair-warning-${index}`} className="flex items-start gap-2 text-xs text-amber-700">
                          <Info className="mt-0.5 h-3 w-3 shrink-0" /> {message}
                        </p>
                      ))}
                    </div>
                  )}

                  <div className="border-t pt-4">
                    <h4 className="mb-2 text-sm font-semibold">Side View</h4>
                    <div className="rounded-md border bg-white p-3">
                      <DeckStairSideView geometry={stairResult.geometry} inputs={stairInputs} />
                    </div>
                  </div>

                  <div className="border-t pt-4">
                    <SelectField label="Gate" value={form.specStairsGate || ""} onChange={(v) => update("specStairsGate", v)} options={["None", "Top", "Bottom", "Both"]} />
                  </div>
                </CardContent>
              </Card>
              {/* Stairs Checklist */}
              <div className="mt-4 border-t pt-3">
                <SortableChecklist
                  label="Stairs Checklist"
                  items={stairsChecks}
                  onChange={setStairsChecks}
                  placeholder="Stairs item..."
                  notesPlaceholder="Notes (optional)..."
                  lockItemLabels={!isSuperAdmin}
                  defaultItems={defaultChecklistItems("stairs")}
                />
              </div>
              {/* General notes */}
              <div className="mt-4">
                <Label className="text-xs font-medium text-muted-foreground mb-1 block">General Notes</Label>
                <Textarea className="text-sm min-h-[60px]" placeholder="Additional stairs notes..." value={form.specStairsNotes || ""} onChange={(e) => update("specStairsNotes", e.target.value)} />
              </div>
            </AccordionContent>
          </AccordionItem>
          )}

          {/* Balustrade */}
          {isSectionVisible("balustrade") && (
          <AccordionItem value="balustrade" id="spec-section-balustrade" className="border rounded-lg px-4">
            <AccordionTrigger className="text-sm font-medium">Balustrade</AccordionTrigger>
            <AccordionContent>
              {/* Height */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 mb-4">
                <Field label="Balustrade Height" suffix="mm" placeholder="e.g. 1000" min={800} max={1500} value={form.specBalustradeHeight || ""} onChange={(v) => update("specBalustradeHeight", v)} />
                <Field label="Linear Metres" suffix="m" placeholder="e.g. 12.5" value={form.specBalustradeLM || ""} onChange={(v) => update("specBalustradeLM", v)} />
              </div>

              {/* Tubular Balustrades */}
              <div className="border-t pt-3 mb-4">
                <Label className="text-sm font-medium mb-2 block">Tubular Balustrades</Label>
                <div className="space-y-2">
                  <div>
                    <Label className="text-xs text-muted-foreground mb-1 block">Vertical 16.5mm square</Label>
                    <div className="flex flex-wrap gap-4">
                      {["Picket full", "Picket 3 rail"].map(opt => (
                        <label key={opt} className="flex items-center gap-2 text-xs cursor-pointer">
                          <Checkbox checked={(form.specBalTubularVertical || "").split(",").includes(opt)} onCheckedChange={(checked) => {
                            const current = (form.specBalTubularVertical || "").split(",").filter(Boolean);
                            const next = checked ? [...current, opt] : current.filter(v => v !== opt);
                            update("specBalTubularVertical", next.join(","));
                          }} />
                          {opt}
                        </label>
                      ))}
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground mb-1 block">Horizontal 65x16.5mm slat</Label>
                    <div className="flex flex-wrap gap-4">
                      {["Slat full", "Slat 3 rail"].map(opt => (
                        <label key={opt} className="flex items-center gap-2 text-xs cursor-pointer">
                          <Checkbox checked={(form.specBalTubularHorizSlat || "").split(",").includes(opt)} onCheckedChange={(checked) => {
                            const current = (form.specBalTubularHorizSlat || "").split(",").filter(Boolean);
                            const next = checked ? [...current, opt] : current.filter(v => v !== opt);
                            update("specBalTubularHorizSlat", next.join(","));
                          }} />
                          {opt}
                        </label>
                      ))}
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground mb-1 block">Vertical 65x16.5mm slat</Label>
                    <div className="flex flex-wrap gap-4">
                      {["Slat full", "Slat 3 rail"].map(opt => (
                        <label key={opt} className="flex items-center gap-2 text-xs cursor-pointer">
                          <Checkbox checked={(form.specBalTubularVertSlat || "").split(",").includes(opt)} onCheckedChange={(checked) => {
                            const current = (form.specBalTubularVertSlat || "").split(",").filter(Boolean);
                            const next = checked ? [...current, opt] : current.filter(v => v !== opt);
                            update("specBalTubularVertSlat", next.join(","));
                          }} />
                          {opt}
                        </label>
                      ))}
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground mb-1 block">Stairs</Label>
                    <div className="flex flex-wrap gap-4">
                      <label className="flex items-center gap-2 text-xs cursor-pointer">
                        <Checkbox checked={form.specBalTubularStairs === "Racked"} onCheckedChange={(checked) => update("specBalTubularStairs", checked ? "Racked" : "")} />
                        Racked
                      </label>
                    </div>
                  </div>
                </div>
              </div>

              {/* Glass Balustrades */}
              <div className="border-t pt-3 mb-4">
                <Label className="text-sm font-medium mb-2 block">Glass Balustrades</Label>
                <div className="space-y-2">
                  <div>
                    <Label className="text-xs text-muted-foreground mb-1 block">Type</Label>
                    <div className="flex flex-wrap gap-4">
                      {["Glass Frameless", "Glass Semi Frameless", "Glass Framed"].map(opt => (
                        <label key={opt} className="flex items-center gap-2 text-xs cursor-pointer">
                          <Checkbox checked={(form.specBalGlassType || "").split(",").includes(opt)} onCheckedChange={(checked) => {
                            const current = (form.specBalGlassType || "").split(",").filter(Boolean);
                            const next = checked ? [...current, opt] : current.filter(v => v !== opt);
                            update("specBalGlassType", next.join(","));
                          }} />
                          {opt}
                        </label>
                      ))}
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground mb-1 block">Glass Tint</Label>
                    <div className="flex flex-wrap gap-4">
                      {["Clear", "Grey", "Bronze", "Green"].map(opt => (
                        <label key={opt} className="flex items-center gap-2 text-xs cursor-pointer">
                          <Checkbox checked={(form.specBalGlassTint || "").split(",").includes(opt)} onCheckedChange={(checked) => {
                            const current = (form.specBalGlassTint || "").split(",").filter(Boolean);
                            const next = checked ? [...current, opt] : current.filter(v => v !== opt);
                            update("specBalGlassTint", next.join(","));
                          }} />
                          {opt}
                        </label>
                      ))}
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground mb-1 block">Spigots</Label>
                    <div className="flex flex-wrap gap-4">
                      {["Chrome", "Powder coated"].map(opt => (
                        <label key={opt} className="flex items-center gap-2 text-xs cursor-pointer">
                          <Checkbox checked={(form.specBalGlassSpigots || "").split(",").includes(opt)} onCheckedChange={(checked) => {
                            const current = (form.specBalGlassSpigots || "").split(",").filter(Boolean);
                            const next = checked ? [...current, opt] : current.filter(v => v !== opt);
                            update("specBalGlassSpigots", next.join(","));
                          }} />
                          {opt}
                        </label>
                      ))}
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground mb-1 block">Stairs</Label>
                    <div className="flex flex-wrap gap-4">
                      <label className="flex items-center gap-2 text-xs cursor-pointer">
                        <Checkbox checked={form.specBalGlassStairs === "Racked Glass"} onCheckedChange={(checked) => update("specBalGlassStairs", checked ? "Racked Glass" : "")} />
                        Racked Glass
                      </label>
                    </div>
                  </div>
                </div>
              </div>

              {/* Stainless Steel and Wire Balustrades */}
              <div className="border-t pt-3 mb-4">
                <Label className="text-sm font-medium mb-2 block">Stainless Steel & Wire Balustrades</Label>
                <p className="text-xs text-muted-foreground mb-2">3.2mm stainless steel wire</p>
                <div className="space-y-2">
                  <div>
                    <Label className="text-xs text-muted-foreground mb-1 block">Type</Label>
                    <div className="flex flex-wrap gap-4">
                      {["Horizontal Wire Balustrade", "Vertical Wire Balustrade"].map(opt => (
                        <label key={opt} className="flex items-center gap-2 text-xs cursor-pointer">
                          <Checkbox checked={(form.specBalWireType || "").split(",").includes(opt)} onCheckedChange={(checked) => {
                            const current = (form.specBalWireType || "").split(",").filter(Boolean);
                            const next = checked ? [...current, opt] : current.filter(v => v !== opt);
                            update("specBalWireType", next.join(","));
                          }} />
                          {opt}
                        </label>
                      ))}
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground mb-1 block">Finish</Label>
                    <div className="flex flex-wrap gap-4">
                      {["Satin finish", "Mirror polish"].map(opt => (
                        <label key={opt} className="flex items-center gap-2 text-xs cursor-pointer">
                          <Checkbox checked={(form.specBalWireFinish || "").split(",").includes(opt)} onCheckedChange={(checked) => {
                            const current = (form.specBalWireFinish || "").split(",").filter(Boolean);
                            const next = checked ? [...current, opt] : current.filter(v => v !== opt);
                            update("specBalWireFinish", next.join(","));
                          }} />
                          {opt}
                        </label>
                      ))}
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground mb-1 block">Frame</Label>
                    <div className="flex flex-wrap gap-4">
                      {["Square", "Rectangle", "Round"].map(opt => (
                        <label key={opt} className="flex items-center gap-2 text-xs cursor-pointer">
                          <Checkbox checked={(form.specBalWireFrame || "").split(",").includes(opt)} onCheckedChange={(checked) => {
                            const current = (form.specBalWireFrame || "").split(",").filter(Boolean);
                            const next = checked ? [...current, opt] : current.filter(v => v !== opt);
                            update("specBalWireFrame", next.join(","));
                          }} />
                          {opt}
                        </label>
                      ))}
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground mb-1 block">Stairs</Label>
                    <div className="flex flex-wrap gap-4">
                      {["Vertical Wire Balustrade Racked", "Horizontal Wire Balustrade"].map(opt => (
                        <label key={opt} className="flex items-center gap-2 text-xs cursor-pointer">
                          <Checkbox checked={(form.specBalWireStairs || "").split(",").includes(opt)} onCheckedChange={(checked) => {
                            const current = (form.specBalWireStairs || "").split(",").filter(Boolean);
                            const next = checked ? [...current, opt] : current.filter(v => v !== opt);
                            update("specBalWireStairs", next.join(","));
                          }} />
                          {opt}
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Privacy Screen Balustrades */}
              <div className="border-t pt-3 mb-4">
                <Label className="text-sm font-medium mb-2 block">Privacy Screen Balustrades</Label>
                <div className="flex flex-wrap gap-4">
                  {["Fixed louvres", "Screens or slats", "Laser-cut decorative screens"].map(opt => (
                    <label key={opt} className="flex items-center gap-2 text-xs cursor-pointer">
                      <Checkbox checked={(form.specBalPrivacy || "").split(",").includes(opt)} onCheckedChange={(checked) => {
                        const current = (form.specBalPrivacy || "").split(",").filter(Boolean);
                        const next = checked ? [...current, opt] : current.filter(v => v !== opt);
                        update("specBalPrivacy", next.join(","));
                      }} />
                      {opt}
                    </label>
                  ))}
                </div>
              </div>

              {/* Posts */}
              <div className="border-t pt-3 mb-4">
                <Label className="text-sm font-medium mb-2 block">Posts</Label>
                <div className="space-y-2">
                  <div>
                    <Label className="text-xs text-muted-foreground mb-1 block">Type</Label>
                    <div className="flex flex-wrap gap-4">
                      {["50x50", "65x65", "90x90"].map(opt => (
                        <label key={opt} className="flex items-center gap-2 text-xs cursor-pointer">
                          <Checkbox checked={(form.specBalPostType || "").split(",").includes(opt)} onCheckedChange={(checked) => {
                            const current = (form.specBalPostType || "").split(",").filter(Boolean);
                            const next = checked ? [...current, opt] : current.filter(v => v !== opt);
                            update("specBalPostType", next.join(","));
                          }} />
                          {opt}
                        </label>
                      ))}
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground mb-1 block">Post Mount</Label>
                    <div className="flex flex-wrap gap-4">
                      {["Core drill", "Base plate & Shroud", "Face mount plate", "Footings"].map(opt => (
                        <label key={opt} className="flex items-center gap-2 text-xs cursor-pointer">
                          <Checkbox checked={(form.specBalPostMount || "").split(",").includes(opt)} onCheckedChange={(checked) => {
                            const current = (form.specBalPostMount || "").split(",").filter(Boolean);
                            const next = checked ? [...current, opt] : current.filter(v => v !== opt);
                            update("specBalPostMount", next.join(","));
                          }} />
                          {opt}
                        </label>
                      ))}
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-2">
                    <ColourField label="Post Colour" value={form.specBalPostColour || ""} onChange={(v) => update("specBalPostColour", v)} colours={getColoursForSection("balustrade")} />
                  </div>
                </div>
              </div>

              {/* Rail Top Style */}
              <div className="border-t pt-3 mb-4">
                <Label className="text-sm font-medium mb-2 block">Rail Top Style</Label>
                <div className="flex flex-wrap gap-4 mb-2">
                  {["Square", "Rectangle", "Round", "Oval"].map(opt => (
                    <label key={opt} className="flex items-center gap-2 text-xs cursor-pointer">
                      <Checkbox checked={(form.specBalRailTopStyle || "").split(",").includes(opt)} onCheckedChange={(checked) => {
                        const current = (form.specBalRailTopStyle || "").split(",").filter(Boolean);
                        const next = checked ? [...current, opt] : current.filter(v => v !== opt);
                        update("specBalRailTopStyle", next.join(","));
                      }} />
                      {opt}
                    </label>
                  ))}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <ColourField label="Rail Top Colour" value={form.specBalRailTopColour || ""} onChange={(v) => update("specBalRailTopColour", v)} colours={getColoursForSection("balustrade")} />
                </div>
              </div>

              {/* Rail Bottom Style */}
              <div className="border-t pt-3 mb-4">
                <Label className="text-sm font-medium mb-2 block">Rail Bottom Style</Label>
                <div className="flex flex-wrap gap-4 mb-2">
                  {["Square", "Rectangle", "Round", "Oval"].map(opt => (
                    <label key={opt} className="flex items-center gap-2 text-xs cursor-pointer">
                      <Checkbox checked={(form.specBalRailBottomStyle || "").split(",").includes(opt)} onCheckedChange={(checked) => {
                        const current = (form.specBalRailBottomStyle || "").split(",").filter(Boolean);
                        const next = checked ? [...current, opt] : current.filter(v => v !== opt);
                        update("specBalRailBottomStyle", next.join(","));
                      }} />
                      {opt}
                    </label>
                  ))}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <ColourField label="Rail Bottom Colour" value={form.specBalRailBottomColour || ""} onChange={(v) => update("specBalRailBottomColour", v)} colours={getColoursForSection("balustrade")} />
                </div>
              </div>

              {/* Compliance */}
              <div className="border-t pt-3 mb-4">
                <Label className="text-sm font-medium mb-2 block">Compliance</Label>
                <div className="flex flex-wrap gap-4">
                  <label className="flex items-center gap-2 text-xs cursor-pointer">
                    <Checkbox checked={form.specBalCertification === "Yes"} onCheckedChange={(checked) => update("specBalCertification", checked ? "Yes" : "")} />
                    Certification required
                  </label>
                </div>
              </div>

              {/* Notes */}
              <div className="grid grid-cols-1 gap-4">
                <Field label="Balustrade Notes" placeholder="Additional balustrade requirements..." value={form.specBalustradeNotes || ""} onChange={(v) => update("specBalustradeNotes", v)} />
              </div>
            </AccordionContent>
          </AccordionItem>
          )}

          {/* Electrical */}
          {isSectionVisible("electrical") && (
          <AccordionItem value="electrical" id="spec-section-electrical" className="border rounded-lg px-4">
            <AccordionTrigger className="text-sm font-medium">Electrical</AccordionTrigger>
            <AccordionContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                {electricalFanCategories.length > 0 ? (
                  <FilteredSelect
                    label="Fan Type"
                    value={form.specElecFanType || ""}
                    onChange={(v) => update("specElecFanType", v)}
                    categories={electricalFanCategories}
                  />
                ) : (
                  <SelectField label="Fan Type" value={form.specElecFanType || ""} onChange={(v) => update("specElecFanType", v)} options={electricalFanOptions} />
                )}
                <SelectField
                  label="Fan Qty"
                  value={form.specElecFan === "None" ? "" : form.specElecFan || ""}
                  onChange={(v) => setForm(prev => ({
                    ...prev,
                    specElecFan: v,
                    specElecFanType: v && !prev.specElecFanType ? defaultElectricalFanType : prev.specElecFanType,
                  }))}
                  options={["1", "2", "3", "4"]}
                />
              </div>

              {/* Lights - multiple rows */}
              <div className="mt-4 border-t pt-3">
                <div className="flex items-center justify-between mb-2">
                  <Label className="text-xs font-medium text-muted-foreground">Lights</Label>
                  <Button variant="outline" size="sm" className="h-6 text-xs" onClick={() => setElecLightTypes(prev => [...prev, { type: defaultElectricalLightType, qty: 1 }])}>
                    <Plus className="h-3 w-3 mr-1" /> Add Light
                  </Button>
                </div>
                {elecLightTypes.map((row, idx) => (
                  <div key={idx} className="flex items-center gap-2 mb-2">
                    <Select value={row.type} onValueChange={(v) => { const next = [...elecLightTypes]; next[idx] = { ...next[idx], type: v }; setElecLightTypes(next); }}>
                      <SelectTrigger className="h-8 text-sm flex-1 min-w-0">
                        <SelectValue placeholder="Select light..." />
                      </SelectTrigger>
                      <SelectContent>
                        {electricalLightCategories.length > 0 ? (
                          electricalLightCategories.map((cat, catIdx) => (
                            <SelectGroup key={cat.id}>
                              {catIdx > 0 && <SelectSeparator />}
                              <SelectLabel>{cat.label}</SelectLabel>
                              {cat.options.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                            </SelectGroup>
                          ))
                        ) : (
                          electricalLightOptions.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)
                        )}
                      </SelectContent>
                    </Select>
                    <Input className="h-8 text-sm w-16" type="number" min={1} value={row.qty} onChange={(e) => { const next = [...elecLightTypes]; next[idx] = { ...next[idx], qty: parseInt(e.target.value) || 1 }; setElecLightTypes(next); }} />
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setElecLightTypes(prev => prev.filter((_, i) => i !== idx))}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
                {elecLightTypes.length > 0 && (
                  <div className="flex items-center justify-end mt-1 text-xs text-muted-foreground font-medium">
                    Total Lights: {totalElecLights}
                  </div>
                )}
              </div>

              {/* Light Switches */}
              <div className="mt-4 border-t pt-3">
                <div className="flex items-center justify-between mb-2">
                  <Label className="text-xs font-medium text-muted-foreground">Light Switches</Label>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="flex items-center gap-2">
                    <Label className="text-xs whitespace-nowrap">One-way</Label>
                    <Input className="h-8 text-sm w-20" type="number" min={0} value={form.specElecSwitchOneWay || ""} onChange={(e) => update("specElecSwitchOneWay", e.target.value)} placeholder="0" />
                  </div>
                  <div className="flex items-center gap-2">
                    <Label className="text-xs whitespace-nowrap">Two-way</Label>
                    <Input className="h-8 text-sm w-20" type="number" min={0} value={form.specElecSwitchTwoWay || ""} onChange={(e) => update("specElecSwitchTwoWay", e.target.value)} placeholder="0" />
                  </div>
                  <div className="flex items-center gap-2">
                    <Label className="text-xs whitespace-nowrap">Dimmer</Label>
                    <Input className="h-8 text-sm w-20" type="number" min={0} value={form.specElecSwitchDimmer || ""} onChange={(e) => update("specElecSwitchDimmer", e.target.value)} placeholder="0" />
                  </div>
                </div>
              </div>

              {/* GPOs - multiple rows */}
              <div className="mt-4 border-t pt-3">
                <div className="flex items-center justify-between mb-2">
                  <Label className="text-xs font-medium text-muted-foreground">GPOs</Label>
                  <Button variant="outline" size="sm" className="h-6 text-xs" onClick={() => setElecGpos(prev => [...prev, { type: "Double GPO", location: "Indoor", qty: 1 }])}>
                    <Plus className="h-3 w-3 mr-1" /> Add GPO
                  </Button>
                </div>
                {elecGpos.map((row, idx) => (
                  <div key={idx} className="flex items-center gap-2 mb-2">
                    <Select value={row.type} onValueChange={(v) => { const next = [...elecGpos]; next[idx] = { ...next[idx], type: v as any }; setElecGpos(next); }}>
                      <SelectTrigger className="h-8 text-sm w-28 min-w-0">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Single GPO">Single GPO</SelectItem>
                        <SelectItem value="Double GPO">Double GPO</SelectItem>
                      </SelectContent>
                    </Select>
                    <Select value={row.location} onValueChange={(v) => { const next = [...elecGpos]; next[idx] = { ...next[idx], location: v as any }; setElecGpos(next); }}>
                      <SelectTrigger className="h-8 text-sm w-24 min-w-0">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Indoor">Indoor</SelectItem>
                        <SelectItem value="Outdoor">Outdoor</SelectItem>
                      </SelectContent>
                    </Select>
                    <Input className="h-8 text-sm w-16" type="number" min={1} value={row.qty} onChange={(e) => { const next = [...elecGpos]; next[idx] = { ...next[idx], qty: parseInt(e.target.value) || 1 }; setElecGpos(next); }} />
                    <label className="flex items-center gap-1 text-xs text-muted-foreground whitespace-nowrap cursor-pointer">
                      <Checkbox checked={row.onIwp || false} onCheckedChange={(v) => { const next = [...elecGpos]; next[idx] = { ...next[idx], onIwp: !!v }; setElecGpos(next); }} className="h-4 w-4" />
                      IWP
                    </label>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setElecGpos(prev => prev.filter((_, i) => i !== idx))}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
                {elecGpos.length > 0 && (
                  <div className="flex items-center justify-end mt-1 text-xs text-muted-foreground font-medium">
                    Total GPOs: {elecGpos.reduce((sum, r) => sum + (r.qty || 0), 0)}
                  </div>
                )}
              </div>

              {/* Extra Electrical Work */}
              <div className="mt-4 border-t pt-3">
                <SortableChecklist
                  label="Work Checklist"
                  items={elecExtraWork}
                  onChange={(items) => setElecExtraWork(items as ElecExtraItem[])}
                  placeholder="Electrical work item..."
                  notesPlaceholder="Notes (optional)..."
                  showResponsibility
                  lockItemLabels={!isSuperAdmin}
                  defaultItems={defaultChecklistItems("electrical")}
                />
              </div>

              {/* Electrical Notes */}
              <div className="mt-4 border-t pt-3">
                <Label className="text-xs font-medium text-muted-foreground">Electrical Notes</Label>
                <Textarea
                  value={form.specElecNotes || ""}
                  onChange={(e) => update("specElecNotes", e.target.value)}
                  rows={3}
                  className="text-sm mt-1"
                  placeholder="Any additional electrical notes..."
                />
              </div>
            </AccordionContent>
          </AccordionItem>
          )}

          {/* Concreting */}
          {isSectionVisible("concreting") && (
          <AccordionItem value="concreting" id="spec-section-concreting" className="border rounded-lg px-4">
            <AccordionTrigger className="text-sm font-medium">Concreting</AccordionTrigger>
            <AccordionContent>
              <SortableChecklist
                label="Work Checklist"
                items={concreteChecks}
                onChange={setConcreteChecks}
                placeholder="Concreting item..."
                notesPlaceholder="Notes (optional)..."
                showResponsibility
                lockItemLabels={!isSuperAdmin}
                defaultItems={defaultChecklistItems("concreting")}
              />
              {/* Detail fields - only show when at least one checklist item is checked */}
              {concreteChecks.some(c => c.checked) && (<>
              <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                <Field label="Thickness" suffix="mm" placeholder="e.g. 100" min={50} max={300} value={form.specConcreteThickness || ""} onChange={(v) => update("specConcreteThickness", v)} />
                <Field label="Area" suffix="m²" placeholder="e.g. 20" value={form.specConcreteArea || ""} onChange={(v) => update("specConcreteArea", v)} />
                <SelectField label="Polished Concrete" value={form.specConcretePolished || ""} onChange={(v) => update("specConcretePolished", v)} options={["None", "Grind & seal", "Full polish", "Honed"]} />
                <Field label="Colour" placeholder="e.g. Charcoal oxide" value={form.specConcreteColour || ""} onChange={(v) => update("specConcreteColour", v)} />
              </div>
              {/* General notes */}
              <div className="mt-4">
                <Label className="text-xs font-medium text-muted-foreground mb-1 block">General Notes</Label>
                <Textarea className="text-sm min-h-[60px]" placeholder="Additional concreting notes..." value={form.specConcreteNotes || ""} onChange={(e) => update("specConcreteNotes", e.target.value)} />
              </div>
              </>)}
            </AccordionContent>
          </AccordionItem>
          )}

          {/* Demolition Works */}
          {isSectionVisible("demolition") && (
          <AccordionItem value="demolition" id="spec-section-demolition" className="border rounded-lg px-4">
            <AccordionTrigger className="text-sm font-medium">Demolition Works</AccordionTrigger>
            <AccordionContent>
              <SortableChecklist
                label="Work Checklist"
                items={demolitionWorkItems}
                onChange={setDemolitionWorkItems}
                placeholder="Demolition item..."
                notesPlaceholder="Qty m² or notes..."
                showResponsibility
                lockItemLabels={!isSuperAdmin}
                defaultItems={defaultChecklistItems("demolition")}
              />
              {/* General notes */}
              <div className="mt-4">
                <Label className="text-xs font-medium text-muted-foreground mb-1 block">General Notes</Label>
                <Textarea className="text-sm min-h-[60px]" placeholder="Additional demolition notes..." value={form.specDemolitionNotes || ""} onChange={(e) => update("specDemolitionNotes", e.target.value)} />
              </div>
            </AccordionContent>
          </AccordionItem>
          )}

          {/* Work on Existing House */}
          {isSectionVisible("existingHouse") && (
          <AccordionItem value="existingHouse" id="spec-section-existingHouse" className="border rounded-lg px-4">
            <AccordionTrigger className="text-sm font-medium">Work on Existing House</AccordionTrigger>
            <AccordionContent>
              <SortableChecklist
                label="Work Checklist"
                items={existingChecks}
                onChange={setExistingChecks}
                placeholder="Work item..."
                notesPlaceholder="Notes (optional)..."
                showResponsibility
                lockItemLabels={!isSuperAdmin}
                defaultItems={defaultChecklistItems("existingHouse")}
              />
              {/* General notes */}
              <div className="mt-4">
                <Label className="text-xs font-medium text-muted-foreground mb-1 block">General Notes</Label>
                <Textarea className="text-sm min-h-[60px]" placeholder="Additional notes for work on existing house..." value={form.specExistingNotes || ""} onChange={(e) => update("specExistingNotes", e.target.value)} />
              </div>
            </AccordionContent>
          </AccordionItem>
          )}

          {/* Plumbing & Drainage */}
          {isSectionVisible("plumbing") && (
          <AccordionItem value="plumbing" id="spec-section-plumbing" className="border rounded-lg px-4">
            <AccordionTrigger className="text-sm font-medium">Plumbing & Drainage</AccordionTrigger>
            <AccordionContent>
              <SortableChecklist
                label="Work Checklist"
                items={plumbChecks}
                onChange={setPlumbChecks}
                placeholder="Plumbing item..."
                notesPlaceholder="Notes (optional)..."
                showResponsibility
                lockItemLabels={!isSuperAdmin}
                defaultItems={defaultChecklistItems("plumbing")}
              />
              {/* General notes */}
              <div className="mt-4">
                <Label className="text-xs font-medium text-muted-foreground mb-1 block">General Notes</Label>
                <Textarea className="text-sm min-h-[60px]" placeholder="Additional plumbing & drainage notes..." value={form.specPlumbNotes || ""} onChange={(e) => update("specPlumbNotes", e.target.value)} />
              </div>
            </AccordionContent>
          </AccordionItem>
          )}


          {/* Additional Costs (Priced Checklist) */}
          {isSectionVisible("additionalCosts") && (
          <AccordionItem value="additionalCosts" id="spec-section-additionalCosts" className="border rounded-lg px-4">
            <AccordionTrigger className="text-sm font-medium">Additional Costs (Priced)</AccordionTrigger>
            <AccordionContent>
              <div className="space-y-4">
                <p className="text-xs text-muted-foreground">Select items and enter quantities. Line totals flow into the quote's Additional Costs.</p>
                {activeAdditionalCostItems.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic">No priced additional cost items configured. Admin can add items in Settings → Additional Costs Pricing.</p>
                ) : (
                  <>
                    {/* Group by section */}
                    {Object.entries(
                      activeAdditionalCostItems.reduce<Record<string, typeof activeAdditionalCostItems>>((acc, item) => {
                        const section = item.section || "other";
                        if (!acc[section]) acc[section] = [];
                        acc[section]!.push(item);
                        return acc;
                      }, {})
                    ).map(([section, sectionItems]) => (
                      <div key={section} className="space-y-2">
                        <h4 className="text-xs font-semibold capitalize text-muted-foreground border-b pb-1">{section.replace(/_/g, " ")}</h4>
                        {(sectionItems || []).map((item) => {
                          const sel = checklistSelections.find(s => s.itemId === item.id);
                          const isChecked = !!sel;
                          const qty = sel?.qty || 1;
                          const lineTotal = isChecked ? parseFloat(String(item.unitPrice)) * qty : 0;
                          return (
                            <div key={item.id} className="flex items-center gap-3 py-1.5 border-b border-dashed last:border-0">
                              <Checkbox
                                checked={isChecked}
                                onCheckedChange={(checked) => {
                                  if (checked) {
                                    setChecklistSelections(prev => [...prev, {
                                      itemId: item.id,
                                      label: item.label,
                                      unitPrice: parseFloat(String(item.unitPrice)),
                                      qty: 1,
                                      total: parseFloat(String(item.unitPrice)),
                                      section: item.section,
                                      unit: item.unit,
                                    }]);
                                  } else {
                                    setChecklistSelections(prev => prev.filter(s => s.itemId !== item.id));
                                  }
                                }}
                              />
                              <span className={`flex-1 text-sm ${!isChecked ? "text-muted-foreground" : ""}`}>{item.label}</span>
                              <span className="text-xs text-muted-foreground whitespace-nowrap">${parseFloat(String(item.unitPrice)).toFixed(2)}/{item.unit}</span>
                              {isChecked && (
                                <>
                                  <Input
                                    type="number"
                                    min={1}
                                    step={1}
                                    value={qty}
                                    onChange={(e) => {
                                      const newQty = Math.max(1, parseInt(e.target.value) || 1);
                                      setChecklistSelections(prev => prev.map(s =>
                                        s.itemId === item.id
                                          ? { ...s, qty: newQty, total: parseFloat(String(item.unitPrice)) * newQty }
                                          : s
                                      ));
                                    }}
                                    className="h-7 w-16 text-xs text-center"
                                  />
                                  <span className="text-xs font-medium w-20 text-right">${lineTotal.toFixed(2)}</span>
                                </>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ))}
                    {/* Subtotal */}
                    {checklistSelections.length > 0 && (
                      <div className="flex justify-end items-center gap-2 pt-3 border-t">
                        <span className="text-sm font-medium">Checklist Subtotal:</span>
                        <span className="text-sm font-bold">${checklistSelections.reduce((sum, s) => sum + s.total, 0).toFixed(2)}</span>
                      </div>
                    )}
                  </>
                )}
              </div>
            </AccordionContent>
          </AccordionItem>
          )}


          {/* ─── Site Plan & Elevations ─── */}
          {isSectionVisible("sitePlan") && (
          <AccordionItem value="sitePlan" id="spec-section-sitePlan" className="border rounded-lg px-4">
            <AccordionTrigger className="text-sm font-medium">Site Plan & Elevations</AccordionTrigger>
            <AccordionContent>
              <SitePlanElevationSection form={form} quoteId={quoteId} siteAddress={(quote as any)?.siteAddress} onUpdate={update} />
            </AccordionContent>
          </AccordionItem>
          )}

          {/* ─── Adjustments (moved from OPQ Job Financials) ─── */}
          {isSectionVisible("adjustments") && (
          <AccordionItem value="adjustments" id="spec-section-adjustments" className="border rounded-lg px-4">
            <AccordionTrigger className="text-sm font-medium">Adjustments</AccordionTrigger>
            <AccordionContent>
              <div className="space-y-4">
                <div className="flex gap-2 justify-end items-center">
                  {adjSaveStatus === "saving" && <span className="text-xs text-muted-foreground">Saving...</span>}
                  {adjSaveStatus === "saved" && <span className="text-xs text-green-600">✓ Saved</span>}
                  <Button size="sm" variant="outline" onClick={handleRecalculateAll} disabled={recalcMutation.isPending || calculateTravelMutation.isPending} className="gap-1.5 text-xs">
                    <RefreshCcw className={`h-3 w-3 ${(recalcMutation.isPending || calculateTravelMutation.isPending) ? 'animate-spin' : ''}`} /> Recalculate All
                  </Button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {/* Delivery */}
                  <div className="space-y-1.5">
                    <Label className="text-xs">Delivery $</Label>
                    {priceSettings.deliveryOptions.length > 0 ? (
                      <select
                        value={(parseFloat(deliveryAmount || "0") || 0).toFixed(2)}
                        onChange={(e) => { setDeliveryAmount(e.target.value); setDeliveryOverride(true); }}
                        className="flex h-8 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      >
                        <option value="0.00">None</option>
                        {priceSettings.deliveryOptions.map((delivery) => (
                          <option key={`${delivery.key}-${delivery.value}`} value={(parseFloat(delivery.value || "0") || 0).toFixed(2)}>
                            {delivery.key} - ${parseFloat(delivery.value || "0").toLocaleString()}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <Input
                        type="number"
                        step="0.01"
                        value={deliveryAmount}
                        onChange={(e) => { setDeliveryAmount(e.target.value); setDeliveryOverride(true); }}
                        className="h-8 text-sm"
                        placeholder="0.00"
                      />
                    )}
                    {deliveryOverride && (
                      <Button variant="ghost" size="sm" className="h-6 text-[10px] text-muted-foreground" onClick={() => { setDeliveryOverride(false); }}>
                        Reset to table suggestion
                      </Button>
                    )}
                    {priceSettings.deliveryOptions.length === 0 && (
                      <p className="text-[10px] text-amber-600">No Delivery rows are configured in Pricing Settings.</p>
                    )}
                  </div>

                  {/* Travel Allowance */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs">Travel Allowance $</Label>
                      <Button variant="outline" size="sm" className="h-6 text-[10px] gap-1" onClick={() => calculateTravelMutation.mutate({ quoteId })} disabled={calculateTravelMutation.isPending}>
                        <Calculator className="h-3 w-3" />
                        {calculateTravelMutation.isPending ? "Calculating..." : "Calculate"}
                      </Button>
                    </div>
                    <Input
                      type="number"
                      step="0.01"
                      value={travelAllowance}
                      onChange={(e) => {
                        if (!isAdmin && (quote as any)?.travelOverridden === false && (quote as any)?.travelDistanceKm) {
                          toast.error("Only admins can override the calculated travel allowance");
                          return;
                        }
                        setTravelAllowance(e.target.value);
                      }}
                      className={`h-8 text-sm ${!isAdmin && (quote as any)?.travelDistanceKm && !(quote as any)?.travelOverridden ? 'bg-muted cursor-not-allowed' : ''}`}
                      placeholder="0.00"
                      readOnly={!isAdmin && !!(quote as any)?.travelDistanceKm && !(quote as any)?.travelOverridden}
                    />
                    {(quote as any)?.travelDistanceKm && (
                      <div className="flex items-center gap-1.5 flex-wrap text-[10px] text-muted-foreground">
                        <MapPin className="h-3 w-3" />
                        <span>{(quote as any).travelDistanceKm}km</span>
                        {(quote as any).travelBranchName && <span className="font-medium">from {(quote as any).travelBranchName}</span>}
                        {(quote as any).travelBandKey && <Badge variant="secondary" className="text-[9px] h-4 px-1">{(quote as any).travelBandKey}</Badge>}
                        {(quote as any).travelOverridden && <Badge variant="outline" className="text-[9px] h-4 px-1 text-amber-600 border-amber-300"><Lock className="h-2.5 w-2.5 mr-0.5" />Override</Badge>}
                      </div>
                    )}
                    {isAdmin && (quote as any)?.travelDistanceKm && !(quote as any)?.travelOverridden && (
                      <Button variant="ghost" size="sm" className="h-5 text-[10px] text-amber-600 p-0" onClick={() => { adjUpdateMutation.mutate({ id: quoteId, travelOverridden: true }); toast.info("Travel allowance unlocked for manual override"); }}>
                        <Lock className="h-2.5 w-2.5 mr-0.5" /> Unlock override
                      </Button>
                    )}
                  </div>

                  {/* Construction Management */}
                  <div className="space-y-1.5">
                    <Label className="text-xs">Construction Mgmt $</Label>
                    {priceSettings.constructionMgmtRates.length > 0 ? (
                      <select
                        value={(parseFloat(constructionMgmtAmount || "0") || 0).toFixed(2)}
                        onChange={(e) => { setConstructionMgmtAmount(e.target.value); setConstructionMgmtOverride(true); }}
                        className="flex h-8 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      >
                        <option value="0.00">None</option>
                        {priceSettings.constructionMgmtRates.map((fee) => (
                          <option key={`${fee.key}-${fee.value}`} value={(parseFloat(fee.value || "0") || 0).toFixed(2)}>
                            {fee.key} - ${parseFloat(fee.value || "0").toLocaleString()}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <Input
                        type="number"
                        step="0.01"
                        value={constructionMgmtAmount}
                        onChange={(e) => { setConstructionMgmtAmount(e.target.value); setConstructionMgmtOverride(true); }}
                        className="h-8 text-sm"
                      />
                    )}
                    {(() => {
                      const mgmtRates = priceSettings.constructionMgmtRates;
                      const roofShape = ((quote as any)?.specRoofShape || "").toLowerCase();
                      const mgmtBreakdown: { label: string; amount: number }[] = [];
                      for (const rate of mgmtRates) {
                        if (roofShape.includes(rate.key.toLowerCase())) {
                          const r = parseFloat(rate.value) || 0;
                          if (r > 0) mgmtBreakdown.push({ label: rate.key, amount: r });
                        }
                      }
                      const mgmtAutoTotal = mgmtBreakdown.reduce((s, b) => s + b.amount, 0);
                      return (
                        <div className="space-y-1">
                          {mgmtBreakdown.length > 0 && (
                            <div className="text-[10px] text-muted-foreground space-y-0.5">
                              <p className="font-medium">Table suggestion: ${mgmtAutoTotal.toFixed(2)}</p>
                              {mgmtBreakdown.map((b, i) => <p key={i} className="pl-2">{b.label}: ${b.amount.toFixed(2)}</p>)}
                            </div>
                          )}
                          {!constructionMgmtOverride && mgmtAutoTotal > 0 && constructionMgmtAmount !== mgmtAutoTotal.toFixed(2) && (
                            <Button variant="outline" size="sm" className="h-6 text-[10px]" onClick={() => setConstructionMgmtAmount(mgmtAutoTotal.toFixed(2))}>
                              Apply ${mgmtAutoTotal.toFixed(2)}
                            </Button>
                          )}
                          {constructionMgmtOverride && (
                            <Button variant="ghost" size="sm" className="h-6 text-[10px] text-muted-foreground" onClick={() => { setConstructionMgmtOverride(false); setConstructionMgmtAmount(mgmtAutoTotal.toFixed(2)); }}>
                              Reset to table suggestion
                            </Button>
                          )}
                          {mgmtRates.length > 0 && <p className="text-[10px] text-muted-foreground">Options: {mgmtRates.map(c => `${c.key}=$${parseFloat(c.value || "0").toLocaleString()}`).join(", ")}</p>}
                          {mgmtRates.length === 0 && <p className="text-[10px] text-amber-600">No Construction Mgmt rows are configured in Pricing Settings.</p>}
                        </div>
                      );
                    })()}
                  </div>

                  {/* Complexity Loading */}
                  <div className="space-y-1.5">
                    <Label className="text-xs">Complexity Loading %</Label>
                    <Input
                      type="number"
                      step="0.1"
                      value={complexityLoading}
                      onChange={(e) => { setComplexityLoading(e.target.value); setComplexityOverride(true); }}
                      className={`h-8 text-sm ${!complexityOverride ? 'bg-muted/50' : ''}`}
                    />
                    {(() => {
                      const rates = priceSettings.complexity;
                      const getRate = (key: string) => { const entry = rates.find(r => r.key.toLowerCase() === key.toLowerCase()); return entry ? parseFloat(entry.value) || 0 : 0; };
                      const breakdown: { label: string; rate: number }[] = [];
                      const roofShape = ((quote as any)?.specRoofShape || "").toLowerCase();
                      if (roofShape.includes("gable")) { const r = getRate("gable"); if (r > 0) breakdown.push({ label: "Gable", rate: r }); }
                      const roofType = ((quote as any)?.specRoofType || "").toLowerCase();
                      const hasPopup = roofType.includes("pop") || !!(quote as any)?.specPopupBrackets;
                      if (hasPopup) { const r = getRate("pop-up"); if (r > 0) breakdown.push({ label: "Pop-up", rate: r }); }
                      if ((quote as any)?.specSiteAccess === "1") { const r = getRate("access"); if (r > 0) breakdown.push({ label: "Access", rate: r }); }
                      if ((quote as any)?.specSiteRestricted === "1") { const r = getRate("restricted"); if (r > 0) breakdown.push({ label: "Restricted", rate: r }); }
                      if ((quote as any)?.specSiteMixed === "1") { const r = getRate("mixed"); if (r > 0) breakdown.push({ label: "Mixed", rate: r }); }
                      const autoTotal = breakdown.reduce((s, b) => s + b.rate, 0);
                      return (
                        <div className="space-y-1">
                          {breakdown.length > 0 && (
                            <div className="text-[10px] text-muted-foreground space-y-0.5">
                              <p className="font-medium">Auto-calculated: {autoTotal.toFixed(1)}%</p>
                              {breakdown.map((b, i) => <p key={i} className="pl-2">{b.label}: +{b.rate}%</p>)}
                            </div>
                          )}
                          {!complexityOverride && autoTotal > 0 && complexityLoading !== String(autoTotal) && (
                            <Button variant="outline" size="sm" className="h-6 text-[10px]" onClick={() => setComplexityLoading(String(autoTotal))}>
                              Apply {autoTotal}%
                            </Button>
                          )}
                          {complexityOverride && (
                            <Button variant="ghost" size="sm" className="h-6 text-[10px] text-muted-foreground" onClick={() => { setComplexityOverride(false); setComplexityLoading(String(autoTotal)); }}>
                              Reset to auto ({autoTotal}%)
                            </Button>
                          )}
                          {priceSettings.complexity.length > 0 && <p className="text-[10px] text-muted-foreground">Rates: {priceSettings.complexity.map(c => `${c.key}=${c.value}%`).join(", ")}</p>}
                        </div>
                      );
                    })()}
                  </div>

                  {/* Council Fees */}
                  <div className="space-y-1.5">
                    <Label className="text-xs">Council Fees $</Label>
                    {priceSettings.councilFees.length > 0 ? (
                      <select
                        value={(parseFloat(councilFees || "0") || 0).toFixed(2)}
                        onChange={(e) => setCouncilFees(e.target.value)}
                        className="flex h-8 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      >
                        <option value="0.00">None</option>
                        {priceSettings.councilFees.map((cf) => (
                          <option key={cf.key} value={(parseFloat(cf.value || "0") || 0).toFixed(2)}>{cf.key} - ${parseFloat(cf.value).toLocaleString()}</option>
                        ))}
                      </select>
                    ) : (
                      <Input type="number" step="0.01" value={councilFees} onChange={(e) => setCouncilFees(e.target.value)} className="h-8 text-sm" placeholder="0.00" />
                    )}
                  </div>

                  {/* Professional Costs */}
                  <div className="space-y-1.5">
                    <Label className="text-xs">Professional Costs $</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={professionalCost}
                      onChange={(e) => setProfessionalCost(e.target.value)}
                      className="h-8 text-sm"
                      placeholder="0.00"
                    />
                    <Input
                      value={professionalCostDescription}
                      onChange={(e) => setProfessionalCostDescription(e.target.value)}
                      className="h-8 text-xs"
                      placeholder="Professional Costs"
                    />
                  </div>

                  {/* Home Warranty (HOW) - NSW only */}
                  {quoteLooksNsw(quote) && (
                  <div className="space-y-1.5">
                    <Label className="text-xs flex items-center gap-1">
                      Home Warranty (HOW) $
                      <Badge variant="outline" className="text-[9px] px-1 py-0 bg-amber-50 text-amber-700">NSW</Badge>
                    </Label>
                    <select
                      value={(parseFloat(homeWarranty || "0") || 0).toFixed(2)}
                      onChange={(e) => setHomeWarranty(e.target.value)}
                      className="flex h-8 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    >
                      <option value="0.00">None</option>
                      {priceSettings.homeWarrantyTiers.map((tier) => {
                        const value = (parseFloat(String(tier.amount || 0)) || 0).toFixed(2);
                        return (
                          <option key={`${tier.label}-${value}`} value={value}>
                            {formatHowTierLabel(tier)}
                          </option>
                        );
                      })}
                    </select>
                    {(() => {
                      const quoteBase = parseFloat((quote as any)?.totalSellPriceEx || "0")
                        || (parseFloat((quote as any)?.totalRRPInc || "0") / 1.1)
                        || 0;
                      const suggestedHow = getHowAmount(
                        quoteBase
                          + parseFloat(deliveryAmount || "0")
                          + parseFloat(travelAllowance || "0")
                          + parseFloat(constructionMgmtAmount || "0")
                          + parseFloat(councilFees || "0")
                          + parseFloat(professionalCost || "0"),
                        priceSettings.homeWarrantyTiers,
                      );
                      return suggestedHow > 0 ? (
                        <button type="button" onClick={() => setHomeWarranty(suggestedHow.toFixed(2))} className="text-[10px] text-blue-600 hover:underline cursor-pointer">
                          Suggested: ${suggestedHow} (click to apply)
                        </button>
                      ) : null;
                    })()}
                  </div>
                  )}
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>
          )}

          {/* Revision History */}
          <AccordionItem value="revisionHistory" id="spec-section-revisionHistory" className="border rounded-lg px-4">
            <AccordionTrigger className="text-sm font-medium">Revision History</AccordionTrigger>
            <AccordionContent>
              <QuoteRevisionHistory quoteId={quoteId} />
            </AccordionContent>
          </AccordionItem>

        </Accordion>

        {/* ─── Hidden Print-Ready Version ─── */}
        <div className="hidden">
          <div ref={printRef}>
            <div className="spec-header">
              <h1>Project Specification Sheet</h1>
              <div className="sub">Commisso Group Pty Limited trading as Altaspan Home Additions &nbsp;|&nbsp; ACT: 2023575 &nbsp;|&nbsp; NSW: 395557C</div>
            </div>

            <div className="spec-top-row">
              <div className="spec-section">
                <h3>Client Details</h3>
                <PrintRow label="Client Name" value={form.clientName} />
                <PrintRow label="Site Address" value={form.siteAddress} />
                <PrintRow label="Phone" value={form.clientPhone} />
                <PrintRow label="Email" value={form.clientEmail} />
                <PrintRow label="Region" value={form.region} />
                <PrintRow label="Local Council" value={form.localCouncil} />
                <PrintRow label="Job Number" value={(quote as any)?.quoteNumber} />
              </div>
              <div className="spec-section">
                <h3>Description of Work</h3>
                <div style={{ fontSize: "8.5pt", lineHeight: "1.5", minHeight: "80px" }}>{form.descriptionOfWork || ""}</div>
                <PrintRow label="Design Adviser" value={form.specDesignAdviser} />
              </div>
            </div>

            {(form.specSiteAccess || form.specSiteRestricted || form.specSiteConditions || form.specSiteOther || form.specSiteMixed || form.specSiteNotes) && (
              <div className="spec-section">
                <h3>Site Details</h3>
                <div className="text-[10px] space-y-0.5">
                  {form.specSiteAccess === "1" && <p>✓ Access difficult</p>}
                  {form.specSiteRestricted === "1" && <p>✓ Restricted work times</p>}
                  {form.specSiteConditions === "1" && <p>✓ Site conditions</p>}
                  {form.specSiteOther === "1" && <p>✓ Other</p>}
                  {form.specSiteMixed === "1" && <p>✓ Mixed materials/angles design</p>}
                  {form.specSiteNotes && <p className="italic mt-1">Notes: {form.specSiteNotes}</p>}
                </div>
              </div>
            )}

            {/* Dimensions */}
            <div className="spec-section">
              <h3>Preliminary</h3>
              <div className="spec-3col">
                <PrintRow label="Width (m)" value={form.specWidth} />
                <PrintRow label="Length (m)" value={form.specLength} />
                <PrintRow label="Area (m²)" value={form.specWidth && form.specLength ? (parseFloat(form.specWidth) * parseFloat(form.specLength)).toFixed(2) : ""} />
                <PrintRow label="Perimeter (m)" value={form.specWidth && form.specLength ? (2 * parseFloat(form.specWidth) + 2 * parseFloat(form.specLength)).toFixed(2) : ""} />
                <PrintRow label="Existing Roof Type of house" value={form.specHouseRoofType} />
                <PrintRow label="Existing House Wall" value={form.specHouseWallType} />
                <PrintRow label="Floor Height" value={form.specFloorHeight} />
                <PrintRow label="Under Eave to Floor" value={form.specRoofToFloor} />
                <PrintRow label="Floor to Ground" value={form.specFloorToGround} />
                <PrintRow label="House Eave" value={form.specHouseEave} />
                <PrintRow label="Cut Back Eave" value={cutBackEaveValue || form.specCutBackEave} />
                <PrintRow label="Job Eave" value={form.specJobEave} />
                <PrintRow label="Wind Cat" value={form.specWindCat} />
                <PrintRow label="Cp'n" value={form.specCpn} />
                <PrintRow label="Fall" value={form.specFall} />
              </div>
            </div>

            {/* Attachment & Brackets */}
            {(form.specFreeStanding || form.specAttachmentMethod || activeBracketMethod) && (
            <div className="spec-section">
              <h3>Attachment & Brackets{getColourGroupsForSection("brackets").length > 0 && <span className="section-colour-group">Palette: {getColourGroupsForSection("brackets").join(", ")}</span>}</h3>
              <div className="spec-3col">
                <PrintRow label="Free Standing" value={form.specFreeStanding} />
                {form.specFreeStanding !== "Yes" && (
                  <>
                    <PrintRow label="No. of Attached Side" value={form.specAttachmentMethod === "None" ? "" : form.specAttachmentMethod} />
                    <PrintRow label="Attachment Method" value={activeBracketMethod} />
                    <PrintRow label="Number of Brackets" value={displayedNumberOfBrackets} />
                    {activeBracketMethod === "Gable brackets" && (
                      <>
                        <PrintRow label="Oversized D Gutter" value={form.specOversizedDGutter} />
                        <PrintRow label="Bracket Cover" value={form.specBracketCover} />
                        <PrintRow label="Bracket Colour" value={form.specBracketColour} isColour />
                      </>
                    )}
                    {activeBracketMethod === "popup brackets" && (
                      <PrintRow label="Pop-up Colour" value={form.specPopupColour} isColour />
                    )}
                    {(activeBracketMethod === "Gable brackets" || activeBracketMethod === "popup brackets") && (
                      <>
                        <PrintRow label="Infill Type" value={form.specBracketInfillType} />
                        <PrintRow label="Infill Length" value={form.specBracketInfillLength} />
                        <PrintRow label="Infill Height" value={form.specBracketInfillHeight} />
                        <PrintRow label="Infill Colour" value={form.specBracketInfillColour} isColour />
                      </>
                    )}
                    {activeBracketMethod === "wall brackets" && (
                      <>
                        <PrintRow label="Wall Fixing Beam" value={form.specWallFixingBeam} />
                        <PrintRow label="Foam Cut" value={form.specFoamCut} />
                      </>
                    )}
                  </>
                )}
              </div>
            </div>
            )}

            {/* Posts */}
            {(form.specPostsNumber || form.specPostsType || form.specPostsColour || form.specPostsFixing) && (
            <div className="spec-section">
              <h3>Posts{getColourGroupsForSection("posts").length > 0 && <span className="section-colour-group">Palette: {getColourGroupsForSection("posts").join(", ")}</span>}</h3>
              <div className="spec-3col">
                <PrintRow label="Posts (Number)" value={form.specPostsNumber} />
                <PrintRow label="Post Type" value={form.specPostsType} />
                <PrintRow label="Post Colour" value={form.specPostsColour} isColour />
                <PrintRow label="Post Fixing" value={normalizePostFixingOption(form.specPostsFixing)} />
              </div>
            </div>
            )}

            {/* Gutter & Downpipe */}
            {(form.specGutterType || form.specGutterColour || form.specDownpipeType || form.specDownpipeColour) && (
            <div className="spec-section">
              <h3>Gutter & Downpipe{getColourGroupsForSection("gutter").length > 0 && <span className="section-colour-group">Palette: {getColourGroupsForSection("gutter").join(", ")}</span>}</h3>
              <div className="spec-3col">
                <PrintRow label="Gutter Type" value={form.specGutterType} />
                <PrintRow label="Gutter Colour" value={form.specGutterColour} isColour />
                <PrintRow label="Total Gutter Length" value={form.specBoxGutter} />
                {(form.specGutterType || "").toLowerCase().includes("box") && (
                  <PrintRow label="Box Gutter Overflow" value="Yes" />
                )}
                <PrintRow label="Downpipe Type" value={form.specDownpipeType} />
                <PrintRow label="Downpipe Colour" value={form.specDownpipeColour} isColour />
                <PrintRow label="Downpipe Location" value={form.specDownpipeLocation} />
                {form.specGutterSides && <PrintRow label="Gutter Sides" value={form.specGutterSides} />}
                {form.specDownpipeMarkers && <PrintRow label="Downpipe Markers" value={form.specDownpipeMarkers} />}
              </div>
            </div>
            )}

            {/* Walls */}
            {(iwpEntries.length > 0 || wallWorkItems.some(w => w.checked) || form.specWallNotes) && (
            <div className="spec-section">
              <h3>Walls{getColourGroupsForSection("walls").length > 0 && <span className="section-colour-group">Palette: {getColourGroupsForSection("walls").join(", ")}</span>}</h3>
              {iwpEntries.length > 0 && (
                <div className="mt-2">
                  <p className="text-xs font-medium">Insulated Wall Panels:</p>
                                    {iwpEntries.map((e, i) => (
                                      <div key={i} className="text-xs ml-2 mb-1">
                                        <span className="font-medium">Wall {i + 1}:</span> {e.type} — {e.width}×{e.height}mm
                                        {e.wallSides && <> | Position: {e.wallSides.split(",").join(", ")}</>}
                                        {e.outsideColour && <> | Outside: {e.outsideColour} ({e.outsideFinish})</>}
                                        {e.insideColour && <> | Inside: {e.insideColour} ({e.insideFinish})</>}
                                      </div>
                  ))}
                </div>
              )}
              {wallWorkItems.filter(w => w.checked || checklistLabel(w)).length > 0 && (
                <div className="mt-2">
                  <p className="text-xs font-medium">Work Checklist:</p>
                  {wallWorkItems.filter(w => checklistLabel(w)).map((w, i) => (
                    <p key={i} className="text-xs ml-2">{w.checked ? "✓" : "□"} {checklistLabel(w)}{checklistDetail(w) ? ` — ${checklistDetail(w)}` : ""}</p>
                  ))}
                </div>
              )}
              {form.specWallNotes && <p className="text-xs mt-1"><span className="font-medium">Notes:</span> {form.specWallNotes}</p>}
            </div>
            )}

            {/* Beams, Channels & Flashings */}
            {(form.specBeamSize || form.specBeamColour || form.specBackChannelType || form.specBackChannelLength || form.specBackChannelColour || form.specSideChannelsType || form.specSideChannelsLength || form.specSideChannelsColour || form.specFlashingsType || form.specFlashingsLength || form.specFlashingsQty || form.specFlashingsColour || beamEntries.length > 0) && (
            <div className="spec-section">
              <h3>Beams, Channels & Flashings{getColourGroupsForSection("beams").length > 0 && <span className="section-colour-group">Palette: {getColourGroupsForSection("beams").join(", ")}</span>}</h3>
              <div className="spec-3col">
                <PrintRow label="Beam Size" value={form.specBeamSize} />
                <PrintRow label="Beam Colour" value={form.specBeamColour} isColour />
                <PrintRow label="Back Channel Type" value={form.specBackChannelType} />
                <PrintRow label="Back Channel Length" value={form.specBackChannelLength} />
                <PrintRow label="Back Channel Colour" value={form.specBackChannelColour} isColour />
                <PrintRow label="Side Channels Type" value={form.specSideChannelsType} />
                <PrintRow label="Side Channels Length" value={form.specSideChannelsLength} />
                <PrintRow label="Side Channels Colour" value={form.specSideChannelsColour} isColour />
                <PrintRow label="Flashings Type" value={form.specFlashingsType} />
                <PrintRow label="Flashings Length" value={form.specFlashingsLength} />
                <PrintRow label="Flashings Qty" value={form.specFlashingsQty} />
                <PrintRow label="Flashings Colour" value={form.specFlashingsColour} isColour />
              </div>
              {beamEntries.length > 0 && (
                <div className="mt-2">
                  <h4 className="text-xs font-semibold mb-1">Beam Entries</h4>
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-1 px-2">Type</th>
                        <th className="text-left py-1 px-2">Size</th>
                        <th className="text-right py-1 px-2">LM</th>
                      </tr>
                    </thead>
                    <tbody>
                      {beamEntries.map((entry, i) => (
                        <tr key={i} className="border-b border-dashed">
                          <td className="py-1 px-2">{entry.type}</td>
                          <td className="py-1 px-2">{entry.size}</td>
                          <td className="text-right py-1 px-2">{entry.lm}</td>
                        </tr>
                      ))}
                      {["Steel", "Aluminium"].map(type => {
                        const total = beamEntries.filter(e => e.type === type).reduce((sum, e) => sum + (e.lm || 0), 0);
                        return total > 0 ? (
                          <tr key={type} className="font-semibold">
                            <td className="py-1 px-2" colSpan={2}>{type} Total</td>
                            <td className="text-right py-1 px-2">{total.toFixed(1)} LM</td>
                          </tr>
                        ) : null;
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            )}

            {/* Roof */}
            {(form.specRoofShape || form.specRoofType || form.specRoofTopColour || form.specRoofBottomColour) && (
            <div className="spec-section">
              <h3>Roof{getColourGroupsForSection("roof").length > 0 && <span className="section-colour-group">Palette: {getColourGroupsForSection("roof").join(", ")}</span>}</h3>
              <div className="spec-3col">
                <PrintRow label="Roof Shape" value={form.specRoofShape} />
                <PrintRow label="Roof Type" value={form.specRoofType} />
                <PrintRow label="Top Colour" value={form.specRoofTopColour} isColour />
                <PrintRow label="Bottom Colour" value={form.specRoofBottomColour} isColour />
                <PrintRow label="Fall Direction" value={form.specFallDirection} />
                <PrintRow label="House Walls" value={form.specHouseWalls ? form.specHouseWalls.split(",").join(", ") : ""} />
                <PrintRow label="Angle Cutting" value={form.specAngleCutting} />
                <PrintRow label="Angle Cutting Metres" value={form.specAngleCuttingMetres} />
                {(form.specRoofShape === "Gable" || form.specRoofShape === "Split Gable" || form.specRoofShape === "Dutch Gable") && (
                  <>
                    <PrintRow label="Gable Infill" value={form.specGableInfill} />
                    <PrintRow label="Gable Style" value={form.specGableStyle} />
                    <PrintRow label="Rafter Size" value={form.specRafterSize} />
                    <PrintRow label="Rafter Material" value={form.specRafterMaterial} />
                  </>
                )}
                {form.specSpanlitesType && form.specSpanlitesType !== "None" && (<>
                <PrintRow label="Skylight Type" value={form.specSpanlitesType} />
                <PrintRow label="Skylight LM" value={form.specSkylightLm} />
                <PrintRow label="Skylight Qty" value={form.specSkylightQty} />
                <PrintRow label="Skylight Finish" value={form.specSpanlitesFinish} />
                </>)}
                {form.specPolyType && (<>
                <PrintRow label="Poly Type" value={form.specPolyType} />
                <PrintRow label="Poly Rafters" value={form.specPolyRafters} />
                </>)}
              </div>
            </div>
            )}

            {/* Windows & Doors */}
            {(form.specWindowsFrameColour || form.specDoorsFrameColour || windowEntries.length > 0 || doorEntries.length > 0 || form.specWindowGlassType || form.specDoorGlassType || form.specGlassNotes) && (
            <div className="spec-section">
              <h3>Windows, Doors & Finishes{getColourGroupsForSection("windows").length > 0 && <span className="section-colour-group">Palette: {getColourGroupsForSection("windows").join(", ")}</span>}</h3>
              <div className="spec-3col">
                <PrintRow label="Windows Frame" value={form.specWindowsFrameColour} isColour />
                <PrintRow label="Doors Frame" value={form.specDoorsFrameColour} isColour />
              </div>
              {windowEntries.length > 0 && (
                <div className="mt-2">
                  <p className="text-xs font-medium mb-1">Window Schedule:</p>
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-0.5">Style</th>
                        <th className="text-left py-0.5">H (mm)</th>
                        <th className="text-left py-0.5">W (mm)</th>
                        <th className="text-center py-0.5">Qty</th>
                        <th className="text-left py-0.5">Screen</th>
                      </tr>
                    </thead>
                    <tbody>
                      {windowEntries.map((w, i) => (
                        <tr key={i} className="border-b border-dashed">
                          <td className="py-0.5">{w.style}</td>
                          <td className="py-0.5">{w.height}</td>
                          <td className="py-0.5">{w.width}</td>
                          <td className="py-0.5 text-center">{w.qty}</td>
                          <td className="py-0.5">{w.screen && w.screen !== "N/A" ? w.screen : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="text-xs mt-1">Total: {windowEntries.reduce((sum, e) => sum + e.qty, 0)} window(s)</p>
                </div>
              )}
              {doorEntries.length > 0 && (
                <div className="mt-2">
                   <p className="text-xs font-medium mb-1">Door Schedule:</p>
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-0.5">Style</th>
                        <th className="text-left py-0.5">H (mm)</th>
                        <th className="text-left py-0.5">W (mm)</th>
                        <th className="text-center py-0.5">Panels</th>
                        <th className="text-center py-0.5">Qty</th>
                        <th className="text-left py-0.5">Screen</th>
                      </tr>
                    </thead>
                    <tbody>
                      {doorEntries.map((d, i) => (
                        <tr key={i} className="border-b border-dashed">
                          <td className="py-0.5">{d.style}</td>
                          <td className="py-0.5">{d.height}</td>
                          <td className="py-0.5">{d.width}</td>
                          <td className="py-0.5 text-center">{d.panels || "—"}</td>
                          <td className="py-0.5 text-center">{d.qty}</td>
                          <td className="py-0.5">{d.screen && d.screen !== "N/A" ? d.screen : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="text-xs mt-1">Total: {doorEntries.reduce((sum, e) => sum + e.qty, 0)} door(s)</p>
                </div>
              )}
              <div className="spec-3col mt-2">
                <PrintRow label="Window Glass Type" value={form.specWindowGlassType} />
                <PrintRow label="Door Glass Type" value={form.specDoorGlassType} />
                <PrintRow label="Windows (desc)" value={form.specGlassWindows} />
                <PrintRow label="Doors (desc)" value={form.specGlassDoors} />
                <PrintRow label="Obscurity" value={form.specGlassObscurity} />
                <PrintRow label="Tint" value={form.specGlassTint} />
                <PrintRow label="Etched" value={form.specGlassEtched} />

                <PrintRow label="Pet Door" value={form.specGlassPetDoor} />
                <PrintRow label="Glass Notes" value={form.specGlassNotes} />
              </div>
            </div>
            )}

            {/* New sections in print */}
            {(form.specFloorPrep || form.specFloorFinish || form.specSubfloorM2 || form.specFloorNotes || floorWorkItems.some(r => r.checked)) && (
            <div className="spec-section">
              <h3>Internal Floor</h3>
              <div className="spec-3col">
                <PrintRow label="Floor Preparation" value={form.specFloorPrep} />
                <PrintRow label="Frame Type" value={form.specElecFrameType} />
                <PrintRow label="Floor Finish" value={form.specFloorFinish} />
                <PrintRow label="Subfloor m²" value={form.specSubfloorM2} />
                <PrintRow label="Notes" value={form.specFloorNotes} />
              </div>
              {floorWorkItems.filter(r => r.checked).length > 0 && (
                <div className="mt-2">
                  <p className="text-xs font-medium">Site Work:</p>
                  <table className="w-full text-xs border-collapse mt-1">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-0.5 px-2">Task</th>
                        <th className="text-left py-0.5 px-2">Detail</th>
                      </tr>
                    </thead>
                    <tbody>
                      {floorWorkItems.filter(r => r.checked).map((r, i) => (
                        <tr key={i} className="border-b border-dashed">
                          <td className="py-1 px-2">{checklistLabel(r)}</td>
                          <td className="py-1 px-2">{checklistDetail(r) || "\u2014"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            )}

            {(
              form.specStairsType ||
              form.specStairsTotalRise ||
              form.specStairsWidth ||
              form.specStairsSteps ||
              form.specStairsStringer ||
              form.specStairsTreads ||
              form.specStairsHandrail ||
              stairsChecks.some(c => c.checked) ||
              form.specStairsNotes
            ) && (
            <div className="spec-section">
              <h3>Stairs</h3>
              <div className="spec-3col">
                <PrintRow label="Stair Type" value={form.specStairsType} />
                <PrintRow label="Total Rise" value={form.specStairsTotalRise} />
                <PrintRow label="Stair Width" value={form.specStairsWidth} />
                <PrintRow label="Steps / Treads" value={form.specStairsSteps} />
                <PrintRow label="Actual Riser" value={form.specStairsActualRiser} />
                <PrintRow label="Going Depth" value={form.specStairsGoingDepth} />
                <PrintRow label="Goings" value={form.specStairsGoings} />
                <PrintRow label="Total Run" value={form.specStairsTotalRun} />
                <PrintRow label="Stringer Length" value={form.specStairsStringerLength} />
                <PrintRow label="Stair Angle" value={form.specStairsAngle} />
                <PrintRow label="Tread Material" value={form.specStairsTreads} />
                <PrintRow label="Stringer Material" value={form.specStairsStringer} />
                <PrintRow label="Riser Style" value={form.specStairsRiser} />
                <PrintRow label="Handrail" value={form.specStairsHandrail} />
                <PrintRow label="Gate" value={form.specStairsGate} />
              </div>
              {stairsChecks.filter(c => c.checked).length > 0 && (
                <div className="spec-3col mt-2">
                  {stairsChecks.filter(c => c.checked).map((c, i) => (
                    <PrintRow key={i} label={checklistLabel(c)} value={checklistDetail(c) || "\u2713"} />
                  ))}
                </div>
              )}
              {form.specStairsNotes && <PrintRow label="Notes" value={form.specStairsNotes} />}
            </div>
            )}

            {(form.specBalustradeHeight || form.specBalustradeLM || form.specBalTubularVertical || form.specBalGlassType || form.specBalWireType || form.specBalPrivacy || form.specBalPostType) && (
            <div className="spec-section">
              <h3>Balustrade</h3>
              <div className="spec-3col">
                <PrintRow label="Height (mm)" value={form.specBalustradeHeight} />
                <PrintRow label="Linear Metres" value={form.specBalustradeLM} />
              </div>
              {/* Tubular */}
              {(form.specBalTubularVertical || form.specBalTubularHorizSlat || form.specBalTubularVertSlat || form.specBalTubularStairs) && (
                <div className="mt-2">
                  <h4 className="text-xs font-semibold mb-1">Tubular Balustrades</h4>
                  <div className="spec-3col">
                    <PrintRow label="Vertical 16.5mm" value={form.specBalTubularVertical} />
                    <PrintRow label="Horiz 65x16.5mm Slat" value={form.specBalTubularHorizSlat} />
                    <PrintRow label="Vert 65x16.5mm Slat" value={form.specBalTubularVertSlat} />
                    <PrintRow label="Stairs" value={form.specBalTubularStairs} />
                  </div>
                </div>
              )}
              {/* Glass */}
              {(form.specBalGlassType || form.specBalGlassTint || form.specBalGlassSpigots || form.specBalGlassStairs) && (
                <div className="mt-2">
                  <h4 className="text-xs font-semibold mb-1">Glass Balustrades</h4>
                  <div className="spec-3col">
                    <PrintRow label="Type" value={form.specBalGlassType} />
                    <PrintRow label="Tint" value={form.specBalGlassTint} />
                    <PrintRow label="Spigots" value={form.specBalGlassSpigots} />
                    <PrintRow label="Stairs" value={form.specBalGlassStairs} />
                  </div>
                </div>
              )}
              {/* Wire */}
              {(form.specBalWireType || form.specBalWireFinish || form.specBalWireFrame || form.specBalWireStairs) && (
                <div className="mt-2">
                  <h4 className="text-xs font-semibold mb-1">Stainless Steel & Wire</h4>
                  <div className="spec-3col">
                    <PrintRow label="Type" value={form.specBalWireType} />
                    <PrintRow label="Finish" value={form.specBalWireFinish} />
                    <PrintRow label="Frame" value={form.specBalWireFrame} />
                    <PrintRow label="Stairs" value={form.specBalWireStairs} />
                  </div>
                </div>
              )}
              {/* Privacy Screen */}
              {form.specBalPrivacy && (
                <div className="mt-2">
                  <h4 className="text-xs font-semibold mb-1">Privacy Screen</h4>
                  <div className="spec-3col">
                    <PrintRow label="Type" value={form.specBalPrivacy} />
                  </div>
                </div>
              )}
              {/* Posts & Rails */}
              <div className="mt-2">
                <h4 className="text-xs font-semibold mb-1">Posts & Rails</h4>
                <div className="spec-3col">
                  <PrintRow label="Post Type" value={form.specBalPostType} />
                  <PrintRow label="Post Mount" value={form.specBalPostMount} />
                  <PrintRow label="Post Colour" value={form.specBalPostColour} isColour />
                  <PrintRow label="Rail Top Style" value={form.specBalRailTopStyle} />
                  <PrintRow label="Rail Top Colour" value={form.specBalRailTopColour} isColour />
                  <PrintRow label="Rail Bottom Style" value={form.specBalRailBottomStyle} />
                  <PrintRow label="Rail Bottom Colour" value={form.specBalRailBottomColour} isColour />
                </div>
              </div>
              {/* Compliance */}
              <div className="spec-3col mt-2">
                <PrintRow label="Certification" value={form.specBalCertification === "Yes" ? "Required" : "Not required"} />
                <PrintRow label="Notes" value={form.specBalustradeNotes} />
              </div>
            </div>
            )}

            {(form.specElecFan || form.specElecSwitchOneWay || form.specElecSwitchTwoWay || form.specElecSwitchDimmer || elecLightTypes.length > 0 || elecGpos.length > 0 || elecExtraWork.some(r => r.checked) || form.specElecNotes || form.specElecCablingOptions) && (
            <div className="spec-section">
              <h3>Electrical</h3>
              <div className="spec-3col">

                <PrintRow label="Fan" value={form.specElecFan} />
                <PrintRow label="Switches (One-way)" value={form.specElecSwitchOneWay} />
                <PrintRow label="Switches (Two-way)" value={form.specElecSwitchTwoWay} />
                <PrintRow label="Switches (Dimmer)" value={form.specElecSwitchDimmer} />
                <PrintRow label="Total Lights" value={elecLightTypes.length > 0 ? String(elecLightTypes.reduce((sum, r) => sum + (r.qty || 0), 0)) : undefined} />
                <PrintRow label="Total GPOs" value={elecGpos.length > 0 ? String(elecGpos.reduce((sum, r) => sum + (r.qty || 0), 0)) : undefined} />
              </div>
              {elecLightTypes.length > 0 && (
                <div className="mt-2">
                  <p className="text-xs font-medium">Lights Detail:</p>
                  {elecLightTypes.map((r, i) => <p key={i} className="text-xs ml-2">{r.type} × {r.qty}</p>)}
                </div>
              )}
              {elecGpos.length > 0 && (
                <div className="mt-2">
                  <p className="text-xs font-medium">GPOs Detail:</p>
                  {elecGpos.map((r, i) => <p key={i} className="text-xs ml-2">{r.type} ({r.location}) × {r.qty}{r.onIwp ? " — Install on IWP" : ""}</p>)}
                </div>
              )}
              {/* Extra Electrical Work print */}
              {form.specElecCablingOptions && (
                <div className="mt-2">
                  <p className="text-xs font-medium">Cabling Options:</p>
                  {(form.specElecCablingOptions || "").split("||").filter(Boolean).map((opt, i) => (
                    <p key={i} className="text-xs ml-2">✓ {opt}</p>
                  ))}
                </div>
              )}
              {elecExtraWork.length > 0 && (
                <div className="mt-2">
                  <p className="text-xs font-medium">Extra Electrical Work:</p>
                  <table className="w-full text-xs border-collapse mt-1">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-1 px-2">Task</th>
                        <th className="text-left py-1 px-2">Detail</th>
                      </tr>
                    </thead>
                    <tbody>
                      {elecExtraWork.filter(r => r.checked).map((r, i) => (
                        <tr key={i} className="border-b border-dashed">
                          <td className="py-1 px-2">{checklistLabel(r)}</td>
                          <td className="py-1 px-2">{checklistDetail(r) || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {form.specElecNotes && (
                <div className="mt-2">
                  <p className="text-xs font-medium">Electrical Notes:</p>
                  <p className="text-xs ml-2" style={{ whiteSpace: "pre-wrap" }}>{form.specElecNotes}</p>
                </div>
              )}
            </div>
            )}

            {concreteChecks.some(c => c.checked) && (
            <div className="spec-section">
              <h3>Concreting</h3>
              <div className="spec-3col">
                {concreteChecks.filter(c => c.checked).map((c, i) => (
                  <PrintRow key={i} label={checklistLabel(c)} value={checklistDetail(c) || "\u2713"} />
                ))}
              </div>
              <div className="spec-3col mt-1">
                <PrintRow label="Thickness" value={form.specConcreteThickness} />
                <PrintRow label="Area" value={form.specConcreteArea} />
                <PrintRow label="Polished" value={form.specConcretePolished} />
                <PrintRow label="Colour" value={form.specConcreteColour} isColour />
                <PrintRow label="Notes" value={form.specConcreteNotes} />
              </div>
            </div>
            )}

            {(demolitionWorkItems.some(c => c.checked) || form.specDemolitionNotes) && (
            <div className="spec-section">
              <h3>Demolition Works</h3>
              <div className="spec-3col">
                {demolitionWorkItems.filter(c => c.checked).map((c, i) => (
                  <PrintRow key={i} label={checklistLabel(c)} value={checklistDetail(c) || "\u2713"} />
                ))}
              </div>
              {form.specDemolitionNotes && <PrintRow label="Notes" value={form.specDemolitionNotes} />}
            </div>
            )}

            {(existingChecks.some(c => c.checked) || form.specExistingNotes) && (
            <div className="spec-section">
              <h3>Work on Existing House</h3>
              <div className="spec-3col">
                {existingChecks.filter(c => c.checked).map((c, i) => (
                  <PrintRow key={i} label={checklistLabel(c)} value={checklistDetail(c) || "\u2713"} />
                ))}
              </div>
              {form.specExistingNotes && <PrintRow label="Notes" value={form.specExistingNotes} />}
            </div>
            )}

            {(plumbChecks.some(c => c.checked) || form.specPlumbNotes) && (
            <div className="spec-section">
              <h3>Plumbing & Drainage</h3>
              <div className="spec-3col">
                {plumbChecks.filter(c => c.checked).map((c, i) => (
                  <PrintRow key={i} label={checklistLabel(c)} value={checklistDetail(c) || "\u2713"} />
                ))}
              </div>
              {form.specPlumbNotes && <PrintRow label="Notes" value={form.specPlumbNotes} />}
            </div>
            )}



          </div>
        </div>

          </div>{/* close p-3 sm:p-5 */}

          {/* ─── Bottom Navigation Bar ─── */}
          <div className="sticky bottom-0 z-10 bg-background/95 backdrop-blur-sm border-t px-3 py-2">
            <div className="flex items-center justify-between gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={goToPrevSection}
                disabled={!canGoPrev}
                className="gap-1.5 text-xs h-8 min-w-0"
              >
                <ChevronLeft className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate hidden sm:inline">
                  {canGoPrev ? filteredSections[currentSectionIndex - 1]?.label : ""}
                </span>
                <span className="sm:hidden">Prev</span>
              </Button>
              <span className="text-[10px] text-muted-foreground text-center whitespace-nowrap">
                {currentSectionIndex + 1} of {orderedVisibleSections.length} &middot; {completedCount} completed
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={goToNextSection}
                disabled={!canGoNext}
                className="gap-1.5 text-xs h-8 min-w-0"
              >
                <span className="truncate hidden sm:inline">
                  {canGoNext ? filteredSections[currentSectionIndex + 1]?.label : ""}
                </span>
                <span className="sm:hidden">Next</span>
                <ChevronRight className="h-3.5 w-3.5 shrink-0" />
              </Button>
            </div>
          </div>

        </div>{/* close flex-1 overflow-y-auto */}
      </div>{/* close flex flex-1 overflow-hidden */}

      {/* Copy Layout from Quote Dialog */}
      <Dialog open={showCopyDialog} onOpenChange={setShowCopyDialog}>
        <DialogContent className="max-w-md max-h-[70vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Copy Layout from Quote</DialogTitle>
            <DialogDescription>
              Select a quote to copy its section order and visibility settings.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 flex-1 overflow-hidden flex flex-col">
            <Input
              placeholder="Search by client name..."
              value={copySearchTerm}
              onChange={(e) => setCopySearchTerm(e.target.value)}
              className="shrink-0"
            />
            <div className="flex-1 overflow-y-auto border rounded-md divide-y">
              {allQuotesList && allQuotesList.length > 0 ? (
                allQuotesList
                  .filter((q: any) => q.id !== quoteId)
                  .slice(0, 20)
                  .map((q: any) => (
                    <button
                      key={q.id}
                      type="button"
                      className="w-full text-left px-3 py-2.5 hover:bg-muted/50 transition-colors"
                      onClick={() => handleCopyFromQuote(q.id)}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium truncate">{q.clientName}</span>
                        <span className="text-[10px] text-muted-foreground shrink-0 ml-2">{q.quoteNumber}</span>
                      </div>
                      {q.siteAddress && (
                        <p className="text-xs text-muted-foreground truncate mt-0.5">{q.siteAddress}</p>
                      )}
                    </button>
                  ))
              ) : (
                <div className="px-3 py-6 text-center text-sm text-muted-foreground">
                  {copySearchTerm ? "No quotes found" : "Loading quotes..."}
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Field({ label, value, onChange, readOnly, hasError, suffix, placeholder, min, max }: { label: string; value: string; onChange?: (v: string) => void; readOnly?: boolean; hasError?: boolean; suffix?: string; placeholder?: string; min?: number; max?: number }) {
  const numVal = value ? parseFloat(value) : null;
  const outOfRange = numVal !== null && !isNaN(numVal) && ((min !== undefined && numVal < min) || (max !== undefined && numVal > max));
  const rangeHint = outOfRange ? `Expected ${min !== undefined ? min : ''}${min !== undefined && max !== undefined ? '–' : ''}${max !== undefined ? max : ''} ${suffix || ''}` : null;
  return (
    <div className="space-y-1.5 min-w-0">
      <Label className={`text-xs font-medium ${hasError ? "text-destructive" : outOfRange ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"}`}>
        {label}{suffix && <span className="text-muted-foreground/70 ml-1">({suffix})</span>}{hasError && <span className="text-destructive ml-1">*</span>}
      </Label>
      <Input
        value={value}
        onChange={onChange ? (e) => onChange(e.target.value) : undefined}
        readOnly={readOnly}
        placeholder={placeholder}
        className={`h-8 text-sm ${readOnly ? "bg-muted/50 cursor-default" : ""} ${hasError ? "border-destructive ring-1 ring-destructive/30" : outOfRange ? "border-amber-500 ring-1 ring-amber-400/30" : ""}`}
      />
      {rangeHint && <p className="text-[10px] text-amber-600 dark:text-amber-400">{rangeHint}</p>}
    </div>
  );
}

function ColourField({ label, value, onChange, colours }: { label: string; value: string; onChange: (v: string) => void; colours: { label: string; value: string; group: string }[] }) {
  // Find the group for the currently selected colour
  const selectedGroup = value ? colours.find(c => c.value === value)?.group : undefined;
  return (
    <div className="space-y-1.5 min-w-0">
      <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
      <div className="flex items-center gap-1.5 min-w-0">
        {value && <ColourSwatch colour={value} size="sm" />}
        <Select value={value || "__none__"} onValueChange={(v) => onChange(v === "__none__" ? "" : v)}>
          <SelectTrigger className="h-8 text-sm flex-1 min-w-0 overflow-hidden">
            <span className="truncate block text-left">
              {value ? `${value}${selectedGroup ? ` (${selectedGroup})` : ""}` : "Select colour..."}
            </span>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">— None —</SelectItem>
            {colours.map((c, idx) => (
              <SelectItem key={`${c.group}-${c.value}-${idx}`} value={c.value}>
                <span className="flex items-center gap-2">
                  <ColourSelectPreview colour={c.value} />
                  {c.group && <span className="text-[10px] text-muted-foreground ml-1">({c.group})</span>}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
  allowNone = true,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
  allowNone?: boolean;
}) {
  const selectValue = allowNone ? (value || "__none__") : (value || undefined);
  return (
    <div className="space-y-1.5 min-w-0">
      <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
      <Select value={selectValue} onValueChange={(v) => onChange(allowNone && v === "__none__" ? "" : v)}>
        <SelectTrigger className="h-8 text-sm [&>span]:truncate">
          <SelectValue placeholder={`Select ${label.toLowerCase()}...`} />
        </SelectTrigger>
        <SelectContent>
          {allowNone && <SelectItem value="__none__">— None —</SelectItem>}
          {options.map((opt) => (
            <SelectItem key={opt} value={opt}>{opt}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function MultiSelectField({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: string[] }) {
  // Value is stored as comma-separated string e.g. "A-B,C-D"
  const selected = value ? value.split(",").map(s => s.trim()).filter(Boolean) : [];
  const toggle = (opt: string) => {
    const next = selected.includes(opt)
      ? selected.filter(s => s !== opt)
      : [...selected, opt];
    onChange(next.join(","));
  };
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
      <div className="flex flex-wrap gap-3 py-1">
        {options.map((opt) => (
          <label key={opt} className="flex items-center gap-1.5 text-sm cursor-pointer">
            <Checkbox
              checked={selected.includes(opt)}
              onCheckedChange={() => toggle(opt)}
              className="h-4 w-4"
            />
            {opt}
          </label>
        ))}
      </div>
    </div>
  );
}

function PrintRow({ label, value, isColour }: { label: string; value?: string; isColour?: boolean }) {
  // Handle combination colours (e.g. "Monument / Thredbo White")
  const combo = isColour && value ? parseCombinationColour(value) : null;
  if (combo) {
    const topHex = getColourHex(combo.top);
    const bottomHex = getColourHex(combo.bottom);
    return (
      <div className="spec-row">
        <span className="spec-label">{label}</span>
        <span className="spec-value-with-swatch">
          {(topHex || bottomHex) && (
            <span className="colour-swatch-split">
              <span className="swatch-half" style={{ backgroundColor: topHex || "#ccc" }} />
              <span className="swatch-half" style={{ backgroundColor: bottomHex || "#ccc" }} />
            </span>
          )}
          {value}
        </span>
      </div>
    );
  }

  const hex = isColour && value ? getColourHex(value) : null;
  return (
    <div className="spec-row">
      <span className="spec-label">{label}</span>
      {hex ? (
        <span className="spec-value-with-swatch">
          <span className="colour-swatch" style={{ backgroundColor: hex }} />
          {value}
        </span>
      ) : (
        <span className="spec-value">{value || ""}</span>
      )}
    </div>
  );
}


/**
 * Sub-component for Site Plan & Elevations section
 * Handles parcel lookup and renders SVG diagrams
 */
function SitePlanElevationSection({ form, quoteId, siteAddress, onUpdate }: { form: Record<string, string>; quoteId: number; siteAddress?: string; onUpdate?: (field: string, value: string) => void }) {
  // Fetch quote data for cached parcel/satellite info
  const utils = trpc.useUtils();
  const { data: spQuote } = trpc.quotes.get.useQuery({ id: quoteId });
  const spUpdateMutation = trpc.quotes.updateSpec.useMutation();
  const [parcelData, setParcelData] = useState<any>(null);
  // Load cached parcel data when quote loads
  useEffect(() => {
    if (spQuote && (spQuote as any).parcelDataJson && !parcelData) {
      try {
        const cached = typeof (spQuote as any).parcelDataJson === 'string'
          ? JSON.parse((spQuote as any).parcelDataJson)
          : (spQuote as any).parcelDataJson;
        setParcelData(cached);
      } catch { /* ignore */ }
    }
  }, [spQuote]); // eslint-disable-line react-hooks/exhaustive-deps
  const [isLoading, setIsLoading] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [sitePlanExpanded, setSitePlanExpanded] = useState(false);
  const [structureOffset, setStructureOffset] = useState<{ x: number; y: number }>({
    x: form.specStructurePosX ? parseFloat(form.specStructurePosX) : 0,
    y: form.specStructurePosY ? parseFloat(form.specStructurePosY) : 0,
  });
  const [structureRotation, setStructureRotation] = useState<number>(
    form.specStructureRotation ? parseFloat(form.specStructureRotation) : 0
  );

  const lookupParcelMutation = trpc.quotes.lookupParcel.useMutation({
    onSuccess: (data) => {
      setParcelData(data);
      // Cache parcel data to the quote record
      spUpdateMutation.mutate({ id: quoteId, data: { parcelDataJson: JSON.stringify(data) } });
      toast.success(`Property boundary found: ${data.lotId} (${data.source === "actmapi" ? "ACTmapi" : "NSW Cadastre"})`);
    },
    onError: (err: any) => toast.error(err.message),
    onSettled: () => setIsLoading(false),
  });
  // Cache satellite image URL when loaded from SitePlanDiagram
  const handleSatelliteLoaded = useCallback((dataUrl: string) => {
    if (quoteId && dataUrl) {
      spUpdateMutation.mutate({ id: quoteId, data: { satelliteImageUrl: dataUrl } });
    }
  }, [quoteId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleFetchSiteData = () => {
    if (!siteAddress) {
      toast.error("Please enter a site address first (in Client & Job Info section)");
      return;
    }
    setIsLoading(true);
    lookupParcelMutation.mutate({
      address: siteAddress,
      suburb: (spQuote as any)?.suburb || undefined,
      region: (spQuote as any)?.region || undefined,
    });
  };

  const structureWidthMm = form.specWidth ? parseFloat(form.specWidth) : undefined;
  const structureLengthMm = form.specLength ? parseFloat(form.specLength) : undefined;

  // Clamp structure offset to prevent off-screen positioning from bad saved data
  const maxStructureOffset = Math.max(
    parcelData?.dimensions?.frontageM || 30,
    parcelData?.dimensions?.depthM || 30
  ) * 1.5;
  useEffect(() => {
    if (Math.abs(structureOffset.x) > maxStructureOffset || Math.abs(structureOffset.y) > maxStructureOffset) {
      setStructureOffset({ x: 0, y: 0 });
      onUpdate?.("specStructurePosX", "0");
      onUpdate?.("specStructurePosY", "0");
    }
  }, [maxStructureOffset]); // eslint-disable-line react-hooks/exhaustive-deps
  const floorHeightMm = form.specFloorHeight ? parseFloat(form.specFloorHeight) : undefined;
  const floorToGroundMm = form.specFloorToGround ? parseFloat(form.specFloorToGround) : undefined;
  const houseEaveMm = form.specHouseEave ? parseFloat(form.specHouseEave) : undefined;
  const jobEaveMm = form.specJobEave ? parseFloat(form.specJobEave) : undefined;
  const postsNumber = form.specPostsNumber ? parseInt(form.specPostsNumber) : undefined;

  return (
    <div className="space-y-4">
      {/* Fetch Site Data button + Preview */}
      <div className="flex items-center gap-3 flex-wrap">
        <Button
          variant="outline"
          size="sm"
          onClick={handleFetchSiteData}
          disabled={isLoading || !siteAddress}
        >
          <Search className="h-3.5 w-3.5 mr-1.5" />
          {isLoading ? "Fetching..." : "Fetch Site Data"}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setPreviewOpen(true)}
          className="gap-1.5"
        >
          <Eye className="h-3.5 w-3.5" />
          Preview PDF Site Plan
        </Button>
        {parcelData?.centroid && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              // Clear cached satellite to force re-fetch
              spUpdateMutation.mutate({ id: quoteId, data: { satelliteImageUrl: "" } });
              toast.info("Satellite image cleared — it will re-fetch on next site plan load");
              // Force re-render of SitePlanDiagram by invalidating
              utils.quotes.get.invalidate({ id: quoteId });
            }}
            className="gap-1.5"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Regenerate Satellite
          </Button>
        )}
        <Button
          variant="outline"
          size="sm"
          onClick={async () => {
            toast.info("Generating diagrams PDF...");
            const batchData: BatchDiagramData = {
              quoteNumber: form.specQuoteNumber || `Q-${quoteId}`,
              clientName: form.specClientName || "",
              siteAddress: siteAddress,
              designAdviser: form.specDesignAdviser,
              sitePlan: parcelData ? {
                boundaryCoords: parcelData.coordinates,
                centroid: parcelData.centroid,
                lotId: parcelData.lotId,
                suburb: parcelData.suburb,
                areaSqm: parcelData.areaSqm,
                frontageM: parcelData.dimensions?.frontageM,
                depthM: parcelData.dimensions?.depthM,
                satelliteDataUrl: (spQuote as any)?.satelliteImageUrl || undefined,
              } : undefined,
              structureWidthMm: structureWidthMm ? structureWidthMm * 1000 : undefined,
              structureLengthMm: structureLengthMm ? structureLengthMm * 1000 : undefined,
              setbackFrontMm: form.specSetbackFront ? parseFloat(form.specSetbackFront) : undefined,
              setbackLeftMm: form.specSetbackLeft ? parseFloat(form.specSetbackLeft) : undefined,
              setbackRearMm: form.specSetbackRear ? parseFloat(form.specSetbackRear) : undefined,
              setbackRightMm: form.specSetbackRight ? parseFloat(form.specSetbackRight) : undefined,
              houseWalls: form.specHouseWalls ? form.specHouseWalls.split(",").filter(Boolean) : [],
              structureOffsetX: structureOffset.x,
              structureOffsetY: structureOffset.y,
              structureRotation: structureRotation,
              setbackColor: form.specSetbackColor || undefined,
              postPositions: form.specPostPositions ? form.specPostPositions.split(",").filter(Boolean) : undefined,
              specFloorHeight: form.specFloorHeight,
              specRoofToFloor: form.specRoofToFloor,
              specFloorToGround: form.specFloorToGround,
              specHouseEave: form.specHouseEave,
              specJobEave: form.specJobEave,
              specPostsNumber: form.specPostsNumber,
              specPostsType: form.specPostsType,
              specRoofType: form.specRoofType,
              specRoofShape: form.specRoofShape,
              specFall: form.specFall,
              specWidth: form.specWidth,
              specLength: form.specLength,
              specRoofTopColour: form.specRoofTopColour,
              specBeamColour: form.specBeamColour,
              specPostsColour: form.specPostsColour,
              // Cross-section fields
              specHouseRoofType: form.specHouseRoofType,
              specCutBackEave: form.specCutBackEave,
              specRemoveGutterFlash: form.specRemoveGutterFlash,
              specHouseWallType: form.specHouseWallType,
              specFallOnGround: form.specFallOnGround,
              specGroundLevel: form.specGroundLevel,
              // Front elevation detail fields
              specPostSpacing: form.specPostSpacing,
              specGutterType: form.specGutterType,
              specRoofOverhang: form.specRoofOverhang,
              specBeamSize: form.specBeamSize,
              specBeamPositions: form.specBeamPositions || undefined,
              specBeamEntries: form.specBeamEntries || undefined,
              specFallDirection: form.specFallDirection || undefined,
              // Skylight data
              specSkylightType: form.specSpanlitesType || undefined,
              specSkylightLm: form.specSkylightLm || undefined,
              specSkylightQty: form.specSkylightQty || undefined,
              specSkylightFinish: form.specSpanlitesFinish || undefined,
              // Plan View annotations
              gutterSides: (form.specGutterSides || "").split(",").filter(Boolean),
              downpipeMarkers: (form.specDownpipeMarkers || "").split(",").filter(Boolean),
              downpipeLocations: (form.specDownpipeLocation || "").split(",").filter(s => s && s !== "No"),
              specPostSize: form.specPostsType || undefined,
              // Connection detail
              connectionType: form.specFreeStanding === "Yes" ? "Free Standing" : form.specAttachmentMethod || undefined,
              ...await (async () => {
                let code = "BCH";
                if (form.specFreeStanding === "Yes") code = "FSS";
                else {
                  const method = form.specAttachmentMethod || "";
                  if (!method || method === "None") return { connectionCode: undefined, connectionImageUrl: undefined };
                  if (parseInt(form.specPopupBrackets || "0") > 0) code = "POP";
                  else if (parseInt(form.specGableBrackets || "0") > 0) code = "GBL";
                  else if (parseInt(form.specExtendaBrackets || "0") > 0) code = "FLY";
                  else if (form.specWallFixingBeam || form.specWallFixingBracket) code = "WFX";
                  else if (parseInt(form.specFasciaBrackets || "0") > 0) code = "BCH";
                }
                try {
                  const images = await utils.planConverter.getProductImagesByCode.fetch({ code });
                  return { connectionCode: code, connectionImageUrl: images?.[0]?.imageUrl || undefined };
                } catch { return { connectionCode: code, connectionImageUrl: undefined }; }
              })(),
            };
            await generateBatchDiagramPdf(batchData, "download");
            toast.success("Diagrams PDF downloaded");
          }}
          className="gap-1.5"
        >
          <FileDown className="h-3.5 w-3.5" />
          Download All Diagrams
        </Button>
        <span className="text-xs text-muted-foreground">
          {siteAddress ? `Address: ${siteAddress}` : "No site address set"}
        </span>
        {parcelData && (
          <span className="text-xs text-green-600 font-medium">
            ✓ {parcelData.lotId} • {parcelData.areaSqm.toFixed(0)} m² • Source: {parcelData.source === "actmapi" ? "ACTmapi" : "NSW Cadastre"}
          </span>
        )}
      </div>

      {/* Setback inputs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 items-end">
        <div className="col-span-2 sm:col-span-4 flex items-center gap-3">
          <Label className="text-xs text-muted-foreground whitespace-nowrap">Envelope Colour</Label>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={form.specSetbackColor || "#FF6B35"}
              onChange={(e) => onUpdate?.("specSetbackColor", e.target.value)}
              className="h-7 w-10 rounded border border-border cursor-pointer bg-transparent p-0.5"
              title="Setback envelope colour"
            />
            <span className="text-xs text-muted-foreground font-mono">{(form.specSetbackColor || "#FF6B35").toUpperCase()}</span>
            {form.specSetbackColor && form.specSetbackColor !== "#FF6B35" && (
              <button
                type="button"
                className="text-xs text-muted-foreground hover:text-foreground underline"
                onClick={() => onUpdate?.("specSetbackColor", "")}
              >
                Reset
              </button>
            )}
          </div>
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Front Setback (mm)</Label>
          <Input
            type="number"
            placeholder="e.g. 6000"
            value={form.specSetbackFront || ""}
            onChange={(e) => onUpdate?.("specSetbackFront", e.target.value)}
            className="h-8 text-sm"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Rear Setback (mm)</Label>
          <Input
            type="number"
            placeholder="e.g. 3000"
            value={form.specSetbackRear || ""}
            onChange={(e) => onUpdate?.("specSetbackRear", e.target.value)}
            className="h-8 text-sm"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Left Setback (mm)</Label>
          <Input
            type="number"
            placeholder="e.g. 1500"
            value={form.specSetbackLeft || ""}
            onChange={(e) => onUpdate?.("specSetbackLeft", e.target.value)}
            className="h-8 text-sm"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Right Setback (mm)</Label>
          <Input
            type="number"
            placeholder="e.g. 1500"
            value={form.specSetbackRight || ""}
            onChange={(e) => onUpdate?.("specSetbackRight", e.target.value)}
            className="h-8 text-sm"
          />
        </div>
      </div>

      {/* Fullscreen Site Plan Overlay */}
      {sitePlanExpanded && (
        <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm flex flex-col p-4 overflow-auto">
          <SitePlanDiagram
            boundaryCoords={parcelData?.coordinates}
            propertyFrontageM={parcelData?.dimensions?.frontageM}
            propertyDepthM={parcelData?.dimensions?.depthM}
            propertyAreaSqm={parcelData?.areaSqm}
            structureWidthMm={structureWidthMm ? structureWidthMm * 1000 : undefined}
            structureLengthMm={structureLengthMm ? structureLengthMm * 1000 : undefined}
            setbackFrontMm={form.specSetbackFront ? parseFloat(form.specSetbackFront) : undefined}
            setbackRearMm={form.specSetbackRear ? parseFloat(form.specSetbackRear) : undefined}
            setbackLeftMm={form.specSetbackLeft ? parseFloat(form.specSetbackLeft) : undefined}
            setbackRightMm={form.specSetbackRight ? parseFloat(form.specSetbackRight) : undefined}
            houseWalls={form.specHouseWalls ? form.specHouseWalls.split(",").filter(Boolean) : []}
            lotId={parcelData?.lotId}
            suburb={parcelData?.suburb}
            centroid={parcelData?.centroid}
            structureOffsetX={structureOffset.x}
            structureOffsetY={structureOffset.y}
            structureRotation={structureRotation}
            onStructureDrag={(x, y) => {
              setStructureOffset({ x, y });
              onUpdate?.("specStructurePosX", x.toFixed(2));
              onUpdate?.("specStructurePosY", y.toFixed(2));
            }}
            onStructureRotate={(deg) => {
              setStructureRotation(deg);
              onUpdate?.("specStructureRotation", deg.toFixed(1));
            }}
            draggable={true}
            onSatelliteLoaded={handleSatelliteLoaded}
            setbackColor={form.specSetbackColor || "#FF6B35"}
            expanded={true}
            onToggleExpand={() => setSitePlanExpanded(false)}
          />
        </div>
      )}

      {/* Diagrams grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Site Plan */}
        <SitePlanDiagram
          boundaryCoords={parcelData?.coordinates}
          propertyFrontageM={parcelData?.dimensions?.frontageM}
          propertyDepthM={parcelData?.dimensions?.depthM}
          propertyAreaSqm={parcelData?.areaSqm}
          structureWidthMm={structureWidthMm ? structureWidthMm * 1000 : undefined}
          structureLengthMm={structureLengthMm ? structureLengthMm * 1000 : undefined}
          setbackFrontMm={form.specSetbackFront ? parseFloat(form.specSetbackFront) : undefined}
          setbackRearMm={form.specSetbackRear ? parseFloat(form.specSetbackRear) : undefined}
          setbackLeftMm={form.specSetbackLeft ? parseFloat(form.specSetbackLeft) : undefined}
          setbackRightMm={form.specSetbackRight ? parseFloat(form.specSetbackRight) : undefined}
          houseWalls={form.specHouseWalls ? form.specHouseWalls.split(",").filter(Boolean) : []}
          lotId={parcelData?.lotId}
          suburb={parcelData?.suburb}
          centroid={parcelData?.centroid}
          structureOffsetX={structureOffset.x}
          structureOffsetY={structureOffset.y}
          structureRotation={structureRotation}
          onStructureDrag={(x, y) => {
            setStructureOffset({ x, y });
            onUpdate?.("specStructurePosX", x.toFixed(2));
            onUpdate?.("specStructurePosY", y.toFixed(2));
          }}
          onStructureRotate={(deg) => {
            setStructureRotation(deg);
            onUpdate?.("specStructureRotation", deg.toFixed(1));
          }}
          draggable={true}
          onSatelliteLoaded={handleSatelliteLoaded}
          setbackColor={form.specSetbackColor || "#FF6B35"}
          onToggleExpand={() => setSitePlanExpanded(true)}
        />


      </div>

      {/* Print-Ready A3 Site Plan */}
      <SitePlanPrintPage
        boundaryCoords={parcelData?.coordinates}
        propertyFrontageM={parcelData?.dimensions?.frontageM || 20}
        propertyDepthM={parcelData?.dimensions?.depthM || 30}
        propertyAreaSqm={parcelData?.areaSqm}
        structureWidthMm={structureWidthMm ? structureWidthMm * 1000 : undefined}
        structureLengthMm={structureLengthMm ? structureLengthMm * 1000 : undefined}
        setbackFrontMm={form.specSetbackFront ? parseFloat(form.specSetbackFront) : undefined}
        setbackLeftMm={form.specSetbackLeft ? parseFloat(form.specSetbackLeft) : undefined}
        setbackRearMm={form.specSetbackRear ? parseFloat(form.specSetbackRear) : undefined}
        setbackRightMm={form.specSetbackRight ? parseFloat(form.specSetbackRight) : undefined}
        houseWalls={form.specHouseWalls ? form.specHouseWalls.split(",").filter(Boolean) : []}
        lotId={parcelData?.lotId}
        suburb={parcelData?.suburb}
        structureOffsetX={structureOffset.x}
        structureOffsetY={structureOffset.y}
        structureRotation={structureRotation}
        clientName={form.specClientName || ""}
        siteAddress={siteAddress || ""}
        quoteNumber={form.specQuoteNumber || ""}
        designAdviser={form.specDesignAdviser || ""}
        roofType={form.specRoofType || ""}
        setbackColor={form.specSetbackColor || "#FF6B35"}
        postPositions={form.specPostPositions ? form.specPostPositions.split(",").filter(Boolean) : []}
        centroid={parcelData?.centroid}
        satelliteImageUrl={(spQuote as any)?.satelliteImageUrl || undefined}
      />
      {/* Info note */}
      <p className="text-xs text-muted-foreground italic">
        Diagrams are auto-generated from spec sheet dimensions. Click "Fetch Site Data" to pull property boundary from ACTmapi (ACT) or NSW Cadastre (NSW) based on the site address.
      </p>

      {/* PDF Site Plan Preview Dialog */}
      <SitePlanPreviewDialog
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        boundaryCoords={parcelData?.coordinates}
        propertyFrontageM={parcelData?.dimensions?.frontageM}
        propertyDepthM={parcelData?.dimensions?.depthM}
        propertyAreaSqm={parcelData?.areaSqm}
        structureWidthMm={structureWidthMm ? structureWidthMm * 1000 : undefined}
        structureLengthMm={structureLengthMm ? structureLengthMm * 1000 : undefined}
        setbackFrontMm={form.specSetbackFront ? parseFloat(form.specSetbackFront) : undefined}
        setbackLeftMm={form.specSetbackLeft ? parseFloat(form.specSetbackLeft) : undefined}
        setbackRearMm={form.specSetbackRear ? parseFloat(form.specSetbackRear) : undefined}
        setbackRightMm={form.specSetbackRight ? parseFloat(form.specSetbackRight) : undefined}
        houseWalls={form.specHouseWalls ? form.specHouseWalls.split(",").filter(Boolean) : []}
        lotId={parcelData?.lotId}
        suburb={parcelData?.suburb}
        centroid={parcelData?.centroid}
        structureOffsetX={structureOffset.x}
        structureOffsetY={structureOffset.y}
        structureRotation={structureRotation}
        setbackColor={form.specSetbackColor || "#FF6B35"}
        clientName={form.specClientName || ""}
        siteAddress={siteAddress || ""}
        quoteNumber={form.specQuoteNumber || ""}
      />
    </div>
  );
}
