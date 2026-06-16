import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useNavSwipe } from "@/hooks/useSwipeGesture";
import { useParams, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import { ArrowLeft, Save, Calculator, FileText, User, Package, DollarSign, Eye, Download, Send, StickyNote, MessageSquare, Menu, PencilRuler, MapPin, Search, Sparkles, RefreshCw, Shield, ClipboardCheck, ListChecks, Lock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import DeckSpecSheet, { type DeckSpecData } from "@/components/deck/DeckSpecSheet";
import DeckDesignPanel, { type DesignChangePayload } from "@/components/deck/DeckDesignPanel";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";
import CommunicationsTab from "@/components/CommunicationsTab";
import { QuoteAIRender } from "@/components/QuoteAIRender";
import { generateProposalPDF } from "@/lib/pdfProposal";
import { adaptDeckQuoteToProposal, validateDeckQuoteForProposal } from "@/lib/deckProposalAdapter";
import { calculateSubfloor, computeDesignArea, computeDesignPerimeter, DEFAULT_INPUTS, type SubfloorInputs, type PricingOverrides } from "../../../shared/subfloor-calc";
import { generateDeckBomCsv, downloadCsv } from "../../../shared/deckBomCsv";
import { generateDeckManagementPDF } from "@/lib/deckManagementPdf";
import { calculateOptimisedCutPlan, calculateBoardCutPlan, calculateFramingCutPlan } from "../../../shared/boardCutPlan";
import type { StairResult } from "../../../shared/stairCalc";
import { useAuth } from "@/_core/hooks/useAuth";
import { isAdminRole } from "@shared/const";
import { toast } from "sonner";
import PdfPreviewModal from "@/components/PdfPreviewModal";

/** Capture a specific SVG from the DOM by selector and convert to a data URL */
async function captureSvgToDataUrl(selector: string, width = 1600, height = 1200): Promise<string | undefined> {
  const svgEl = document.querySelector(selector) as SVGSVGElement | null;
  if (!svgEl) return undefined;
  try {
    const svgClone = svgEl.cloneNode(true) as SVGSVGElement;
    const vb = svgEl.getAttribute("viewBox") || `0 0 ${width} ${height}`;
    svgClone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    if (!svgClone.getAttribute("width")) svgClone.setAttribute("width", String(width));
    if (!svgClone.getAttribute("height")) svgClone.setAttribute("height", String(height));
    const bgRect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    const [, , vbW, vbH] = vb.split(" ").map(Number);
    bgRect.setAttribute("width", String(vbW || width));
    bgRect.setAttribute("height", String(vbH || height));
    bgRect.setAttribute("fill", "white");
    svgClone.insertBefore(bgRect, svgClone.firstChild);
    const serializer = new XMLSerializer();
    const svgStr = serializer.serializeToString(svgClone);
    const blob = new Blob([svgStr], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    return await new Promise<string | undefined>((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.fillStyle = "white";
          ctx.fillRect(0, 0, width, height);
          ctx.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL("image/png"));
        } else {
          resolve(undefined);
        }
        URL.revokeObjectURL(url);
      };
      img.onerror = () => { URL.revokeObjectURL(url); resolve(undefined); };
      img.src = url;
    });
  } catch {
    return undefined;
  }
}

/** Capture the deck schematic SVG from the DOM and convert to a data URL */
async function captureDeckSchematic(): Promise<string | undefined> {
  return captureSvgToDataUrl("[data-deck-schematic]");
}

/** Capture the board layout SVG from the DOM */
async function captureBoardLayoutSvg(): Promise<string | undefined> {
  return captureSvgToDataUrl("[data-board-layout-svg]", 1200, 800);
}

/** Capture the deck side view SVG from the DOM */
async function captureSideViewSvg(): Promise<string | undefined> {
  return captureSvgToDataUrl("[data-side-view-svg]", 1400, 600);
}



import ClientPicker from "@/components/ClientPicker";
import AddressAutocomplete from "@/components/AddressAutocomplete";
import RegionSelect from "@/components/RegionSelect";
import CouncilSelect from "@/components/CouncilSelect";
import DesignAdvisorSelect from "@/components/DesignAdvisorSelect";
import { detectRegion } from "@shared/regionDetection";
import QuoteNotesSection from "@/components/QuoteNotesSection";
import SitePlanDiagram from "@/components/SitePlanDiagram";

/** Build SubfloorInputs from the deck quote form fields (fallback when no saved design state) */
function buildSubfloorInputs(form: any): SubfloorInputs {
  const base = { ...DEFAULT_INPUTS };
  const w = parseFloat(form.deckWidthM as string) || 0;
  const p = parseFloat(form.deckProjectionM as string) || 0;
  if (w > 0) base.length = Math.round(w * 1000);
  if (p > 0) base.width = Math.round(p * 1000);
  if (form.deckShape === "l-shape") base.shape = "l-shape";
  else if (form.deckShape === "wraparound") base.shape = "u-shape";
  if (form.deckHeightAboveGroundMm && form.deckHeightAboveGroundMm > 0) {
    base.minHeight = Math.round(form.deckHeightAboveGroundMm * 0.5);
    base.maxHeight = form.deckHeightAboveGroundMm;
  }
  return base;
}

type DeckQuote = {
  id: number;
  quoteNumber: string;
  status: string;
  clientName: string;
  clientPhone?: string | null;
  clientEmail?: string | null;
  clientCompany?: string | null;
  siteAddress?: string | null;
  deckWidthM?: string | null;
  deckProjectionM?: string | null;
  deckHeightAboveGroundMm?: number | null;
  frameType?: string | null;
  steelBeamSelection?: string | null;
  deckingBrand?: string | null;
  deckingProductId?: number | null;
  fasciaProductId?: number | null;
  edgeProductId?: number | null;
  colour?: string | null;
  edgeDetail?: string | null;
  deckShape?: string | null;
  boardDirection?: string | null;
  levels?: string | null;
  siteCondition?: string | null;
  stairsRequired?: boolean | null;
  numberOfStairsFlights?: number | null;
  handrailRequired?: boolean | null;
  screensRequired?: boolean | null;
  lightingRequired?: boolean | null;
  demolitionRequired?: boolean | null;
  disposalRequired?: boolean | null;
  engineeringRequired?: boolean | null;
  permitRequired?: boolean | null;
  labourRuleId?: number | null;
  pricingRuleId?: number | null;
  selectedMarginPercent?: string | null;
  commissionPercent?: string | null;
  depositPercent?: string | null;
  baseDeliveryFee?: string | null;
  areaM2?: string | null;
  perimeterM?: string | null;
  materialsSubtotal?: string | null;
  adjustedLabour?: string | null;
  hardCostSubtotal?: string | null;
  sellPriceExGst?: string | null;
  gstAmount?: string | null;
  sellPriceIncGst?: string | null;
  depositAmount?: string | null;
  complexityMultiplier?: string | null;
  notes?: string | null;
  /** JSON-serialized SubfloorInputs for persisting design state */
  designInputsJson?: string | null;
  [key: string]: any;
};

// ─── Section definitions (new order: Client → Design → Product+Frame → Pricing → Presentation → Notes → Comms) ───
const SECTIONS = [
  { id: "client", label: "Client", icon: User },
  { id: "design", label: "Design", icon: PencilRuler },
  { id: "specsheet", label: "Construction Spec", icon: ClipboardCheck },
  { id: "product", label: "Site + Add-Ons", icon: Package },
  { id: "checklist", label: "Checklist Pricing", icon: ListChecks },
  { id: "pricing", label: "Pricing", icon: DollarSign },
  { id: "presentation", label: "Presentation", icon: FileText },
  { id: "propertysite", label: "Property Plan", icon: MapPin },
  { id: "airender", label: "AI Render", icon: Sparkles },
  { id: "notes", label: "Notes", icon: StickyNote },
] as const;

export default function DeckQuoteEditor() {
  const params = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const quoteId = Number(params.id);
  const { user } = useAuth();
  const isAdmin = isAdminRole(user?.role || "");
  const [activeSection, setActiveSection] = useState("client");
  const [openSections, setOpenSections] = useState<string[]>(["client"]);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [pdfPreviewOpen, setPdfPreviewOpen] = useState(false);
  const [pdfPreviewBlob, setPdfPreviewBlob] = useState<Blob | null>(null);
  const [pdfPreviewFilename, setPdfPreviewFilename] = useState("");

  // Swipe gesture: swipe right from left edge to open mobile nav
  useNavSwipe(mobileNavOpen, setMobileNavOpen);

  const [saving, setSaving] = useState(false);

  // Data queries
  const { data: quote, isLoading, refetch } = trpc.deck.quotes.get.useQuery({ id: quoteId });
  const { data: products } = trpc.deck.products.list.useQuery({});
  const { data: framing } = trpc.deck.framing.list.useQuery({});
  const { data: labourRules } = trpc.deck.labourRules.list.useQuery();
  const { data: pricingRules } = trpc.deck.pricingRules.list.useQuery();
  const { data: addonItems } = trpc.deck.addonItems.list.useQuery({});
  const { data: renderHistory } = trpc.quoteRender.deckHistory.useQuery({ quoteId });
  const { data: overrideHistory } = trpc.deck.quotes.overrideHistory.useQuery(
    { deckQuoteId: quoteId },
    { enabled: isAdmin }
  );
  // Checklist items for pricing
  const { data: activeChecklistItems } = trpc.checklistItems.listActive.useQuery();
  // Master data for council fees and home warranty
  const { data: allMasterData } = trpc.masterData.getAll.useQuery();
  const priceSettings = useMemo(() => {
    if (!allMasterData) return {
      deliveryRatePerKm: "0", deliveryFactorTiers: [] as { threshold: number; factor: number }[],
      travelBands: [] as { key: string; value: string }[], smallJob: "0", smallJobThreshold: "0",
      constructionMgmtRates: [] as { key: string; value: string }[],
      councilFees: [] as { key: string; value: string }[],
      homeWarrantyTiers: [] as { threshold: number; amount: number }[],
      regionHowFlags: {} as Record<string, boolean>,
    };
    const deliveryRatePerKm = allMasterData.find((d: any) => d.category === "delivery_rate" && d.key === "per_km")?.value || "0";
    const deliveryFactorTiersRaw = allMasterData.filter((d: any) => d.category === "delivery_factor").sort((a: any, b: any) => (parseFloat(a.key) || 0) - (parseFloat(b.key) || 0));
    const deliveryFactorTiers = deliveryFactorTiersRaw.map((d: any) => ({ threshold: parseFloat(d.key) || 0, factor: parseFloat(d.value) || 1 }));
    const travelBands = allMasterData.filter((d: any) => d.category === "travel_band").map((d: any) => ({ key: d.key, value: d.value }));
    const smallJob = allMasterData.find((d: any) => d.category === "small_job_surcharge" && d.key === "rate")?.value || allMasterData.find((d: any) => d.category === "small_job_surcharge")?.value || "0";
    const smallJobThreshold = allMasterData.find((d: any) => d.category === "small_job_surcharge" && d.key === "threshold")?.value || "0";
    const constructionMgmtRates = allMasterData.filter((d: any) => d.category === "construction_mgmt_rates").map((d: any) => ({ key: d.key, value: d.value }));
    const councilFeesData = allMasterData.filter((d: any) => d.category === "council_fee").map((d: any) => ({ key: d.key, value: d.value }));
    const hwTiers = allMasterData.filter((d: any) => d.category === "home_warranty").sort((a: any, b: any) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
    const homeWarrantyTiers = hwTiers.map((d: any) => ({ threshold: parseFloat(d.key) || 0, amount: parseFloat(d.value) || 0 }));
    const regionHowFlags: Record<string, boolean> = {};
    allMasterData.filter((d: any) => d.category === "region").forEach((d: any) => {
      const meta = d.metadata as any;
      if (meta && meta.howApplicable) regionHowFlags[d.key] = true;
    });
    return { deliveryRatePerKm, deliveryFactorTiers, travelBands, smallJob, smallJobThreshold, constructionMgmtRates, councilFees: councilFeesData, homeWarrantyTiers, regionHowFlags };
  }, [allMasterData]);
  const councilFeeOptions = priceSettings.councilFees;
  const homeWarrantyTiers = priceSettings.homeWarrantyTiers;

  // Auto-save state
  const [autoSaveStatus, setAutoSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isAutoSaveRef = useRef(false);
  const initialLoadRef = useRef(true);
  const triggerAutoRecalcRef = useRef(false);

  const updateMutation = trpc.deck.quotes.update.useMutation({
    onSuccess: () => {
      refetch();
      if (isAutoSaveRef.current) {
        setAutoSaveStatus("saved");
        setTimeout(() => setAutoSaveStatus("idle"), 3000);
        // Trigger auto-recalculate after auto-save
        triggerAutoRecalcRef.current = true;
      }
      // No toast for manual saves — auto-save indicator already shows status
      isAutoSaveRef.current = false;
    },
    onError: (err) => {
      if (isAutoSaveRef.current) {
        setAutoSaveStatus("error");
      } else {
        toast.error(err.message);
      }
      isAutoSaveRef.current = false;
    },
  });

  const calculateMutation = trpc.deck.calculate.useMutation({
    onSuccess: (result) => {
      updateMutation.mutate({
        id: quoteId,
        data: {
          areaM2: String(result.areaM2),
          perimeterM: String(result.perimeterM),
          materialsSubtotal: String(result.materialsSubtotal),
          adjustedLabour: String(result.adjustedLabour),
          hardCostSubtotal: String(result.hardCostSubtotal),
          sellPriceExGst: String(result.sellPriceWithCommissionExGst),
          gstAmount: String(result.gstAmount),
          sellPriceIncGst: String(result.sellPriceIncGst),
          depositAmount: String(result.depositAmount),
          complexityMultiplier: String(result.complexityMultiplier),
        },
      });
      setCalcResult(result);
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  // Local form state
  const [form, setForm] = useState<Partial<DeckQuote>>({});
  const [calcResult, setCalcResult] = useState<any>(null);

  // Design state — source of truth for dimensions/area
  const [designPayload, setDesignPayload] = useState<DesignChangePayload | null>(null);
  const [stairResult, setStairResult] = useState<StairResult | null>(null);
  const handleStairChange = useCallback((result: StairResult) => { setStairResult(result); }, []);

  // Engineering pricing from Sales Data (deck_framing table)
  const activeFramingSystem = designPayload?.inputs?.framingSystem || "spanmor";
  const { data: engineeringPricingOverrides } = trpc.deck.framing.engineeringPricing.useQuery(
    { systemName: activeFramingSystem },
    { staleTime: 60_000 }
  );

  // Property site plan state
  const [parcelData, setParcelData] = useState<any>(null);
  const [deckStructureOffset, setDeckStructureOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [deckStructureRotation, setDeckStructureRotation] = useState(0);
  const [deckSetbacks, setDeckSetbacks] = useState<{ front: string; rear: string; left: string; right: string }>({ front: "", rear: "", left: "", right: "" });
  const [deckSitePlanExpanded, setDeckSitePlanExpanded] = useState(false);
  const [parcelLoading, setParcelLoading] = useState(false);
  const lookupParcelMutation = trpc.quotes.lookupParcel.useMutation({
    onSuccess: (data) => {
      setParcelData(data);
      toast.success(`Property boundary found: ${data.lotId} (${data.source === "actmapi" ? "ACTmapi" : "NSW Cadastre"})`);
    },
    onError: (err: any) => toast.error(err.message),
    onSettled: () => setParcelLoading(false),
  });
  
  // Stable callback ref to avoid re-renders in DeckDesignPanel
  const handleDesignChange = useCallback((payload: DesignChangePayload) => {
    setDesignPayload(payload);
    // Sync key dimension fields back to form for persistence
    const widthM = (payload.inputs.length / 1000).toFixed(2);
    const projM = (payload.inputs.width / 1000).toFixed(2);
    const shapeMap: Record<string, string> = { "rectangle": "rectangular", "l-shape": "l-shape", "u-shape": "wraparound" };
    setForm((prev) => ({
      ...prev,
      deckWidthM: widthM,
      deckProjectionM: projM,
      deckShape: shapeMap[payload.inputs.shape] || "rectangular",
      deckHeightAboveGroundMm: payload.inputs.maxHeight,
      areaM2: String(payload.areaM2),
      perimeterM: String(payload.perimeterM),
      designInputsJson: JSON.stringify(payload.inputs),
    }));
  }, []);

  useEffect(() => {
    if (quote) {
      setForm(quote as any);
      // Hydrate site plan state from sitePlanData JSON
      try {
        const spd = (quote as any).sitePlanData;
        if (spd && typeof spd === 'object') {
          if (spd.parcelData) setParcelData(spd.parcelData);
          if (spd.structureOffsetX != null) setDeckStructureOffset({ x: spd.structureOffsetX || 0, y: spd.structureOffsetY || 0 });
          if (spd.structureRotation != null) setDeckStructureRotation(spd.structureRotation || 0);
          if (spd.setbacks) setDeckSetbacks(spd.setbacks);
        }
      } catch { /* ignore */ }
    }
  }, [quote]);

  const updateField = useCallback((field: string, value: any) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  }, []);

  const saveQuote = useCallback(async () => {
    setSaving(true);
    const { id, userId, quoteNumber, createdAt, updatedAt, ...data } = form as any;
    // Include site plan data
    data.sitePlanData = JSON.stringify({
      parcelData: parcelData || undefined,
      structureOffsetX: deckStructureOffset.x,
      structureOffsetY: deckStructureOffset.y,
      structureRotation: deckStructureRotation,
      setbacks: deckSetbacks,
    });
    updateMutation.mutate({ id: quoteId, data });
    setSaving(false);
  }, [form, quoteId, parcelData, deckStructureOffset, deckStructureRotation, deckSetbacks]);

  // ─── Auto-save with 9s debounce ────────────────────────────────────────────
  useEffect(() => {
    if (initialLoadRef.current) {
      initialLoadRef.current = false;
      return;
    }
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(() => {
      setAutoSaveStatus("saving");
      isAutoSaveRef.current = true;
      const { id, userId, quoteNumber, createdAt, updatedAt, ...data } = form as any;
      data.sitePlanData = JSON.stringify({
        parcelData: parcelData || undefined,
        structureOffsetX: deckStructureOffset.x,
        structureOffsetY: deckStructureOffset.y,
        structureRotation: deckStructureRotation,
        setbacks: deckSetbacks,
      });
      updateMutation.mutate({ id: quoteId, data });
    }, 9000);
    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form, parcelData, deckStructureOffset, deckStructureRotation, deckSetbacks]);

  // ─── Unsaved changes warning ───────────────────────────────────────────
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (autoSaveTimerRef.current || autoSaveStatus === "saving") {
        e.preventDefault();
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [autoSaveStatus]);

  const runCalculation = useCallback(() => {
    const selectedProduct = products?.find((p: any) => p.id === form.deckingProductId);
    const selectedFasciaProduct = products?.find((p: any) => p.id === form.fasciaProductId);
    const selectedEdgeProduct = products?.find((p: any) => p.id === form.edgeProductId);
    const selectedFraming = framing?.find((f: any) => f.frameType === form.frameType);
    const selectedLabourRule = labourRules?.find((r: any) => r.id === form.labourRuleId) || labourRules?.[0];
    const selectedPricingRule = pricingRules?.find((r: any) => r.id === form.pricingRuleId) || pricingRules?.[0];

    // Use design-derived area if available, otherwise fall back to width × projection
    const designArea = designPayload?.areaM2;
    const designPerimeter = designPayload?.perimeterM;
    const width = parseFloat(form.deckWidthM as string) || 0;
    const projection = parseFloat(form.deckProjectionM as string) || 0;

    if (!width || !projection) {
      toast.error("Please set deck dimensions in the Design section");
      return;
    }

    const getAddonCost = (category: string) => {
      const item = addonItems?.find((a: any) => a.category.toLowerCase() === category.toLowerCase());
      return parseFloat(item?.unitPrice || "0");
    };

    // Engineering BOM: compute stock-based costs from cutting optimiser
    let engineeringFramingCost: number | undefined;
    let engineeringBoardCost: number | undefined;
    let engineeringBoardCount: number | undefined;
    let engineeringBeamProfile: string | undefined;
    const subInputs = designPayload?.inputs || buildSubfloorInputs(form);
    if (subInputs && width > 0 && projection > 0) {
      try {
        const subResult = calculateSubfloor(subInputs, engineeringPricingOverrides);
        const activeOpt = designPayload?.activeOption === "B" ? subResult.optionB : subResult.optionA;
        engineeringBeamProfile = activeOpt.profile.label;

        // Stock-based framing cost: use cutting optimiser to get actual stock pieces
        try {
          const framingPlan = calculateFramingCutPlan(activeOpt, subInputs);
          const pricePerMetre = activeOpt.profile.pricePerMetre;
          let stockFramingCost = 0;
          for (const ms of framingPlan.materialSummaries) {
            stockFramingCost += ms.stockCount * (ms.stockLength / 1000) * pricePerMetre;
          }
          engineeringFramingCost = stockFramingCost;
        } catch {
          // Fall back to cut-length-based cost from subfloor-calc
          engineeringFramingCost = activeOpt.totalCost;
        }

        // Stock-based board cost: totalStockBoards × (boardLength/1000) × pricePerLm
        const pricePerLm = parseFloat(selectedProduct?.pricePerLm || "0");
        if (pricePerLm > 0) {
          try {
            const boardPlan = calculateBoardCutPlan(subInputs);
            const boardLengthM = (subInputs.boardLayout?.boardLength || 5400) / 1000;
            engineeringBoardCost = boardPlan.totalStockBoards * boardLengthM * pricePerLm;
            engineeringBoardCount = boardPlan.totalStockBoards;
          } catch {
            // Fall back to area × rate
          }
        }
      } catch {
        // Fall back to legacy spacing-based calculation
      }
    }

    calculateMutation.mutate({
      deckWidthM: width,
      deckProjectionM: projection,
      // Design-derived overrides for L/U shape support
      areaM2Override: designArea || undefined,
      perimeterMOverride: designPerimeter || undefined,
      deckingRatePerM2: parseFloat(selectedProduct?.retailRatePerM2 || "0"),
      clipFixingCostPerM2: parseFloat(selectedProduct?.clipFixingCostPerM2 || "0"),
      wastePercent: parseFloat(selectedProduct?.wasteDefault || "0.10"),
      engineeringBoardCost,
      engineeringBoardCount,
      // Fascia board pricing
      fasciaRatePerBoard: parseFloat(selectedFasciaProduct?.retailRatePerM2 || "0"),
      fasciaBoardCount: designPayload?.fasciaBoardCount || undefined,
      // Edge board pricing
      edgeRatePerBoard: parseFloat(selectedEdgeProduct?.retailRatePerM2 || "0"),
      edgeBoardCount: designPayload?.edgeBoardCount || undefined,
      framingPricePerLm: parseFloat(selectedFraming?.pricePerLm || "0"),
      beamSpacingM: parseFloat(selectedFraming?.beamSpacingM || "1.8"),
      joistSpacingMm: selectedFraming?.joistSpacingMm || 450,
      postSpacingM: parseFloat(selectedFraming?.postSpacingM || "2.4"),
      // Engineering BOM override
      engineeringFramingCost,
      engineeringBeamProfile,
      baseLabourRatePerM2: parseFloat(selectedLabourRule?.baseRatePerM2 || "85"),
      slopingSite: form.siteCondition === "sloping",
      slopingSiteMultiplier: parseFloat(selectedLabourRule?.slopingSiteMultiplier || "1.15"),
      restrictedAccess: form.siteCondition === "restricted",
      restrictedAccessMultiplier: parseFloat(selectedLabourRule?.restrictedAccessMultiplier || "1.10"),
      elevatedDeck: (form.deckHeightAboveGroundMm || 0) > 1000,
      elevatedDeckMultiplier: parseFloat(selectedLabourRule?.elevatedDeckMultiplier || "1.20"),
      pictureFrame: form.edgeDetail === "picture-frame",
      pictureFrameLabourUplift: parseFloat(selectedLabourRule?.pictureFrameLabourUplift || "1.15"),
      splitLevel: form.levels === "split",
      splitLevelUplift: parseFloat(selectedLabourRule?.splitLevelUplift || "1.10"),
      multiLevel: form.levels === "multi",
      multiLevelUplift: parseFloat(selectedLabourRule?.multiLevelUplift || "1.20"),
      stairsRequired: form.stairsRequired || false,
      numberOfStairsFlights: form.numberOfStairsFlights || 0,
      stairsCostPerFlight: getAddonCost("stairs"),
      handrailRequired: form.handrailRequired || false,
      handrailCostPerLm: getAddonCost("handrail"),
      screensRequired: form.screensRequired || false,
      screensCostPerLm: getAddonCost("screens"),
      lightingRequired: form.lightingRequired || false,
      lightingCost: getAddonCost("lighting"),
      demolitionRequired: form.demolitionRequired || false,
      demolitionCostPerM2: getAddonCost("demolition"),
      disposalRequired: form.disposalRequired || false,
      disposalCost: getAddonCost("disposal"),
      engineeringRequired: form.engineeringRequired || false,
      engineeringCost: getAddonCost("engineering"),
      permitRequired: form.permitRequired || false,
      permitCost: getAddonCost("permit"),
      // Dynamic add-ons: non-legacy items selected via selectedAddons JSON
      dynamicAddons: ((form as any).selectedAddons || []).filter((s: any) => {
        // Exclude items that are already handled by legacy boolean fields
        const legacyCategories = ["stairs", "handrail", "screens", "lighting", "demolition", "disposal", "engineering", "permit"];
        const matchedItem = addonItems?.find((a: any) => a.id === s.addonItemId);
        if (!matchedItem) return false;
        return !legacyCategories.includes(matchedItem.category.toLowerCase());
      }).map((s: any) => {
        const matchedItem = addonItems?.find((a: any) => a.id === s.addonItemId);
        return {
          addonItemId: s.addonItemId,
          qty: s.qty || 1,
          unitPrice: parseFloat(matchedItem?.unitPrice || "0"),
          priceOverride: s.priceOverride != null ? s.priceOverride : null,
          name: matchedItem?.itemName || "",
        };
      }),
      marginPercent: parseFloat(form.selectedMarginPercent as string) || parseFloat(selectedPricingRule?.defaultMarginPercent || "35"),
      commissionPercent: parseFloat(form.commissionPercent as string) || 10,
      gstPercent: parseFloat(selectedPricingRule?.gstPercent || "10"),
      depositPercent: parseFloat(form.depositPercent as string) || parseFloat(selectedPricingRule?.defaultDepositPercent || "20"),
      baseDeliveryFee: parseFloat(form.baseDeliveryFee as string) || parseFloat(selectedPricingRule?.baseDeliveryFee || "350"),
      restrictedAccessSurcharge: parseFloat(selectedPricingRule?.restrictedAccessSurcharge || "150"),
      councilFees: parseFloat(form.councilFees as string) || 0,
      homeWarranty: parseFloat(form.homeWarranty as string) || 0,
    });
  }, [form, products, framing, labourRules, pricingRules, addonItems, designPayload]);

  // Auto-recalculate after auto-save completes (silently)
  useEffect(() => {
    if (triggerAutoRecalcRef.current && !calculateMutation.isPending) {
      triggerAutoRecalcRef.current = false;
      const width = parseFloat(form.deckWidthM as string) || 0;
      const projection = parseFloat(form.deckProjectionM as string) || 0;
      if (width > 0 && projection > 0) {
        runCalculation();
      }
    }
  });

  // Unique brands from products
  const brands = useMemo(() => {
    if (!products) return [];
    return Array.from(new Set(products.map((p: any) => p.brand)));
  }, [products]);

  const filteredProducts = useMemo(() => {
    if (!products) return [];
    if (form.deckingBrand) return products.filter((p: any) => p.brand === form.deckingBrand);
    return products;
  }, [products, form.deckingBrand]);

  // Filter products by board type for fascia and edge dropdowns
  const fasciaProducts = useMemo(() => {
    if (!products) return [];
    return products.filter((p: any) => {
      try { const t = JSON.parse(p.boardTypes || "[]"); return t.includes("fascia"); } catch { return false; }
    });
  }, [products]);

  const edgeProducts = useMemo(() => {
    if (!products) return [];
    return products.filter((p: any) => {
      try { const t = JSON.parse(p.boardTypes || "[]"); return t.includes("edge"); } catch { return false; }
    });
  }, [products]);

  // Derive board specs from selected product for auto-population into DeckDesignPanel
  const selectedProductBoardSpecs = useMemo(() => {
    if (!form.deckingProductId || !products) return undefined;
    const product = products.find((p: any) => p.id === form.deckingProductId);
    if (!product) return undefined;
    const widthMm = product.widthMm || 138;
    const effectiveCoverMm = product.effectiveCoverMm || widthMm;
    const boardGap = widthMm > effectiveCoverMm ? widthMm - effectiveCoverMm : 5.5;
    const boardLength = product.boardLengthMm || (product.standardBoardLengthM ? Math.round(parseFloat(product.standardBoardLengthM) * 1000) : 5400);
    return { boardWidth: widthMm, boardGap, boardLength };
  }, [form.deckingProductId, products]);

  // Resolve initial SubfloorInputs from saved JSON or form fields
  const initialDesignInputs = useMemo<SubfloorInputs | undefined>(() => {
    if ((form as any).designInputsJson) {
      try {
        return JSON.parse((form as any).designInputsJson);
      } catch { /* fall through */ }
    }
    return undefined;
  }, [form]);

  // Sections list including conditional comms
  const allSections = useMemo(() => {
    const base = [...SECTIONS];
    if ((form as any).clientId && form.clientPhone) {
      base.push({ id: "comms", label: "Communications", icon: MessageSquare } as any);
    }
    return base;
  }, [(form as any).clientId, form.clientPhone]);

  if (isLoading) {
    return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;
  }

  if (!quote) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">Deck quote not found.</p>
        <Button variant="outline" onClick={() => navigate("/deck-quotes")} className="mt-4"><ArrowLeft className="w-4 h-4 mr-2" />Back</Button>
      </div>
    );
  }

  // Derived display values from design
  const displayArea = designPayload?.areaM2 ?? (parseFloat(form.areaM2 as string) || 0);
  const displayPerimeter = designPayload?.perimeterM ?? (parseFloat(form.perimeterM as string) || 0);
  const displayWidthM = designPayload ? (designPayload.inputs.length / 1000).toFixed(2) : (form.deckWidthM || "—");
  const displayProjM = designPayload ? (designPayload.inputs.width / 1000).toFixed(2) : (form.deckProjectionM || "—");
  const displayShape = designPayload?.inputs.shape || form.deckShape || "rectangular";

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div className="flex items-center gap-3 min-w-0">
          <Button variant="ghost" size="icon" className="shrink-0" onClick={() => navigate("/deck-quotes")}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl sm:text-2xl font-bold truncate">{quote.quoteNumber}</h1>
              {(quote as any).hbcfRequired && (
                <Badge variant="destructive" className="text-[11px] shrink-0 gap-1">
                  <Shield className="h-3 w-3" />
                  HBCF required
                </Badge>
              )}
            </div>
            <p className="text-xs sm:text-sm text-muted-foreground truncate">
              {(quote as any).clientName} &middot; Deck Quote
              {(quote as any).hbcfRequirementReason ? ` · ${(quote as any).hbcfRequirementReason}` : ""}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={saveQuote} disabled={saving}>
            <Save className="w-4 h-4 sm:mr-2" /><span className="hidden sm:inline">{saving ? "Saving..." : "Save"}</span>
          </Button>
          {autoSaveStatus === "saving" && <span className="text-xs text-muted-foreground animate-pulse">Auto-saving...</span>}
          {autoSaveStatus === "saved" && <span className="text-xs text-green-600">✓ Saved</span>}
          {autoSaveStatus === "error" && <span className="text-xs text-red-600">Auto-save failed</span>}
          <Button size="sm" onClick={runCalculation} disabled={calculateMutation.isPending}>
            <Calculator className="w-4 h-4 sm:mr-2" /><span className="hidden sm:inline">{calculateMutation.isPending ? "Calculating..." : "Calculate"}</span>
          </Button>
        </div>
      </div>

      {/* Design Summary Bar */}
      {displayArea > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-2 sm:gap-4 text-xs bg-muted/50 rounded-lg px-3 sm:px-4 py-2 border">
          <span className="font-medium text-primary">Design:</span>
          <span>{displayWidthM}m × {displayProjM}m</span>
          <span className="hidden sm:inline text-muted-foreground">|</span>
          <span>{displayShape}</span>
          <span className="hidden sm:inline text-muted-foreground">|</span>
          <span className="font-semibold">{displayArea.toFixed(2)} m²</span>
          <span className="hidden sm:inline text-muted-foreground">|</span>
          <span>{displayPerimeter.toFixed(2)} m perimeter</span>
        </div>
      )}

      {/* Mobile Hamburger Nav */}
      <div className="lg:hidden sticky top-0 z-20 bg-background/95 backdrop-blur border-b mb-4 -mx-4 px-4 py-2 flex items-center gap-2">
        <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
          <SheetTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 w-8 p-0">
              <Menu className="h-4 w-4" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-64 p-4">
            <SheetTitle className="sr-only">Sections</SheetTitle>
            <div className="space-y-1 mt-4">
              <p className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wider mb-2 px-2">Sections</p>
              <div className="flex gap-1 px-2 mb-2">
                <button
                  onClick={() => setOpenSections(allSections.map(s => s.id))}
                  className="flex-1 text-[10px] px-1.5 py-0.5 rounded border border-border hover:bg-muted/60 text-muted-foreground transition-colors"
                >
                  Expand All
                </button>
                <button
                  onClick={() => setOpenSections([])}
                  className="flex-1 text-[10px] px-1.5 py-0.5 rounded border border-border hover:bg-muted/60 text-muted-foreground transition-colors"
                >
                  Collapse All
                </button>
              </div>
              {allSections.map(section => {
                const Icon = section.icon;
                const isActive = activeSection === section.id;
                return (
                  <button
                    key={section.id}
                    onClick={() => {
                      setActiveSection(section.id);
                      if (!openSections.includes(section.id)) {
                        setOpenSections(prev => [...prev, section.id]);
                      }
                      setMobileNavOpen(false);
                      setTimeout(() => {
                        const el = document.getElementById(`deck-section-${section.id}`);
                        if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
                      }, 300);
                    }}
                    className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm transition-colors text-left ${
                      isActive ? "bg-primary/10 text-primary font-medium" : "hover:bg-muted/60 text-muted-foreground"
                    }`}
                  >
                    <Icon className="h-4 w-4 flex-shrink-0" />
                    <span>{section.label}</span>
                  </button>
                );
              })}
            </div>
          </SheetContent>
        </Sheet>
        <span className="text-sm font-medium text-muted-foreground">Sections</span>
      </div>

      {/* Side Accordion Layout */}
      <div className="flex gap-6">
        {/* ─── Sticky Sidebar Nav ─── */}
        <nav className="hidden lg:block w-48 flex-shrink-0">
          <div className="sticky top-4 space-y-0.5 max-h-[calc(100vh-6rem)] overflow-y-auto">
            <p className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wider mb-2 px-2">Sections</p>
            <div className="flex gap-1 px-2 mb-2">
              <button
                onClick={() => setOpenSections(allSections.map(s => s.id))}
                className="flex-1 text-[10px] px-1.5 py-0.5 rounded border border-border hover:bg-muted/60 text-muted-foreground transition-colors"
              >
                Expand All
              </button>
              <button
                onClick={() => setOpenSections([])}
                className="flex-1 text-[10px] px-1.5 py-0.5 rounded border border-border hover:bg-muted/60 text-muted-foreground transition-colors"
              >
                Collapse All
              </button>
            </div>
            {allSections.map(section => {
              const Icon = section.icon;
              const isActive = activeSection === section.id;
              return (
                <button
                  key={section.id}
                  onClick={() => {
                    setActiveSection(section.id);
                    if (!openSections.includes(section.id)) {
                      setOpenSections(prev => [...prev, section.id]);
                    }
                    const el = document.getElementById(`deck-section-${section.id}`);
                    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
                  }}
                  className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs transition-colors text-left ${
                    isActive ? "bg-primary/10 text-primary font-medium" : "hover:bg-muted/60 text-muted-foreground"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5 flex-shrink-0" />
                  <span>{section.label}</span>
                </button>
              );
            })}
          </div>
        </nav>

        {/* ─── Main Content (Accordion) ─── */}
        <div className="flex-1 min-w-0">
          <Accordion type="multiple" value={openSections} onValueChange={setOpenSections} className="space-y-3">
            {/* ═══ 1. Client ═══ */}
            <AccordionItem value="client" id="deck-section-client" className="border rounded-lg px-4">
              <AccordionTrigger className="text-sm font-medium">Client</AccordionTrigger>
              <AccordionContent className="space-y-6">
                <Card>
                  <CardHeader><CardTitle>Client & Job Information</CardTitle></CardHeader>
                  <CardContent className="space-y-4">
                    <ClientPicker
                      selectedClientId={(form as any).clientId || null}
                      onClientSelect={(client) => {
                        updateField("clientId" as any, client.id);
                        updateField("clientName", client.name);
                        updateField("clientPhone", client.phone || "");
                        updateField("clientEmail", client.email || "");
                        updateField("clientCompany", client.company || "");
                        const fullAddr = [client.address, client.suburb, client.state, client.postcode].filter(Boolean).join(", ");
                        updateField("siteAddress", fullAddr);
                        // Auto-detect region from lead data
                        if (client.postcode || client.suburb || client.state) {
                          const detected = detectRegion(client.postcode || "", client.suburb || "", client.state || "");
                          if (detected) updateField("region", detected);
                        }
                        // Auto-populate design adviser from lead
                        if (client.designAdvisor) updateField("designAdvisor", client.designAdvisor);
                      }}
                      onClientClear={() => updateField("clientId" as any, null)}
                      clientName={form.clientName}
                      clientEmail={form.clientEmail || undefined}
                      clientPhone={form.clientPhone || undefined}
                      clientAddress={form.siteAddress || undefined}
                    />
                    {/* Site Address with autocomplete */}
                    <div className="space-y-1">
                      <Label className="text-xs">Site Address</Label>
                      <AddressAutocomplete
                        value={form.siteAddress || ""}
                        onChange={(v) => updateField("siteAddress", v)}
                        onAddressSelect={(addr) => {
                          const street = addr.unitNumber
                            ? `${addr.unitNumber}/${addr.streetAddress}`
                            : (addr.streetAddress || addr.fullAddress);
                          updateField("siteAddress", street);
                          if (addr.postcode || addr.suburb || addr.state) {
                            const detected = detectRegion(addr.postcode || "", addr.suburb || "", addr.state || "");
                            if (detected) updateField("region", detected);
                          }
                        }}
                        placeholder="Start typing site address..."
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs">Region</Label>
                        <RegionSelect value={(form as any).region || ""} onChange={(v) => updateField("region", v)} />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Local Council</Label>
                        <CouncilSelect value={(form as any).localCouncil || ""} onChange={(v) => updateField("localCouncil", v)} />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Design Adviser</Label>
                      <DesignAdvisorSelect value={(form as any).designAdvisor || ""} onChange={(v) => updateField("designAdvisor", v)} />
                    </div>
                    {/* Description of Work */}
                    <div className="space-y-2">
                      <Label className="text-xs font-medium">Description of Work</Label>
                      <Textarea
                        value={(form as any).descriptionOfWork || ""}
                        onChange={(e) => updateField("descriptionOfWork", e.target.value)}
                        rows={3}
                        className="text-sm"
                        placeholder="Describe the scope of work for this deck project..."
                      />
                    </div>
                  </CardContent>
                </Card>
              </AccordionContent>
            </AccordionItem>

            {/* ═══ 2. Design (Source of Truth for dimensions) ═══ */}
            <AccordionItem value="design" id="deck-section-design" className="border rounded-lg px-4">
              <AccordionTrigger className="text-sm font-medium">Design</AccordionTrigger>
              <AccordionContent className="space-y-6">
                {/* Decking Product Selection — first step so board specs auto-populate */}
                <Card>
                  <CardHeader><CardTitle className="text-sm">Decking Product</CardTitle></CardHeader>
                  <CardContent className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <Label className="text-xs">Brand</Label>
                      <Select value={form.deckingBrand || ""} onValueChange={(v) => updateField("deckingBrand", v)}>
                        <SelectTrigger className="h-9"><SelectValue placeholder="Select brand" /></SelectTrigger>
                        <SelectContent>
                          {brands.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs">Product</Label>
                      <Select value={String(form.deckingProductId || "")} onValueChange={(v) => updateField("deckingProductId", parseInt(v))}>
                        <SelectTrigger className="h-9"><SelectValue placeholder="Select product" /></SelectTrigger>
                        <SelectContent>
                          {filteredProducts.map((p: any) => (
                            <SelectItem key={p.id} value={String(p.id)}>{p.productName} - {p.profile}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs">Colour</Label>
                      <Input value={form.colour || ""} onChange={(e) => updateField("colour", e.target.value)} placeholder="e.g. Jarrah" className="h-9" />
                    </div>
                    <div>
                      <Label className="text-xs">Fascia Board</Label>
                      <Select value={String(form.fasciaProductId || "")} onValueChange={(v) => updateField("fasciaProductId", v ? parseInt(v) : null)}>
                        <SelectTrigger className="h-9"><SelectValue placeholder="Select fascia" /></SelectTrigger>
                        <SelectContent>
                          {fasciaProducts.map((p: any) => (
                            <SelectItem key={p.id} value={String(p.id)}>{p.productName} - {p.profile} ({p.boardLengthMm || "?"}mm)</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs">Edge Board</Label>
                      <Select value={String(form.edgeProductId || "")} onValueChange={(v) => updateField("edgeProductId", v ? parseInt(v) : null)}>
                        <SelectTrigger className="h-9"><SelectValue placeholder="Select edge" /></SelectTrigger>
                        <SelectContent>
                          {edgeProducts.map((p: any) => (
                            <SelectItem key={p.id} value={String(p.id)}>{p.productName} - {p.profile} ({p.boardLengthMm || "?"}mm)</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </CardContent>
                </Card>

                <DeckDesignPanel
                  deckWidthM={parseFloat(form.deckWidthM as string) || undefined}
                  deckProjectionM={parseFloat(form.deckProjectionM as string) || undefined}
                  deckShape={form.deckShape || undefined}
                  deckHeightMm={form.deckHeightAboveGroundMm || undefined}
                  initialInputs={initialDesignInputs}
                  onDesignChange={handleDesignChange}
                  pricingOverrides={engineeringPricingOverrides}
                  productBoardSpecs={selectedProductBoardSpecs}
                  productName={filteredProducts?.find((p: any) => p.id === form.deckingProductId)?.productName}
                  colourName={form.deckingColour || undefined}
                  stairsRequired={!!form.stairsRequired}
                  onStairChange={handleStairChange}
                  isAdmin={isAdmin}
                  quoteNumber={(quote as any)?.quoteNumber}
                  clientName={form.clientName}
                  siteAddress={form.siteAddress || undefined}
                />
              </AccordionContent>
            </AccordionItem>

            {/* ═══ Construction Spec ═══ */}
            <AccordionItem value="specsheet" id="deck-section-specsheet" className="border rounded-lg px-4">
              <AccordionTrigger className="text-sm font-medium">Construction Spec</AccordionTrigger>
              <AccordionContent>
                <DeckSpecSheet
                  specData={((form as any).specData as DeckSpecData) || {}}
                  onChange={(specData) => updateField("specData", specData)}
                />
              </AccordionContent>
            </AccordionItem>

            {/* ═══ 3. Site + Add-Ons ═══ */}
            <AccordionItem value="product" id="deck-section-product" className="border rounded-lg px-4">
              <AccordionTrigger className="text-sm font-medium">Site + Add-Ons</AccordionTrigger>
              <AccordionContent className="space-y-6">
                <Card>
                  <CardHeader><CardTitle>Site Conditions</CardTitle></CardHeader>
                  <CardContent className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Levels</Label>
                      <Select value={form.levels || ""} onValueChange={(v) => updateField("levels", v)}>
                        <SelectTrigger><SelectValue placeholder="Select level type" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="single">Single Level</SelectItem>
                          <SelectItem value="split">Split Level</SelectItem>
                          <SelectItem value="multi">Multi Level</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Site Condition</Label>
                      <Select value={form.siteCondition || ""} onValueChange={(v) => updateField("siteCondition", v)}>
                        <SelectTrigger><SelectValue placeholder="Select condition" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="flat">Flat / Easy Access</SelectItem>
                          <SelectItem value="sloping">Sloping Site</SelectItem>
                          <SelectItem value="restricted">Restricted Access</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader><CardTitle>Add-Ons</CardTitle></CardHeader>
                  <CardContent className="grid grid-cols-2 gap-4">
                    {(addonItems || []).map((item: any) => {
                      // Map legacy boolean fields to addon item categories
                      const legacyFieldMap: Record<string, string> = {
                        stairs: "stairsRequired",
                        handrail: "handrailRequired",
                        screens: "screensRequired",
                        lighting: "lightingRequired",
                        demolition: "demolitionRequired",
                        disposal: "disposalRequired",
                        engineering: "engineeringRequired",
                        permit: "permitRequired",
                      };
                      const legacyField = legacyFieldMap[item.category.toLowerCase()];
                      // Check if selected via legacy field or selectedAddons JSON
                      const selectedAddons: Array<{addonItemId: number; qty: number; priceOverride?: number | null; notes?: string}> = (form as any).selectedAddons || [];
                      const isChecked = legacyField
                        ? !!(form as any)[legacyField]
                        : selectedAddons.some((s: any) => s.addonItemId === item.id);
                      const addonEntry = selectedAddons.find((s: any) => s.addonItemId === item.id);
                      const qty = addonEntry?.qty || 1;
                      const priceOverride = addonEntry?.priceOverride ?? null;
                      const addonNotes = addonEntry?.notes || "";
                      // Determine if this add-on needs a quantity input (unit-based pricing)
                      // Show qty input for any unit that is NOT "fixed" (fixed = lump sum, no qty needed)
                      const unitLower = (item.unit || "").toLowerCase().trim();
                      const isQtyBased = !!item.unit && unitLower !== "fixed" && unitLower !== "";

                      const handleToggle = (checked: boolean) => {
                        // Update legacy field if it exists
                        if (legacyField) {
                          updateField(legacyField, checked);
                        }
                        // Update selectedAddons JSON
                        const current: Array<{addonItemId: number; qty: number; priceOverride?: number | null; notes?: string}> = [...((form as any).selectedAddons || [])];
                        if (checked) {
                          if (!current.some((s: any) => s.addonItemId === item.id)) {
                            current.push({ addonItemId: item.id, qty: 1 });
                          }
                        } else {
                          const idx = current.findIndex((s: any) => s.addonItemId === item.id);
                          if (idx >= 0) current.splice(idx, 1);
                        }
                        updateField("selectedAddons", current);
                      };

                      const handleQtyChange = (newQty: number) => {
                        const current: Array<{addonItemId: number; qty: number; priceOverride?: number | null; notes?: string}> = [...((form as any).selectedAddons || [])];
                        const idx = current.findIndex((s: any) => s.addonItemId === item.id);
                        if (idx >= 0) {
                          current[idx] = { ...current[idx], qty: newQty };
                        } else {
                          current.push({ addonItemId: item.id, qty: newQty });
                        }
                        updateField("selectedAddons", current);
                      };

                      const handlePriceOverride = (val: string) => {
                        const current: Array<{addonItemId: number; qty: number; priceOverride?: number | null; notes?: string}> = [...((form as any).selectedAddons || [])];
                        const idx = current.findIndex((s: any) => s.addonItemId === item.id);
                        const numVal = val === "" ? null : parseFloat(val);
                        if (idx >= 0) {
                          current[idx] = { ...current[idx], priceOverride: numVal };
                        } else {
                          current.push({ addonItemId: item.id, qty: 1, priceOverride: numVal });
                        }
                        updateField("selectedAddons", current);
                      };

                      const handleNotesChange = (val: string) => {
                        const current: Array<{addonItemId: number; qty: number; priceOverride?: number | null; notes?: string}> = [...((form as any).selectedAddons || [])];
                        const idx = current.findIndex((s: any) => s.addonItemId === item.id);
                        if (idx >= 0) {
                          current[idx] = { ...current[idx], notes: val };
                        } else {
                          current.push({ addonItemId: item.id, qty: 1, notes: val });
                        }
                        updateField("selectedAddons", current);
                      };

                      return (
                        <div key={item.id} className="flex flex-col gap-1">
                          <div className="flex items-center gap-2">
                            <Checkbox checked={isChecked} onCheckedChange={(v) => handleToggle(!!v)} />
                            <Label className="text-sm">{item.itemName}</Label>
                            {item.unit && <span className="text-xs text-muted-foreground">({item.unit})</span>}
                            {item.unitPrice && <span className="text-xs text-muted-foreground">${parseFloat(item.unitPrice).toFixed(2)}/{item.unit || "ea"}</span>}
                          </div>
                          {isChecked && (
                            <div className="ml-6 space-y-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                {isQtyBased && (
                                  <>
                                    <Label className="text-xs text-muted-foreground">Qty:</Label>
                                    <Input
                                      type="number"
                                      min={1}
                                      step={item.unit?.toLowerCase() === "each" ? 1 : 0.1}
                                      className="w-20 h-7 text-sm"
                                      value={qty}
                                      onChange={(e) => handleQtyChange(parseFloat(e.target.value) || 1)}
                                    />
                                    <span className="text-xs text-muted-foreground">{item.unit}</span>
                                  </>
                                )}
                                <Label className="text-xs text-muted-foreground ml-2">Price Override:</Label>
                                <Input
                                  type="number"
                                  min={0}
                                  step={0.01}
                                  placeholder={item.unitPrice ? `$${parseFloat(item.unitPrice).toFixed(2)}` : "$0.00"}
                                  className="w-24 h-7 text-sm"
                                  value={priceOverride !== null ? priceOverride : ""}
                                  onChange={(e) => handlePriceOverride(e.target.value)}
                                />
                              </div>
                              <div className="flex items-center gap-2">
                                <Label className="text-xs text-muted-foreground">Notes:</Label>
                                <Input
                                  type="text"
                                  placeholder="e.g. adjustable height 100-150mm"
                                  className="flex-1 h-7 text-sm"
                                  value={addonNotes}
                                  onChange={(e) => handleNotesChange(e.target.value)}
                                />
                              </div>
                            </div>
                          )}
                          {item.category.toLowerCase() === "stairs" && !isChecked && (form.deckHeightAboveGroundMm || 0) >= 230 && (
                            <p className="text-[10px] text-amber-600 flex items-center gap-1 ml-6">
                              <span>⚠</span> Deck height ({form.deckHeightAboveGroundMm}mm) requires stairs for NCC compliance
                            </p>
                          )}
                        </div>
                      );
                    })}
                    {(!addonItems || addonItems.length === 0) && (
                      <p className="text-sm text-muted-foreground col-span-2">No add-on items configured. Add items in Admin → Deck → Add-Ons.</p>
                    )}
                  </CardContent>
                </Card>

                {/* ── Admin: Pricing Parameters & Commission ── */}
                {isAdmin && (
                <Card>
                  <CardHeader><CardTitle className="text-sm">Pricing Parameters</CardTitle></CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div>
                        <Label className="text-xs">Labour Rule</Label>
                        <Select value={String(form.labourRuleId || "")} onValueChange={(v) => updateField("labourRuleId", parseInt(v))}>
                          <SelectTrigger className="h-8"><SelectValue placeholder="Select rule" /></SelectTrigger>
                          <SelectContent>
                            {labourRules?.map((r: any) => (
                              <SelectItem key={r.id} value={String(r.id)}>{r.ruleName}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label className="text-xs">Pricing Rule</Label>
                        <Select value={String(form.pricingRuleId || "")} onValueChange={(v) => updateField("pricingRuleId", parseInt(v))}>
                          <SelectTrigger className="h-8"><SelectValue placeholder="Select rule" /></SelectTrigger>
                          <SelectContent>
                            {pricingRules?.map((r: any) => (
                              <SelectItem key={r.id} value={String(r.id)}>{r.ruleName}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label className="text-xs">Commission Rate (%)</Label>
                        <Input
                          type="number" min={0} max={99} step={0.5}
                          value={form.commissionPercent || "10"}
                          onChange={(e) => updateField("commissionPercent", e.target.value)}
                          className="h-8 text-sm" placeholder="10"
                        />
                        <p className="text-[10px] text-muted-foreground mt-0.5">Sell ÷ (1 − rate)</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                )}

                {/* ── Adjustments (auto-calculated) ── */}
                <Card>
                  <CardHeader><CardTitle className="text-sm">Adjustments</CardTitle></CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      {/* Delivery $ — auto-calculated read-only */}
                      <div className="space-y-1.5">
                        <Label className="text-xs">Delivery $</Label>
                        <Input
                          type="number" step="0.01"
                          value={form.deliveryAmount || "0"}
                          onChange={(e) => { updateField("deliveryAmount", e.target.value); }}
                          className={`h-8 text-sm ${!(form as any).deliveryOverride ? 'bg-muted/50 cursor-not-allowed' : ''}`}
                          readOnly={!(form as any).deliveryOverride}
                          placeholder="0.00"
                        />
                        {(() => {
                          const distanceKm = parseFloat((form as any)?.travelDistanceKm || "0");
                          const ratePerKm = parseFloat(priceSettings.deliveryRatePerKm || "0");
                          const tiers = priceSettings.deliveryFactorTiers;
                          let factor = 1;
                          let tierLabel = "";
                          if (tiers.length > 0) {
                            for (const tier of tiers) {
                              if (distanceKm >= tier.threshold) { factor = tier.factor; tierLabel = `${tier.threshold}km+ → ×${tier.factor}`; }
                            }
                            if (distanceKm < tiers[0].threshold) { factor = tiers[0].factor; tierLabel = `< ${tiers[0].threshold}km → ×${tiers[0].factor}`; }
                          }
                          const autoDelivery = distanceKm * ratePerKm * factor;
                          return (
                            <div className="space-y-1">
                              {distanceKm > 0 && ratePerKm > 0 && (
                                <div className="text-[10px] text-muted-foreground space-y-0.5">
                                  <p className="font-medium">Auto: ${autoDelivery.toFixed(2)}</p>
                                  <p className="pl-2">{distanceKm}km × ${ratePerKm}/km × {factor} factor</p>
                                  {tierLabel && <p className="pl-2">Tier: {tierLabel}</p>}
                                </div>
                              )}
                              {!(form as any).deliveryOverride && autoDelivery > 0 && (form.deliveryAmount || "0") !== autoDelivery.toFixed(2) && (
                                <Button variant="outline" size="sm" className="h-6 text-[10px]" onClick={() => updateField("deliveryAmount", autoDelivery.toFixed(2))}>
                                  Apply ${autoDelivery.toFixed(2)}
                                </Button>
                              )}
                              {(form as any).deliveryOverride && (
                                <Button variant="ghost" size="sm" className="h-6 text-[10px] text-muted-foreground" onClick={() => updateField("deliveryOverride", false)}>
                                  Reset to auto
                                </Button>
                              )}
                              {!((form as any).deliveryOverride) && isAdmin && (
                                <Button variant="ghost" size="sm" className="h-5 text-[10px] text-amber-600 p-0" onClick={() => { updateField("deliveryOverride", true); toast.info("Delivery unlocked for manual override"); }}>
                                  <Lock className="h-2.5 w-2.5 mr-0.5" /> Unlock override
                                </Button>
                              )}
                            </div>
                          );
                        })()}
                      </div>

                      {/* Travel Allowance $ — auto-calculated read-only */}
                      <div className="space-y-1.5">
                        <Label className="text-xs">Travel Allowance $</Label>
                        <Input
                          type="number" step="0.01"
                          value={form.travelAllowance || "0"}
                          onChange={(e) => updateField("travelAllowance", e.target.value)}
                          className={`h-8 text-sm ${!(form as any)?.travelOverridden ? 'bg-muted/50 cursor-not-allowed' : ''}`}
                          readOnly={!(form as any)?.travelOverridden}
                          placeholder="0.00"
                        />
                        {(form as any)?.travelDistanceKm && (
                          <div className="flex items-center gap-1.5 flex-wrap text-[10px] text-muted-foreground">
                            <MapPin className="h-3 w-3" />
                            <span>{(form as any).travelDistanceKm}km</span>
                            {(form as any).travelBranchName && <span className="font-medium">from {(form as any).travelBranchName}</span>}
                            {(form as any).travelBandKey && <Badge variant="secondary" className="text-[9px] h-4 px-1">{(form as any).travelBandKey}</Badge>}
                            {(form as any).travelOverridden && <Badge variant="outline" className="text-[9px] h-4 px-1 text-amber-600 border-amber-300"><Lock className="h-2.5 w-2.5 mr-0.5" />Override</Badge>}
                          </div>
                        )}
                        {isAdmin && (form as any)?.travelDistanceKm && !(form as any)?.travelOverridden && (
                          <Button variant="ghost" size="sm" className="h-5 text-[10px] text-amber-600 p-0" onClick={() => { updateField("travelOverridden", true); toast.info("Travel allowance unlocked for manual override"); }}>
                            <Lock className="h-2.5 w-2.5 mr-0.5" /> Unlock override
                          </Button>
                        )}
                      </div>

                      {/* Small Job Surcharge % — dropdown from settings */}
                      <div className="space-y-1.5">
                        <Label className="text-xs">Small Job Surcharge %</Label>
                        <select
                          value={form.smallJobSurcharge || "0"}
                          onChange={(e) => updateField("smallJobSurcharge", e.target.value)}
                          className="flex h-8 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        >
                          <option value="0">None (0%)</option>
                          {priceSettings.smallJob !== "0" && (
                            <option value={priceSettings.smallJob}>{priceSettings.smallJob}%</option>
                          )}
                        </select>
                        {priceSettings.smallJobThreshold !== "0" && <p className="text-[10px] text-muted-foreground">Applies below ${parseFloat(priceSettings.smallJobThreshold).toLocaleString()} threshold</p>}
                      </div>

                      {/* Construction Mgmt % — auto-calculated from deck shape, read-only with admin unlock */}
                      <div className="space-y-1.5">
                        <Label className="text-xs">Construction Mgmt %</Label>
                        <Input
                          type="number" step="0.1"
                          value={form.constructionMgmtPercent || "0"}
                          onChange={(e) => { updateField("constructionMgmtPercent", e.target.value); }}
                          className={`h-8 text-sm ${!(form as any).constructionMgmtOverride ? 'bg-muted/50 cursor-not-allowed' : ''}`}
                          readOnly={!(form as any).constructionMgmtOverride}
                        />
                        {(() => {
                          const mgmtRates = priceSettings.constructionMgmtRates;
                          const shape = ((form as any)?.deckShape || "").toLowerCase();
                          const mgmtBreakdown: { label: string; rate: number }[] = [];
                          for (const rate of mgmtRates) {
                            if (shape.includes(rate.key.toLowerCase())) {
                              const r = parseFloat(rate.value) || 0;
                              if (r > 0) mgmtBreakdown.push({ label: rate.key, rate: r });
                            }
                          }
                          const mgmtAutoTotal = mgmtBreakdown.reduce((s, b) => s + b.rate, 0);
                          return (
                            <div className="space-y-1">
                              {mgmtBreakdown.length > 0 && (
                                <div className="text-[10px] text-muted-foreground space-y-0.5">
                                  <p className="font-medium">Auto-calculated: {mgmtAutoTotal.toFixed(1)}%</p>
                                  {mgmtBreakdown.map((b, i) => <p key={i} className="pl-2">{b.label}: +{b.rate}%</p>)}
                                </div>
                              )}
                              {!(form as any).constructionMgmtOverride && mgmtAutoTotal > 0 && (form.constructionMgmtPercent || "0") !== String(mgmtAutoTotal) && (
                                <Button variant="outline" size="sm" className="h-6 text-[10px]" onClick={() => updateField("constructionMgmtPercent", String(mgmtAutoTotal))}>
                                  Apply {mgmtAutoTotal}%
                                </Button>
                              )}
                              {(form as any).constructionMgmtOverride && (
                                <Button variant="ghost" size="sm" className="h-6 text-[10px] text-muted-foreground" onClick={() => { updateField("constructionMgmtOverride", false); }}>
                                  Reset to auto
                                </Button>
                              )}
                              {!(form as any).constructionMgmtOverride && isAdmin && (
                                <Button variant="ghost" size="sm" className="h-5 text-[10px] text-amber-600 p-0" onClick={() => { updateField("constructionMgmtOverride", true); toast.info("Construction Mgmt unlocked for manual override"); }}>
                                  <Lock className="h-2.5 w-2.5 mr-0.5" /> Unlock override
                                </Button>
                              )}
                              {mgmtRates.length > 0 && <p className="text-[10px] text-muted-foreground">Rates: {mgmtRates.map(c => `${c.key}=${c.value}%`).join(", ")}</p>}
                            </div>
                          );
                        })()}
                      </div>

                      {/* Council Fees $ — dropdown from settings */}
                      <div className="space-y-1.5">
                        <Label className="text-xs">Council Fees $</Label>
                        {councilFeeOptions.length > 0 ? (
                          <select
                            value={form.councilFees || "0"}
                            onChange={(e) => updateField("councilFees", e.target.value)}
                            className="flex h-8 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                          >
                            <option value="0">None</option>
                            {councilFeeOptions.map((cf: any) => (
                              <option key={cf.key} value={cf.value}>{cf.key} - ${parseFloat(cf.value).toLocaleString()}</option>
                            ))}
                          </select>
                        ) : (
                          <Input type="number" step="0.01" value={form.councilFees || ""} onChange={(e) => updateField("councilFees", e.target.value)} className="h-8 text-sm" placeholder="0.00" />
                        )}
                      </div>

                      {/* Home Warranty (HOW) — conditional: hidden for ACT, dropdown from tiers */}
                      {(priceSettings.regionHowFlags[(form as any)?.region || ""] !== undefined ? priceSettings.regionHowFlags[(form as any)?.region || ""] : ((form as any)?.region || "").toUpperCase() !== "ACT") && (
                      <div className="space-y-1.5">
                        <Label className="text-xs flex items-center gap-1">
                          Home Warranty (HOW) $
                          {priceSettings.regionHowFlags[(form as any)?.region || ""] && <Badge variant="outline" className="text-[9px] px-1 py-0 bg-amber-50 text-amber-700">HOW Region</Badge>}
                        </Label>
                        {homeWarrantyTiers.length > 0 ? (
                          <select
                            value={form.homeWarranty || "0"}
                            onChange={(e) => updateField("homeWarranty", e.target.value)}
                            className="flex h-8 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                          >
                            <option value="0">None ($0)</option>
                            {homeWarrantyTiers.map((tier, idx) => (
                              <option key={idx} value={String(tier.amount)}>${tier.amount.toLocaleString()} (jobs ≥ ${tier.threshold.toLocaleString()})</option>
                            ))}
                          </select>
                        ) : (
                          <Input
                            type="number" step="0.01"
                            value={form.homeWarranty || ""}
                            onChange={(e) => updateField("homeWarranty", e.target.value)}
                            className="h-8 text-sm" placeholder="0.00"
                          />
                        )}
                        {(() => {
                          const sellPrice = parseFloat(form.sellPriceIncGst as string) || 0;
                          let suggested = 0;
                          for (const tier of homeWarrantyTiers) {
                            if (sellPrice >= tier.threshold) suggested = tier.amount;
                          }
                          if (suggested > 0 && parseFloat(form.homeWarranty as string || "0") !== suggested) {
                            return (
                              <p className="text-[10px] text-blue-600 cursor-pointer hover:underline" onClick={() => updateField("homeWarranty", String(suggested))}>
                                Suggested: ${suggested.toLocaleString()} (based on sell price)
                              </p>
                            );
                          }
                          return null;
                        })()}
                      </div>
                      )}
                    </div>
                  </CardContent>
                </Card>

                {/* ── Add-On Cost Breakdown (admin-only) ── */}
                {isAdmin && (calcResult || form.sellPriceIncGst) && (
                  <Card>
                    <CardHeader><CardTitle className="text-sm">Add-On Cost Breakdown</CardTitle></CardHeader>
                    <CardContent>
                      <div className="space-y-1 text-sm">
                        {(calcResult?.stairsCost || 0) > 0 && (
                          <div className="flex justify-between"><span className="text-muted-foreground">Stairs</span><span>${fmtNum(calcResult?.stairsCost)}</span></div>
                        )}
                        {(calcResult?.handrailCost || 0) > 0 && (
                          <div className="flex justify-between"><span className="text-muted-foreground">Handrail</span><span>${fmtNum(calcResult?.handrailCost)}</span></div>
                        )}
                        {(calcResult?.screensCost || 0) > 0 && (
                          <div className="flex justify-between"><span className="text-muted-foreground">Screens</span><span>${fmtNum(calcResult?.screensCost)}</span></div>
                        )}
                        {(calcResult?.lightingCost || 0) > 0 && (
                          <div className="flex justify-between"><span className="text-muted-foreground">Lighting</span><span>${fmtNum(calcResult?.lightingCost)}</span></div>
                        )}
                        {(calcResult?.demolitionCost || 0) > 0 && (
                          <div className="flex justify-between"><span className="text-muted-foreground">Demolition</span><span>${fmtNum(calcResult?.demolitionCost)}</span></div>
                        )}
                        {(calcResult?.disposalCost || 0) > 0 && (
                          <div className="flex justify-between"><span className="text-muted-foreground">Disposal</span><span>${fmtNum(calcResult?.disposalCost)}</span></div>
                        )}
                        {(calcResult?.engineeringCost || 0) > 0 && (
                          <div className="flex justify-between"><span className="text-muted-foreground">Engineering</span><span>${fmtNum(calcResult?.engineeringCost)}</span></div>
                        )}
                        {(calcResult?.permitCost || 0) > 0 && (
                          <div className="flex justify-between"><span className="text-muted-foreground">Permit</span><span>${fmtNum(calcResult?.permitCost)}</span></div>
                        )}
                        {((form as any).selectedAddons || []).filter((s: any) => {
                          const legacyCats = ["stairs", "handrail", "screens", "lighting", "demolition", "disposal", "engineering", "permit"];
                          const matched = addonItems?.find((a: any) => a.id === s.addonItemId);
                          return matched && !legacyCats.includes(matched.category.toLowerCase());
                        }).map((s: any) => {
                          const matched = addonItems?.find((a: any) => a.id === s.addonItemId);
                          const effectivePrice = s.priceOverride != null ? s.priceOverride : parseFloat(matched?.unitPrice || "0");
                          const cost = (s.qty || 1) * effectivePrice;
                          const hasOverride = s.priceOverride != null;
                          return (
                            <div key={s.addonItemId} className="flex flex-col gap-0.5">
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">
                                  {matched?.itemName} ({s.qty || 1} × ${effectivePrice.toFixed(2)})
                                  {hasOverride && <span className="text-amber-600 text-[10px] ml-1">● override</span>}
                                </span>
                                <span>${fmtNum(cost)}</span>
                              </div>
                              {s.notes && <span className="text-[10px] text-muted-foreground italic ml-2">— {s.notes}</span>}
                            </div>
                          );
                        })}
                        <div className="flex justify-between border-t pt-1 font-medium">
                          <span>Add-Ons Total</span>
                          <span>${fmtNum(calcResult?.addonsSubtotal || 0)}</span>
                        </div>
                        {(calcResult?.addonsSubtotal || 0) === 0 && (
                          <p className="text-xs text-muted-foreground">No add-ons selected</p>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </AccordionContent>
            </AccordionItem>

            {/* ═══ Checklist Pricing ═══ */}
            <AccordionItem value="checklist" id="deck-section-checklist" className="border rounded-lg px-4">
              <AccordionTrigger className="text-sm font-medium">
                Checklist Pricing
                {(form.checklistSelections as any)?.length > 0 && (
                  <span className="ml-2 text-xs text-muted-foreground">
                    ({(form.checklistSelections as any[]).length} items — ${(form.checklistSelections as any[]).reduce((s: number, i: any) => s + i.total, 0).toFixed(2)})
                  </span>
                )}
              </AccordionTrigger>
              <AccordionContent>
                {activeChecklistItems && activeChecklistItems.length > 0 ? (
                  <div className="space-y-3">
                    {Object.entries(
                      activeChecklistItems.reduce((acc: Record<string, any[]>, item: any) => {
                        const sec = item.section || "General";
                        if (!acc[sec]) acc[sec] = [];
                        acc[sec].push(item);
                        return acc;
                      }, {} as Record<string, any[]>)
                    ).map(([section, items]) => (
                      <div key={section}>
                        <p className="text-xs font-semibold text-muted-foreground uppercase mb-1">{section}</p>
                        <div className="space-y-1">
                          {(items as any[]).map((item: any) => {
                            const selections = (form.checklistSelections as any[] | undefined) || [];
                            const sel = selections.find((s: any) => s.itemId === item.id);
                            return (
                              <div key={item.id} className="flex items-center gap-2">
                                <input
                                  type="checkbox"
                                  checked={!!sel}
                                  onChange={(e) => {
                                    const prev = (form.checklistSelections as any[] | undefined) || [];
                                    if (e.target.checked) {
                                      updateField("checklistSelections", [...prev, {
                                        itemId: item.id, label: item.label, unitPrice: parseFloat(item.unitPrice),
                                        qty: 1, total: parseFloat(item.unitPrice), section: item.section || "General", unit: item.unit || "each"
                                      }]);
                                    } else {
                                      updateField("checklistSelections", prev.filter((s: any) => s.itemId !== item.id));
                                    }
                                  }}
                                  className="h-4 w-4 rounded border-gray-300"
                                />
                                <span className="text-sm flex-1">{item.label}</span>
                                <span className="text-xs text-muted-foreground">${parseFloat(item.unitPrice).toFixed(2)}/{item.unit || "each"}</span>
                                {sel && (
                                  <>
                                    <input
                                      type="number"
                                      min={1}
                                      value={sel.qty}
                                      onChange={(e) => {
                                        const qty = Math.max(1, parseInt(e.target.value) || 1);
                                        const prev = (form.checklistSelections as any[] | undefined) || [];
                                        updateField("checklistSelections", prev.map((s: any) =>
                                          s.itemId === item.id ? { ...s, qty, total: qty * s.unitPrice } : s
                                        ));
                                      }}
                                      className="w-14 h-7 text-xs border rounded px-1 text-center"
                                    />
                                    <span className="text-xs font-medium w-16 text-right">${sel.total.toFixed(2)}</span>
                                  </>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                    {((form.checklistSelections as any[] | undefined) || []).length > 0 && (
                      <div className="flex justify-between items-center pt-2 border-t">
                        <span className="text-sm font-medium">Checklist Subtotal</span>
                        <span className="text-sm font-bold">${((form.checklistSelections as any[]) || []).reduce((sum: number, s: any) => sum + s.total, 0).toFixed(2)}</span>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No checklist items configured. Add them in Admin Settings → Checklist Pricing.</p>
                )}
              </AccordionContent>
            </AccordionItem>

            {/* ═══ 4. Pricing ═══ */}
            <AccordionItem value="pricing" id="deck-section-pricing" className="border rounded-lg px-4">
              <AccordionTrigger className="text-sm font-medium">Pricing</AccordionTrigger>
              <AccordionContent className="space-y-6">
                <div className="flex justify-center">
                  <Button size="lg" onClick={runCalculation} disabled={calculateMutation.isPending}>
                    <Calculator className="w-5 h-5 mr-2" />{calculateMutation.isPending ? "Calculating..." : "Run Calculation"}
                  </Button>
                </div>

                {(calcResult || form.sellPriceIncGst) && (
                  <Card>
                    <CardHeader><CardTitle>Pricing Summary</CardTitle></CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <SummaryCard label="Deck Area" value={`${calcResult?.areaM2 || form.areaM2 || "\u2014"} m\u00b2`} />
                        <SummaryCard label="Board Count" value={`${calcResult?.boardCount || "\u2014"}`} />
                        <SummaryCard label="Sell (ex GST)" value={`$${fmtNum(calcResult?.sellPriceWithCommissionExGst || calcResult?.sellPriceExGst || form.sellPriceExGst)}`} />
                        <SummaryCard label="GST" value={`$${fmtNum(calcResult?.gstAmount || form.gstAmount)}`} />
                        {isAdmin && <SummaryCard label="Sell (inc GST)" value={`$${fmtNum(calcResult?.sellPriceIncGst || form.sellPriceIncGst)}`} highlight />}
                        <SummaryCard label="Price/m\u00b2" value={`$${fmtNum(((calcResult?.sellPriceIncGst || parseFloat(form.sellPriceIncGst as string) || 0) / (calcResult?.areaM2 || parseFloat(form.areaM2 as string) || 1)).toFixed(2))}`} />
                        {isAdmin && <SummaryCard label="Margin" value={`$${fmtNum(calcResult?.marginAmount)}`} />}
                        {isAdmin && <SummaryCard label="Effective Margin" value={`${calcResult?.effectiveMarginPercent?.toFixed(1) || "\u2014"}%`} />}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Override History */}
                {isAdmin && overrideHistory && overrideHistory.length > 0 && (
                  <Card>
                    <CardHeader><CardTitle className="text-sm">Price Override History</CardTitle></CardHeader>
                    <CardContent>
                      <div className="max-h-48 overflow-y-auto">
                        <table className="w-full text-xs">
                          <thead className="sticky top-0 bg-background">
                            <tr className="border-b">
                              <th className="text-left py-1 font-medium text-muted-foreground">Item</th>
                              <th className="text-right py-1 font-medium text-muted-foreground">From</th>
                              <th className="text-right py-1 font-medium text-muted-foreground">To</th>
                              <th className="text-left py-1 pl-2 font-medium text-muted-foreground">By</th>
                              <th className="text-right py-1 font-medium text-muted-foreground">When</th>
                            </tr>
                          </thead>
                          <tbody>
                            {overrideHistory.map((h: any) => (
                              <tr key={h.id} className="border-b border-dashed last:border-0">
                                <td className="py-1 text-foreground">{h.addonItemName}</td>
                                <td className="py-1 text-right text-muted-foreground">{h.previousPrice != null ? `$${parseFloat(h.previousPrice).toFixed(2)}` : "(master)"}</td>
                                <td className="py-1 text-right font-medium">{h.newPrice != null ? `$${parseFloat(h.newPrice).toFixed(2)}` : "(reset)"}</td>
                                <td className="py-1 pl-2 text-muted-foreground">{h.changedByName || "Unknown"}</td>
                                <td className="py-1 text-right text-muted-foreground">{new Date(h.changedAt).toLocaleDateString("en-AU", { day: "2-digit", month: "short", year: "2-digit", hour: "2-digit", minute: "2-digit" })}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </AccordionContent>
            </AccordionItem>

            {/* ═══ 5. Presentation ═══ */}
            <AccordionItem value="presentation" id="deck-section-presentation" className="border rounded-lg px-4">
              <AccordionTrigger className="text-sm font-medium">Presentation</AccordionTrigger>
              <AccordionContent className="space-y-6">
                <Card>
                  <CardHeader><CardTitle>Quote Summary & PDF</CardTitle></CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <h4 className="font-medium mb-2">Quote Summary</h4>
                        <dl className="space-y-1 text-sm">
                          <div className="flex justify-between gap-2"><dt className="text-muted-foreground shrink-0">Client:</dt><dd className="text-right truncate">{form.clientName}</dd></div>
                          <div className="flex justify-between gap-2"><dt className="text-muted-foreground shrink-0">Deck:</dt><dd className="text-right">{displayWidthM}m × {displayProjM}m ({displayShape})</dd></div>
                          <div className="flex justify-between gap-2"><dt className="text-muted-foreground shrink-0">Area:</dt><dd className="text-right font-semibold">{displayArea.toFixed(2)} m²</dd></div>
                          <div className="flex justify-between gap-2"><dt className="text-muted-foreground shrink-0">Product:</dt><dd className="text-right truncate">{form.deckingBrand} - {form.colour}</dd></div>
                          <div className="flex justify-between gap-2"><dt className="text-muted-foreground shrink-0">Framing:</dt><dd className="text-right">{designPayload?.inputs?.framingSystem === "clickdeck" ? "ClickDeck" : designPayload?.inputs?.framingSystem === "sfs01" ? "Spanline RFB" : "Spanmor"}</dd></div>
                          <div className="flex justify-between gap-2"><dt className="text-muted-foreground shrink-0">Board Dir:</dt><dd className="text-right capitalize">{designPayload?.inputs?.boardLayout?.boardDirection || "parallel"}</dd></div>
                          <div className="flex justify-between gap-2"><dt className="text-muted-foreground shrink-0">Levels:</dt><dd className="text-right">{form.levels || "Single"}</dd></div>
                        </dl>
                      </div>
                      <div>
                        <h4 className="font-medium mb-2">Pricing</h4>
                        <dl className="space-y-1 text-sm">
                          <div className="flex justify-between gap-2"><dt className="text-muted-foreground shrink-0">Total (inc GST):</dt><dd className="text-right font-bold">${fmtNum(form.sellPriceIncGst)}</dd></div>
                          <div className="flex justify-between gap-2"><dt className="text-muted-foreground shrink-0">Deposit:</dt><dd className="text-right">${fmtNum(form.depositAmount)}</dd></div>
                          <div className="flex justify-between gap-2"><dt className="text-muted-foreground shrink-0">Status:</dt><dd className="text-right capitalize">{form.status}</dd></div>
                        </dl>
                      </div>
                    </div>
                    <div className="pt-4 border-t flex gap-2 flex-wrap">
                      <Button variant="outline" onClick={async () => {
                        const validation = validateDeckQuoteForProposal({ ...form, quoteNumber: (quote as any).quoteNumber });
                        if (!validation.valid) {
                          validation.errors.forEach(e => toast.error(e));
                          return;
                        }
                        try {
                          // Temporarily open design section so SVGs are in the DOM
                          const sectionsToOpen = ["design"];
                          const missingOpen = sectionsToOpen.filter(s => !openSections.includes(s));
                          if (missingOpen.length) {
                            setOpenSections(prev => [...prev, ...missingOpen]);
                            await new Promise(r => setTimeout(r, 400));
                          }
                          // Temporarily reveal hidden side view container (hidden on small screens)
                          const sideViewEl = document.querySelector('[data-side-view-svg]');
                          const sideViewContainer = sideViewEl?.closest('div.hidden') as HTMLElement | null;
                          if (sideViewContainer) sideViewContainer.classList.remove('hidden');
                          // Enrich selectedAddons with name/unitPrice/unit from addonItems for PDF
                           const enrichedAddons = ((form as any).selectedAddons || []).map((s: any) => {
                             const matched = addonItems?.find((a: any) => a.id === s.addonItemId);
                             const effectivePrice = s.priceOverride != null ? s.priceOverride : parseFloat(matched?.unitPrice || "0");
                             return { ...s, name: matched?.itemName || "", unitPrice: effectivePrice, unit: matched?.unit || "", notes: s.notes || "" };
                           });
                          const pdfData = adaptDeckQuoteToProposal({ ...form, selectedAddons: enrichedAddons, quoteNumber: (quote as any).quoteNumber }) as any;
                          const schematicImg = await captureDeckSchematic();
                          const subInputs = designPayload?.inputs || buildSubfloorInputs(form);
                          const subResult = calculateSubfloor(subInputs);
                          const opt = subResult.optionA;
                          const boardLayoutImg = await captureBoardLayoutSvg();
                          const sideViewImg = await captureSideViewSvg();
                          // Restore hidden class
                          if (sideViewContainer) sideViewContainer.classList.add('hidden');
                          pdfData.deckDesign = {
                            schematicImageDataUrl: schematicImg,
                            boardLayoutImageDataUrl: boardLayoutImg,
                            framingSystem: subInputs.framingSystem || "spanmor",
                            framingSystemLabel: subInputs.framingSystem === "clickdeck" ? "ClickDeck (Modular)" : subInputs.framingSystem === "sfs01" ? "Spanline RFB (Steel)" : "Spanmor (Aluminium)",
                            option: {
                              label: opt.label,
                              description: opt.description,
                              profileLabel: opt.profile.label,
                              joistCount: opt.joistCount,
                              joistLength: opt.joistLength,
                              joistCentres: opt.joistCentres,
                              bearerCount: opt.bearerCount,
                              bearerLength: opt.bearerLength,
                              postCount: opt.postCount,
                              joistsCost: opt.joistsCost,
                              bearersCost: opt.bearersCost,
                              totalCost: opt.totalCost,
                              labourNote: opt.labourNote,
                              posts: opt.bearerLines.flatMap(bl => bl.posts.map(p => ({ label: p.label, bearer: `B${bl.index + 1}${bl.isWallAttached ? " (wall)" : ""}`, x: p.x, y: p.y }))),
                            },
                            shape: subInputs.shape,
                            lengthMm: subInputs.length,
                            widthMm: subInputs.width,
                            boardLayout: subInputs.boardLayout ? {
                              boardDirection: subInputs.boardLayout.boardDirection || "parallel",
                              boardWidth: subInputs.boardLayout.boardWidth || 138,
                              boardGap: subInputs.boardLayout.boardGap || 5.5,
                              boardLength: subInputs.boardLayout.boardLength || 5400,
                              pictureFrame: subInputs.boardLayout.pictureFrame || "none",
                              breakerBoard: subInputs.boardLayout.breakerBoard || "none",
                              staggerPattern: subInputs.boardLayout.staggerPattern || "random",
                            } : undefined,
                            deckingProduct: form.deckingBrand ? `${form.deckingBrand}` : undefined,
                            deckingColour: (form.colour as string) || undefined,
                            sideViewImageDataUrl: sideViewImg,
                            stairBom: stairResult && form.stairsRequired ? {
                              stairType: stairResult.inputs.stairType,
                              flights: stairResult.inputs.flights,
                              numberOfRisers: stairResult.geometry.numberOfRisers,
                              actualRiser: stairResult.geometry.actualRiser,
                              going: stairResult.geometry.going,
                              stairWidth: stairResult.inputs.stairWidth,
                              stringerCount: stairResult.bom.stringerCount,
                              stringerLengthMm: stairResult.bom.stringerLengthMm,
                              treadBoards: stairResult.bom.treadBoards,
                              treadCutLength: stairResult.bom.treadCutLength,
                              riserBoards: stairResult.bom.riserBoards,
                              riserCutLength: stairResult.bom.riserCutLength,
                              handrailLength: stairResult.bom.handrailLength,
                              balustradePosts: stairResult.bom.balustradePosts,
                              landingBoards: stairResult.bom.landingBoards,
                              treadMaterial: stairResult.inputs.treadMaterial,
                              stringerMaterial: stairResult.inputs.stringerMaterial,
                              riserStyle: stairResult.inputs.riserStyle,
                              handrailStyle: stairResult.inputs.handrailStyle,
                            } : undefined,
                          };
                          const result = await generateProposalPDF(pdfData, "preview");
                          if (result && typeof result === "object" && "blob" in result) {
                            setPdfPreviewBlob(result.blob);
                            setPdfPreviewFilename(result.filename);
                            setPdfPreviewOpen(true);
                          }
                        } catch (err: any) {
                          toast.error(err.message || "Failed to generate PDF");
                        }
                      }}>
                        <Eye className="w-4 h-4 mr-2" />Preview PDF
                      </Button>
                      <Button variant="outline" onClick={async () => {
                        const validation = validateDeckQuoteForProposal({ ...form, quoteNumber: (quote as any).quoteNumber });
                        if (!validation.valid) {
                          validation.errors.forEach(e => toast.error(e));
                          return;
                        }
                        try {
                          // Temporarily open design section so SVGs are in the DOM
                          const sectionsToOpen2 = ["design"];
                          const missingOpen2 = sectionsToOpen2.filter(s => !openSections.includes(s));
                          if (missingOpen2.length) {
                            setOpenSections(prev => [...prev, ...missingOpen2]);
                            await new Promise(r => setTimeout(r, 400));
                          }
                          // Temporarily reveal hidden side view container (hidden on small screens)
                          const sideViewEl2 = document.querySelector('[data-side-view-svg]');
                          const sideViewContainer2 = sideViewEl2?.closest('div.hidden') as HTMLElement | null;
                          if (sideViewContainer2) sideViewContainer2.classList.remove('hidden');
                          // Enrich selectedAddons with name/unitPrice/unit from addonItems for PDF
                           const enrichedAddons2 = ((form as any).selectedAddons || []).map((s: any) => {
                             const matched = addonItems?.find((a: any) => a.id === s.addonItemId);
                             const effectivePrice = s.priceOverride != null ? s.priceOverride : parseFloat(matched?.unitPrice || "0");
                             return { ...s, name: matched?.itemName || "", unitPrice: effectivePrice, unit: matched?.unit || "", notes: s.notes || "" };
                           });
                          const pdfData = adaptDeckQuoteToProposal({ ...form, selectedAddons: enrichedAddons2, quoteNumber: (quote as any).quoteNumber }) as any;
                          const schematicImg = await captureDeckSchematic();
                          const subInputs = designPayload?.inputs || buildSubfloorInputs(form);
                          const subResult = calculateSubfloor(subInputs);
                          const opt = subResult.optionA;
                          const boardLayoutImg2 = await captureBoardLayoutSvg();
                          const sideViewImg2 = await captureSideViewSvg();
                          // Restore hidden class
                          if (sideViewContainer2) sideViewContainer2.classList.add('hidden');
                          pdfData.deckDesign = {
                            schematicImageDataUrl: schematicImg,
                            boardLayoutImageDataUrl: boardLayoutImg2,
                            framingSystem: subInputs.framingSystem || "spanmor",
                            framingSystemLabel: subInputs.framingSystem === "clickdeck" ? "ClickDeck (Modular)" : subInputs.framingSystem === "sfs01" ? "Spanline RFB (Steel)" : "Spanmor (Aluminium)",
                            option: {
                              label: opt.label,
                              description: opt.description,
                              profileLabel: opt.profile.label,
                              joistCount: opt.joistCount,
                              joistLength: opt.joistLength,
                              joistCentres: opt.joistCentres,
                              bearerCount: opt.bearerCount,
                              bearerLength: opt.bearerLength,
                              postCount: opt.postCount,
                              joistsCost: opt.joistsCost,
                              bearersCost: opt.bearersCost,
                              totalCost: opt.totalCost,
                              labourNote: opt.labourNote,
                              posts: opt.bearerLines.flatMap(bl => bl.posts.map(p => ({ label: p.label, bearer: `B${bl.index + 1}${bl.isWallAttached ? " (wall)" : ""}`, x: p.x, y: p.y }))),
                            },
                            shape: subInputs.shape,
                            lengthMm: subInputs.length,
                            widthMm: subInputs.width,
                            boardLayout: subInputs.boardLayout ? {
                              boardDirection: subInputs.boardLayout.boardDirection || "parallel",
                              boardWidth: subInputs.boardLayout.boardWidth || 138,
                              boardGap: subInputs.boardLayout.boardGap || 5.5,
                              boardLength: subInputs.boardLayout.boardLength || 5400,
                              pictureFrame: subInputs.boardLayout.pictureFrame || "none",
                              breakerBoard: subInputs.boardLayout.breakerBoard || "none",
                              staggerPattern: subInputs.boardLayout.staggerPattern || "random",
                            } : undefined,
                            deckingProduct: form.deckingBrand ? `${form.deckingBrand}` : undefined,
                            deckingColour: (form.colour as string) || undefined,
                            sideViewImageDataUrl: sideViewImg2,
                            stairBom: stairResult && form.stairsRequired ? {
                              stairType: stairResult.inputs.stairType,
                              flights: stairResult.inputs.flights,
                              numberOfRisers: stairResult.geometry.numberOfRisers,
                              actualRiser: stairResult.geometry.actualRiser,
                              going: stairResult.geometry.going,
                              stairWidth: stairResult.inputs.stairWidth,
                              stringerCount: stairResult.bom.stringerCount,
                              stringerLengthMm: stairResult.bom.stringerLengthMm,
                              treadBoards: stairResult.bom.treadBoards,
                              treadCutLength: stairResult.bom.treadCutLength,
                              riserBoards: stairResult.bom.riserBoards,
                              riserCutLength: stairResult.bom.riserCutLength,
                              handrailLength: stairResult.bom.handrailLength,
                              balustradePosts: stairResult.bom.balustradePosts,
                              landingBoards: stairResult.bom.landingBoards,
                              treadMaterial: stairResult.inputs.treadMaterial,
                              stringerMaterial: stairResult.inputs.stringerMaterial,
                              riserStyle: stairResult.inputs.riserStyle,
                              handrailStyle: stairResult.inputs.handrailStyle,
                            } : undefined,
                          };
                          await generateProposalPDF(pdfData, "download");
                        } catch (err: any) {
                          toast.error(err.message || "Failed to generate PDF");
                        }
                      }}>
                        <Download className="w-4 h-4 mr-2" />Download PDF
                      </Button>
                      <Button variant="outline" onClick={() => {
                        try {
                          const subInputs = designPayload?.inputs || buildSubfloorInputs(form);
                          const subResult = calculateSubfloor(subInputs, engineeringPricingOverrides);
                          const opt = subResult.optionA;
                          const framingLabel = subInputs.framingSystem === "clickdeck" ? "ClickDeck (Modular)" : subInputs.framingSystem === "sfs01" ? "Spanline RFB (Steel)" : "Spanmor (Aluminium)";
                          // Calculate board cut plan for decking boards section
                          let boardCutPlanData;
                          try { boardCutPlanData = calculateBoardCutPlan(subInputs); } catch { /* optional */ }
                          // Build stair BOM data if stairs are required
                          const stairBomData = stairResult && form.stairsRequired ? {
                            stringerCount: stairResult.bom.stringerCount,
                            stringerLengthMm: stairResult.bom.stringerLengthMm,
                            treadBoards: stairResult.bom.treadBoards,
                            treadCutLength: stairResult.bom.treadCutLength,
                            riserBoards: stairResult.bom.riserBoards,
                            riserCutLength: stairResult.bom.riserCutLength,
                            handrailLength: stairResult.bom.handrailLength,
                            balustradePosts: stairResult.bom.balustradePosts,
                            landingBoards: stairResult.bom.landingBoards,
                            stairWidth: stairResult.inputs.stairWidth,
                            treadMaterial: stairResult.inputs.treadMaterial,
                            stringerMaterial: stairResult.inputs.stringerMaterial,
                            riserStyle: stairResult.inputs.riserStyle,
                            handrailStyle: stairResult.inputs.handrailStyle,
                          } : undefined;
                          const csv = generateDeckBomCsv({
                            inputs: subInputs,
                            option: opt,
                            framingSystemLabel: framingLabel,
                            quoteNumber: (quote as any)?.quoteNumber,
                            clientName: form.clientName as string || undefined,
                            siteAddress: form.siteAddress as string || undefined,
                            boardCutPlan: boardCutPlanData,
                            stairBom: stairBomData,
                          });
                          const filename = `deck-bom-${(quote as any)?.quoteNumber || "export"}.csv`;
                          downloadCsv(csv, filename);
                          toast.success("BOM CSV downloaded");
                        } catch (err: any) {
                          toast.error(err.message || "Failed to export CSV");
                        }
                      }}>
                        <FileText className="w-4 h-4 mr-2" />Export BOM CSV
                      </Button>
                      {isAdmin && (
                        <Button variant="outline" className="border-amber-300 text-amber-700 hover:bg-amber-50" onClick={async () => {
                          try {
                            if (!calcResult && !form.sellPriceIncGst) {
                              toast.error("Run calculation first before generating management report");
                              return;
                            }
                            toast.info("Capturing diagrams...");
                            // Temporarily show side view if hidden
                            const sideViewEl = document.querySelector('[data-side-view-svg]');
                            const sideViewContainer = sideViewEl?.closest('div.hidden') as HTMLElement | null;
                            if (sideViewContainer) sideViewContainer.classList.remove('hidden');
                            // Capture SVGs from the DOM
                            const planViewImg = await captureDeckSchematic();
                            const boardLayoutImg = await captureBoardLayoutSvg();
                            const sideElevationImg = await captureSideViewSvg();
                            // Restore hidden class
                            if (sideViewContainer) sideViewContainer.classList.add('hidden');

                            const subInputs = designPayload?.inputs || buildSubfloorInputs(form);
                            const subResult = calculateSubfloor(subInputs, engineeringPricingOverrides);
                            const boardCutPlan = calculateBoardCutPlan(subInputs);
                            let cuttingResult;
                            try { cuttingResult = calculateOptimisedCutPlan(subInputs); } catch { /* optional */ }
                            const framingLabel = subInputs.framingSystem === "clickdeck" ? "ClickDeck (Modular)" : subInputs.framingSystem === "sfs01" ? "Spanline RFB (Steel)" : "Spanmor (Aluminium)";
                            const widthM = parseFloat(form.deckWidthM as string) || 4;
                            const projM = parseFloat(form.deckProjectionM as string) || 3;
                            const areaM2 = calcResult?.areaM2 || widthM * projM;
                            const perimeterM = calcResult?.perimeterM || 2 * (widthM + projM);

                            const mgmtResult = generateDeckManagementPDF({
                              quoteNumber: (quote as any)?.quoteNumber || "DRAFT",
                              clientName: form.clientName as string || "—",
                              clientPhone: form.clientPhone as string || undefined,
                              clientEmail: form.clientEmail as string || undefined,
                              siteAddress: form.siteAddress as string || undefined,
                              deckWidthM: widthM,
                              deckProjectionM: projM,
                              areaM2,
                              perimeterM,
                              deckShape: (form.deckShape as string) || "Rectangle",
                              productName: (form.deckingBrand as string) || "—",
                              colourName: (form.colour as string) || "—",
                              framingSystem: framingLabel,
                              calcResult: calcResult || {
                                areaM2, perimeterM,
                                deckingMaterialCost: 0, clipFixingCost: 0, wasteCost: 0, framingCost: 0,
                                materialsSubtotal: parseFloat(form.materialsSubtotal as string) || 0,
                                baseLabour: 0, complexityMultiplier: 1, adjustedLabour: parseFloat(form.adjustedLabour as string) || 0,
                                stairsCost: 0, handrailCost: 0, screensCost: 0, lightingCost: 0,
                                demolitionCost: 0, disposalCost: 0, engineeringCost: 0, permitCost: 0,
                                addonsSubtotal: 0, deliveryTotal: parseFloat(form.baseDeliveryFee as string) || 0,
                                hardCostSubtotal: parseFloat(form.hardCostSubtotal as string) || 0,
                                sellPriceExGst: parseFloat(form.sellPriceExGst as string) || 0,
                                commissionAmount: 0,
                                sellPriceWithCommissionExGst: parseFloat(form.sellPriceExGst as string) || 0,
                                gstAmount: parseFloat(form.gstAmount as string) || 0,
                                sellPriceIncGst: parseFloat(form.sellPriceIncGst as string) || 0,
                                depositAmount: parseFloat(form.depositAmount as string) || 0,
                                marginAmount: 0, effectiveMarginPercent: 0,
                              },
                              marginPercent: parseFloat(form.selectedMarginPercent as string) || 35,
                              subfloorResult: subResult,
                              subfloorInputs: subInputs,
                              activeOption: "A",
                              cuttingResult,
                              boardCutPlan,
                              boardDirection: subInputs.boardLayout?.boardDirection || "parallel",
                              pictureFrame: subInputs.boardLayout?.pictureFrame || "none",
                              breakerBoard: subInputs.boardLayout?.breakerBoard || "none",
                              staggerPattern: subInputs.boardLayout?.staggerPattern || "random",
                              planViewImageDataUrl: planViewImg,
                              boardLayoutImageDataUrl: boardLayoutImg,
                              sideElevationImageDataUrl: sideElevationImg,
                              aiRenderImageDataUrl: renderHistory?.find(r => r.isFavourite)?.imageUrl || renderHistory?.[0]?.imageUrl,
                              internalUseOnly: true,
                              previewOnly: true,
                            });
                            if (mgmtResult) {
                              setPdfPreviewBlob(mgmtResult.blob);
                              setPdfPreviewFilename(mgmtResult.filename);
                              setPdfPreviewOpen(true);
                            }
                          } catch (err: any) {
                            toast.error(err.message || "Failed to generate management PDF");
                          }
                        }}>
                          <Shield className="w-4 h-4 mr-2" />Management PDF
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </AccordionContent>
            </AccordionItem>

            {/* ═══ Property Site Plan ═══ */}
            <AccordionItem value="propertysite" id="deck-section-propertysite" className="border rounded-lg px-4">
              <AccordionTrigger className="text-sm font-medium">Property Site Plan</AccordionTrigger>
              <AccordionContent>
                <div className="space-y-4">
                  {/* Fetch Site Data */}
                  <div className="flex items-center gap-3 flex-wrap">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        if (!form.siteAddress) { toast.error("Please enter a site address in Client section first"); return; }
                        setParcelLoading(true);
                        lookupParcelMutation.mutate({ address: form.siteAddress as string });
                      }}
                      disabled={parcelLoading || !form.siteAddress}
                    >
                      <Search className="h-3.5 w-3.5 mr-1.5" />
                      {parcelLoading ? "Fetching..." : "Fetch Site Data"}
                    </Button>
                    {parcelData && (
                      <span className="text-xs text-muted-foreground">
                        Lot {parcelData.lotId} • {parcelData.suburb} • {parcelData.areaSqm?.toFixed(0)} m²
                      </span>
                    )}
                  </div>

                  {/* Setback Inputs */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Front Setback (mm)</Label>
                      <Input type="number" placeholder="e.g. 6000" value={deckSetbacks.front} onChange={(e) => setDeckSetbacks(s => ({ ...s, front: e.target.value }))} className="h-8 text-sm" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Rear Setback (mm)</Label>
                      <Input type="number" placeholder="e.g. 3000" value={deckSetbacks.rear} onChange={(e) => setDeckSetbacks(s => ({ ...s, rear: e.target.value }))} className="h-8 text-sm" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Left Setback (mm)</Label>
                      <Input type="number" placeholder="e.g. 1500" value={deckSetbacks.left} onChange={(e) => setDeckSetbacks(s => ({ ...s, left: e.target.value }))} className="h-8 text-sm" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Right Setback (mm)</Label>
                      <Input type="number" placeholder="e.g. 1500" value={deckSetbacks.right} onChange={(e) => setDeckSetbacks(s => ({ ...s, right: e.target.value }))} className="h-8 text-sm" />
                    </div>
                  </div>

                  {/* SitePlanDiagram (fullscreen overlay when expanded) */}
                  {deckSitePlanExpanded && (
                    <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm flex flex-col p-4 overflow-auto">
                      <SitePlanDiagram
                        boundaryCoords={parcelData?.coordinates}
                        propertyFrontageM={parcelData?.dimensions?.frontageM}
                        propertyDepthM={parcelData?.dimensions?.depthM}
                        propertyAreaSqm={parcelData?.areaSqm}
                        structureWidthMm={parseFloat(form.deckWidthM as string || "0") * 1000 || undefined}
                        structureLengthMm={parseFloat(form.deckProjectionM as string || "0") * 1000 || undefined}
                        setbackFrontMm={deckSetbacks.front ? parseFloat(deckSetbacks.front) : undefined}
                        setbackRearMm={deckSetbacks.rear ? parseFloat(deckSetbacks.rear) : undefined}
                        setbackLeftMm={deckSetbacks.left ? parseFloat(deckSetbacks.left) : undefined}
                        setbackRightMm={deckSetbacks.right ? parseFloat(deckSetbacks.right) : undefined}
                        lotId={parcelData?.lotId}
                        suburb={parcelData?.suburb}
                        centroid={parcelData?.centroid}
                        structureOffsetX={deckStructureOffset.x}
                        structureOffsetY={deckStructureOffset.y}
                        structureRotation={deckStructureRotation}
                        onStructureDrag={(x, y) => setDeckStructureOffset({ x, y })}
                        onStructureRotate={(deg) => setDeckStructureRotation(deg)}
                        draggable={true}
                        expanded={true}
                        onToggleExpand={() => setDeckSitePlanExpanded(false)}
                      />
                    </div>
                  )}

                  <SitePlanDiagram
                    boundaryCoords={parcelData?.coordinates}
                    propertyFrontageM={parcelData?.dimensions?.frontageM}
                    propertyDepthM={parcelData?.dimensions?.depthM}
                    propertyAreaSqm={parcelData?.areaSqm}
                    structureWidthMm={parseFloat(form.deckWidthM as string || "0") * 1000 || undefined}
                    structureLengthMm={parseFloat(form.deckProjectionM as string || "0") * 1000 || undefined}
                    setbackFrontMm={deckSetbacks.front ? parseFloat(deckSetbacks.front) : undefined}
                    setbackRearMm={deckSetbacks.rear ? parseFloat(deckSetbacks.rear) : undefined}
                    setbackLeftMm={deckSetbacks.left ? parseFloat(deckSetbacks.left) : undefined}
                    setbackRightMm={deckSetbacks.right ? parseFloat(deckSetbacks.right) : undefined}
                    lotId={parcelData?.lotId}
                    suburb={parcelData?.suburb}
                    centroid={parcelData?.centroid}
                    structureOffsetX={deckStructureOffset.x}
                    structureOffsetY={deckStructureOffset.y}
                    structureRotation={deckStructureRotation}
                    onStructureDrag={(x, y) => setDeckStructureOffset({ x, y })}
                    onStructureRotate={(deg) => setDeckStructureRotation(deg)}
                    draggable={true}
                    onToggleExpand={() => setDeckSitePlanExpanded(true)}
                  />
                </div>
              </AccordionContent>
            </AccordionItem>

            {/* ═══ 6. AI Render ═══ */}
            <AccordionItem value="airender" id="deck-section-airender" className="border rounded-lg px-4">
              <AccordionTrigger className="text-sm font-medium">AI Render</AccordionTrigger>
              <AccordionContent>
                <QuoteAIRender quoteId={quoteId} quoteType="deck" />
              </AccordionContent>
            </AccordionItem>

            {/* ═══ 7. Notes ═══ */}

            <AccordionItem value="notes" id="deck-section-notes" className="border rounded-lg px-4">
              <AccordionTrigger className="text-sm font-medium">Notes</AccordionTrigger>
              <AccordionContent className="space-y-4">
                <div>
                  <Label>Internal Notes</Label>
                  <Textarea rows={4} value={form.notes || ""} onChange={(e) => updateField("notes", e.target.value)} placeholder="Internal notes about this deck quote..." />
                </div>
                <QuoteNotesSection quoteId={quoteId} quoteType="deck" />
              </AccordionContent>
            </AccordionItem>

            {/* ═══ 7. Communications (conditional) ═══ */}
            {(form as any).clientId && form.clientPhone && (
              <AccordionItem value="comms" id="deck-section-comms" className="border rounded-lg px-4">
                <AccordionTrigger className="text-sm font-medium">Communications</AccordionTrigger>
                <AccordionContent>
                  <CommunicationsTab leadId={(form as any).clientId} leadPhone={form.clientPhone} leadName={form.clientName || "Client"} />
                </AccordionContent>
              </AccordionItem>
            )}
          </Accordion>
        </div>
      </div>

      {/* PDF Preview Modal */}
      <PdfPreviewModal
        open={pdfPreviewOpen}
        onClose={() => { setPdfPreviewOpen(false); setPdfPreviewBlob(null); }}
        blob={pdfPreviewBlob}
        filename={pdfPreviewFilename}
      />
    </div>
  );
}

function SummaryCard({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`p-3 rounded-lg border ${highlight ? "bg-primary/10 border-primary" : "bg-muted/50"}`}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-lg font-semibold ${highlight ? "text-primary" : ""}`}>{value}</p>
    </div>
  );
}

function fmtNum(val: any): string {
  const n = parseFloat(val);
  if (isNaN(n)) return "—";
  return n.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
