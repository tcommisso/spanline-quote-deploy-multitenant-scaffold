import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useNavSwipe } from "@/hooks/useSwipeGesture";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Save, Calculator, Plus, Trash2, ChevronDown, ChevronUp, Ruler, Settings, Palette, StickyNote, FileDown, DollarSign, Sun, Layers, Menu, Copy, MapPin, Search, Maximize2, Minimize2, Sparkles, Wand2, RefreshCw, FileText, AlertTriangle, Eye, ClipboardCheck, Lock, BookmarkPlus, Check } from "lucide-react";
import { isAdminRole } from "@shared/const";
import EclipseSpecSheet, { type EclipseSpecData } from "@/components/eclipse/EclipseSpecSheet";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { toast } from "sonner";
import { type UnitInput, type ProjectResult, type AdditionalCosts, type ValidationError, defaultUnit, defaultAdditionalCosts, totalAdditionalCosts, calculateFootingsCost, calculateBracketCost, additionalCostsToArray, validateAllUnits, COLOURBOND_COLOURS, ECLIPSE_LIMITS } from "../../../shared/eclipseCalculations";
import { generateEclipseQuotePDF, generateEclipseManagementPDF, type ProposalImageData } from "@/lib/eclipsePdfExport";
import ClientPicker from "@/components/ClientPicker";
import AddressAutocomplete from "@/components/AddressAutocomplete";
import RegionSelect from "@/components/RegionSelect";
import CouncilSelect from "@/components/CouncilSelect";
import DesignAdvisorSelect from "@/components/DesignAdvisorSelect";
import { detectRegion } from "@shared/regionDetection";
import { Textarea } from "@/components/ui/textarea";
import EclipseSiteLayout, { type SiteLayoutData, type EclipseSiteLayoutHandle, defaultSiteLayoutData } from "@/components/eclipse/EclipseSiteLayout";
import RoofPlanDiagram from "@/components/RoofPlanDiagram";
import EclipseUnitPlanView from "@/components/eclipse/EclipseUnitPlanView";
import { RakedElevationDiagram, type RakedElevationDiagramHandle } from "@/components/eclipse/RakedElevationDiagram";
import SitePlanDiagram from "@/components/SitePlanDiagram";
import { QuoteAIRender } from "@/components/QuoteAIRender";
import QuoteNotesSection from "@/components/QuoteNotesSection";
import CommunicationsTab from "@/components/CommunicationsTab";
import PdfPreviewModal from "@/components/PdfPreviewModal";

const statusOptions = [
  { value: "draft", label: "Draft", class: "bg-gray-100 text-gray-700" },
  { value: "sent", label: "Sent", class: "bg-blue-100 text-blue-700" },
  { value: "accepted", label: "Accepted", class: "bg-green-100 text-green-700" },
  { value: "lost", label: "Lost", class: "bg-red-100 text-red-600" },
];

const COLOUR_SWATCHES: Record<string, string> = {
  "Basalt": "#646560", "Bluegum": "#6B7D6E", "Classic Cream": "#E8D8A0",
  "Cottage Green": "#3C5744", "Deep Ocean": "#2A4858", "Dover White": "#EFEADB",
  "Dune": "#B5A68C", "Evening Haze": "#C5BCA8", "Gully": "#6B6B5E",
  "Ironstone": "#4B3D36", "Jasper": "#5E4B3B", "Mangrove": "#4A5040",
  "Manor Red": "#6B2D2A", "Monument": "#3E4347", "Night Sky": "#2A2D33",
  "Pale Eucalypt": "#6B8070", "Paperbark": "#C8BDA0", "Shale Grey": "#A8A498",
  "Surfmist": "#D8D4C8", "Wallaby": "#8B8478", "Windspray": "#8C9090",
  "Woodland Grey": "#4C5048",
};

const ECLIPSE_ATTACHMENT_METHODS = ["None", "Fascia brackets", "Gable brackets", "popup brackets", "wall brackets"] as const;

function normaliseEclipseAttachmentMethod(method?: string) {
  if (ECLIPSE_ATTACHMENT_METHODS.includes(method as any)) return method || "None";
  return method && method !== "None" ? "Fascia brackets" : "None";
}

function bracketQuantityFor(unit: UnitInput, method: string) {
  switch (method) {
    case "Fascia brackets": return unit.fasciaBrackets || 0;
    case "Gable brackets": return unit.gableBracketsQty || 0;
    case "popup brackets": return unit.popupBrackets || 0;
    case "wall brackets": return unit.wallFixingBracket || 0;
    default: return 0;
  }
}

function fmt(val: number): string {
  return new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", minimumFractionDigits: 2 }).format(val);
}

// ─── Unit Card Component ─────────────────────────────────────────────────────
function UnitCard({ unitNumber, unit, onChange, onRemove, onDuplicate, sqm, canEditInternalNotes }: {
  unitNumber: number;
  unit: UnitInput;
  onChange: (u: UnitInput) => void;
  onRemove: () => void;
  onDuplicate: () => void;
  sqm: number;
  canEditInternalNotes: boolean;
}) {
  const [isExpanded, setIsExpanded] = useState(true);
  const update = (partial: Partial<UnitInput>) => onChange({ ...unit, ...partial });
  const numChange = (field: keyof UnitInput) => (e: React.ChangeEvent<HTMLInputElement>) => {
    let val = parseFloat(e.target.value) || 0;
    // Lengths above the standard beam length are allowed with an engineering advisory.
    const limits = ECLIPSE_LIMITS[field as keyof typeof ECLIPSE_LIMITS];
    if (limits && field !== "length" && val > limits.max) val = limits.max;
    update({ [field]: val } as any);
  };
  const attachmentMethod = normaliseEclipseAttachmentMethod(unit.attachmentMethod);
  const bracketQuantity = bracketQuantityFor(unit, attachmentMethod);

  function updateAttachmentMethod(value: string) {
    update({
      attachmentMethod: value,
      mountType: value === "None" ? "Freestanding" : "Fascia",
      fasciaBrackets: value === "Fascia brackets" ? unit.fasciaBrackets || 0 : 0,
      extendaBrackets: 0,
      gableBracketsQty: value === "Gable brackets" ? unit.gableBracketsQty || 0 : 0,
      popupBrackets: value === "popup brackets" ? unit.popupBrackets || 0 : 0,
      wallFixingBeam: 0,
      wallFixingBracket: value === "wall brackets" ? unit.wallFixingBracket || 0 : 0,
      bracketCover: value === "None" ? "" : unit.bracketCover,
    } as Partial<UnitInput>);
  }

  function updateBracketQuantity(value: number) {
    const qty = Math.min(20, Math.max(0, value || 0));
    switch (attachmentMethod) {
      case "Fascia brackets":
        update({ fasciaBrackets: qty });
        break;
      case "Gable brackets":
        update({ gableBracketsQty: qty });
        break;
      case "popup brackets":
        update({ popupBrackets: qty });
        break;
      case "wall brackets":
        update({ wallFixingBracket: qty });
        break;
      default:
        update({ fasciaBrackets: 0, gableBracketsQty: 0, popupBrackets: 0, wallFixingBracket: 0 });
    }
  }

  return (
    <Card className="border border-border/60 shadow-sm">
      <CardHeader
        className="cursor-pointer select-none bg-gradient-to-r from-teal-50 to-emerald-50 dark:from-teal-950/20 dark:to-emerald-950/20 py-3 px-5"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-teal-600 flex items-center justify-center text-white font-bold text-sm">
              {unitNumber}
            </div>
            <div>
              <CardTitle className="text-base font-semibold">Unit {unitNumber}</CardTitle>
              {sqm > 0 && <p className="text-xs text-muted-foreground">{sqm.toFixed(2)} m²</p>}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground" title="Duplicate unit" onClick={(e) => { e.stopPropagation(); onDuplicate(); }}>
              <Copy className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={(e) => { e.stopPropagation(); onRemove(); }}>
              <Trash2 className="w-4 h-4" />
            </Button>
            {isExpanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
          </div>
        </div>
      </CardHeader>

      {isExpanded && (
        <CardContent className="pt-4 pb-5 px-5 space-y-5">
          {/* Dimensions */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Ruler className="w-4 h-4 text-teal-600" />
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Dimensions</h3>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="space-y-1">
                <Label className={`text-xs ${unit.bladeWidth > ECLIPSE_LIMITS.bladeWidth.max || (unit.bladeWidth > 0 && unit.bladeWidth < ECLIPSE_LIMITS.bladeWidth.min) ? "text-red-600 font-medium" : "text-muted-foreground"}`}>Blade Width (mm)</Label>
                <Input
                  type="number"
                  value={unit.bladeWidth || ""}
                  onChange={numChange("bladeWidth")}
                  placeholder="e.g. 3000"
                  min={ECLIPSE_LIMITS.bladeWidth.min}
                  max={ECLIPSE_LIMITS.bladeWidth.max}
                  className={`h-8 text-sm ${unit.bladeWidth > ECLIPSE_LIMITS.bladeWidth.max || (unit.bladeWidth > 0 && unit.bladeWidth < ECLIPSE_LIMITS.bladeWidth.min) ? "border-red-500 bg-red-50 text-red-900 focus-visible:ring-red-500" : ""}`}
                />
                {unit.bladeWidth > ECLIPSE_LIMITS.bladeWidth.max && (
                  <p className="text-[10px] text-red-600 font-medium">Max {ECLIPSE_LIMITS.bladeWidth.max}mm</p>
                )}
                {unit.bladeWidth > 0 && unit.bladeWidth < ECLIPSE_LIMITS.bladeWidth.min && (
                  <p className="text-[10px] text-red-600 font-medium">Min {ECLIPSE_LIMITS.bladeWidth.min}mm</p>
                )}
              </div>
              <div className="space-y-1">
                <Label className={`text-xs ${unit.length > 0 && unit.length < ECLIPSE_LIMITS.length.min ? "text-red-600 font-medium" : unit.length > ECLIPSE_LIMITS.length.max ? "text-amber-700 font-medium" : "text-muted-foreground"}`}>Length (mm)</Label>
                <Input
                  type="number"
                  value={unit.length || ""}
                  onChange={numChange("length")}
                  placeholder="e.g. 4000"
                  min={ECLIPSE_LIMITS.length.min}
                  className={`h-8 text-sm ${unit.length > 0 && unit.length < ECLIPSE_LIMITS.length.min ? "border-red-500 bg-red-50 text-red-900 focus-visible:ring-red-500" : unit.length > ECLIPSE_LIMITS.length.max ? "border-amber-500 bg-amber-50 text-amber-900 focus-visible:ring-amber-500" : ""}`}
                />
                {unit.length > ECLIPSE_LIMITS.length.max && (
                  <p className="text-[10px] text-amber-700 font-medium">
                    Engineering review: over standard {ECLIPSE_LIMITS.length.max}mm beam length
                  </p>
                )}
                {unit.length > 0 && unit.length < ECLIPSE_LIMITS.length.min && (
                  <p className="text-[10px] text-red-600 font-medium">Min {ECLIPSE_LIMITS.length.min}mm</p>
                )}
              </div>
              <div className="space-y-1">
                <Label className={`text-xs ${unit.height > ECLIPSE_LIMITS.height.max || (unit.height > 0 && unit.height < ECLIPSE_LIMITS.height.min) ? "text-red-600 font-medium" : "text-muted-foreground"}`}>Height (mm)</Label>
                <Input
                  type="number"
                  value={unit.height || ""}
                  onChange={numChange("height")}
                  placeholder="e.g. 2700"
                  min={ECLIPSE_LIMITS.height.min}
                  max={ECLIPSE_LIMITS.height.max}
                  className={`h-8 text-sm ${unit.height > ECLIPSE_LIMITS.height.max || (unit.height > 0 && unit.height < ECLIPSE_LIMITS.height.min) ? "border-red-500 bg-red-50 text-red-900 focus-visible:ring-red-500" : ""}`}
                />
                {unit.height > ECLIPSE_LIMITS.height.max && (
                  <p className="text-[10px] text-red-600 font-medium">Max {ECLIPSE_LIMITS.height.max}mm</p>
                )}
                {unit.height > 0 && unit.height < ECLIPSE_LIMITS.height.min && (
                  <p className="text-[10px] text-red-600 font-medium">Min {ECLIPSE_LIMITS.height.min}mm</p>
                )}
              </div>
              <div className="space-y-1">
                <Label className={`text-xs ${unit.posts > ECLIPSE_LIMITS.posts.max || (unit.posts > 0 && unit.posts < ECLIPSE_LIMITS.posts.min) ? "text-red-600 font-medium" : "text-muted-foreground"}`}>No. of Posts</Label>
                <Input
                  type="number"
                  value={unit.posts || ""}
                  onChange={numChange("posts")}
                  placeholder="e.g. 4"
                  min={ECLIPSE_LIMITS.posts.min}
                  max={ECLIPSE_LIMITS.posts.max}
                  className={`h-8 text-sm ${unit.posts > ECLIPSE_LIMITS.posts.max || (unit.posts > 0 && unit.posts < ECLIPSE_LIMITS.posts.min) ? "border-red-500 bg-red-50 text-red-900 focus-visible:ring-red-500" : ""}`}
                />
                {unit.posts > ECLIPSE_LIMITS.posts.max && (
                  <p className="text-[10px] text-red-600 font-medium">Max {ECLIPSE_LIMITS.posts.max}</p>
                )}
                {unit.posts > 0 && unit.posts < ECLIPSE_LIMITS.posts.min && (
                  <p className="text-[10px] text-red-600 font-medium">Min {ECLIPSE_LIMITS.posts.min}</p>
                )}
              </div>
            </div>

            {/* Raked Roof Toggle */}
            <div className="flex items-center gap-4 mt-3 pt-3 border-t">
              <div className="flex items-center gap-2">
                <Switch
                  checked={unit.isRaked || false}
                  onCheckedChange={(checked) => update({ isRaked: checked, rakedShortLength: checked ? unit.rakedShortLength || Math.round(unit.length * 0.7) : 0 })}
                />
                <Label className="text-xs font-medium">Raked / Angled Free End</Label>
              </div>
              {unit.isRaked && (
                <div className="flex flex-wrap gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Raked Edge</Label>
                    <select
                      value={unit.rakedEdge || "C-D"}
                      onChange={(e) => update({ rakedEdge: e.target.value })}
                      className="h-8 text-sm w-24 rounded border border-input bg-background px-2"
                    >
                      <option value="A-B">A-B</option>
                      <option value="B-C">B-C</option>
                      <option value="C-D">C-D</option>
                      <option value="D-A">D-A</option>
                    </select>
                    <p className="text-[10px] text-muted-foreground">Tapered free-end edge</p>
                  </div>
                  <div className="space-y-1">
                    <Label className={`text-xs ${unit.rakedShortLength >= unit.length ? "text-red-600 font-medium" : "text-muted-foreground"}`}>Short Side (mm)</Label>
                    <Input
                      type="number"
                      value={unit.rakedShortLength || ""}
                      onChange={(e) => {
                        const v = parseInt(e.target.value) || 0;
                        update({ rakedShortLength: v });
                      }}
                      placeholder="e.g. 3000"
                      min={0}
                      max={unit.length - 1}
                      className={`h-8 text-sm w-28 ${unit.rakedShortLength >= unit.length || unit.rakedShortLength < 0 ? "border-red-500 bg-red-50" : ""}`}
                    />
                    {unit.rakedShortLength >= unit.length && (
                      <p className="text-[10px] text-red-600 font-medium">Must be less than length</p>
                    )}
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Raking Width (mm)</Label>
                    <Input
                      type="number"
                      value={unit.rakedWidth || ""}
                      onChange={(e) => {
                        const v = parseInt(e.target.value) || 0;
                        update({ rakedWidth: v });
                      }}
                      placeholder={`e.g. ${unit.bladeWidth || 3000}`}
                      min={100}
                      max={unit.bladeWidth}
                      className="h-8 text-sm w-28"
                    />
                    <p className="text-[10px] text-muted-foreground">Horizontal span of rake</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Options */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Settings className="w-4 h-4 text-teal-600" />
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Options</h3>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Attachment Method</Label>
                <Select value={attachmentMethod} onValueChange={updateAttachmentMethod}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ECLIPSE_ATTACHMENT_METHODS.map((method) => (
                      <SelectItem key={method} value={method}>{method}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">No. of Lights</Label>
                <Input type="number" value={unit.noOfLights || ""} onChange={numChange("noOfLights")} className="h-8 text-sm" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Downpipes</Label>
                <Input type="number" value={unit.downpipe || ""} onChange={numChange("downpipe")} className="h-8 text-sm" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Install Days</Label>
                <Input type="number" value={unit.installationDays || ""} onChange={numChange("installationDays")} min={2} className="h-8 text-sm" />
              </div>
            </div>
            {/* Attachment & Brackets */}
            <div className="mt-3">
              <Label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1 block">Attachment & Brackets</Label>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Number of Brackets</Label>
                  <Input
                    type="number"
                    min={0}
                    max={20}
                    disabled={attachmentMethod === "None"}
                    value={attachmentMethod === "None" ? "" : bracketQuantity || ""}
                    onChange={(e) => updateBracketQuantity(parseInt(e.target.value) || 0)}
                    placeholder="0"
                    className="h-8 text-sm"
                  />
                </div>
                {attachmentMethod !== "None" && (<>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Bracket Cover</Label>
                    <Select value={unit.bracketCover || ""} onValueChange={(v) => update({ bracketCover: v })}>
                      <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Select" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1 to 5m">1 to 5m</SelectItem>
                        <SelectItem value="6 to 10m">6 to 10m</SelectItem>
                        <SelectItem value="11 to 15m">11 to 15m</SelectItem>
                        <SelectItem value="16 to 20m">16 to 20m</SelectItem>
                        <SelectItem value="Other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </>)}
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3">
              {(["rainSensor", "remote", "electrical", "flashing"] as const).map((key) => (
                <div key={key} className="flex items-center justify-between p-2 rounded-md bg-secondary/50">
                  <Label className="text-xs capitalize">{key === "rainSensor" ? "Rain Sensor" : key}</Label>
                  <Switch checked={unit[key] as boolean} onCheckedChange={(v) => update({ [key]: v } as any)} />
                </div>
              ))}
            </div>
          </div>

          <Separator />

          {/* Colours */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Palette className="w-4 h-4 text-teal-600" />
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Colours</h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Blade Colour</Label>
                  <Select value={unit.bladeColour} onValueChange={(v) => update({ bladeColour: v as "White" | "Powder Coated" })}>
                    <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="White">White</SelectItem>
                      <SelectItem value="Powder Coated">Powder Coated</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {unit.bladeColour === "Powder Coated" && (
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Colourbond Blade</Label>
                    <Select value={unit.colourbondBladeColour} onValueChange={(v) => update({ colourbondBladeColour: v })}>
                      <SelectTrigger className="h-8 text-sm">
                        <div className="flex items-center gap-2">
                          <span className="w-3 h-3 rounded-sm border" style={{ backgroundColor: COLOUR_SWATCHES[unit.colourbondBladeColour] || "#888" }} />
                          <SelectValue />
                        </div>
                      </SelectTrigger>
                      <SelectContent className="max-h-56">
                        {COLOURBOND_COLOURS.map((c) => (
                          <SelectItem key={c} value={c}>
                            <div className="flex items-center gap-2">
                              <span className="w-3 h-3 rounded-sm border" style={{ backgroundColor: COLOUR_SWATCHES[c] || "#888" }} />
                              <span>{c}</span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
              <div className="space-y-2">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Structure Colour</Label>
                  <Select value={unit.structureColour} onValueChange={(v) => update({ structureColour: v as "White" | "Powder Coated" })}>
                    <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="White">White</SelectItem>
                      <SelectItem value="Powder Coated">Powder Coated</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {unit.structureColour === "Powder Coated" && (
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Colourbond Structure</Label>
                    <Select value={unit.colourbondStructureColour} onValueChange={(v) => update({ colourbondStructureColour: v })}>
                      <SelectTrigger className="h-8 text-sm">
                        <div className="flex items-center gap-2">
                          <span className="w-3 h-3 rounded-sm border" style={{ backgroundColor: COLOUR_SWATCHES[unit.colourbondStructureColour] || "#888" }} />
                          <SelectValue />
                        </div>
                      </SelectTrigger>
                      <SelectContent className="max-h-56">
                        {COLOURBOND_COLOURS.map((c) => (
                          <SelectItem key={c} value={c}>
                            <div className="flex items-center gap-2">
                              <span className="w-3 h-3 rounded-sm border" style={{ backgroundColor: COLOUR_SWATCHES[c] || "#888" }} />
                              <span>{c}</span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            </div>
          </div>

          <Separator />

          {/* Interactive Roof Plan Diagram */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Layers className="w-4 h-4 text-teal-600" />
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Roof Plan (click sides to mark house walls)</h3>
            </div>
            <div className="flex flex-wrap items-start gap-4">
              <RoofPlanDiagram
                width={String(unit.bladeWidth || "")}
                length={String(unit.length || "")}
                fallDirection={unit.fallDirection || ""}
                houseWalls={(unit.houseWalls || "").split(",").filter(Boolean)}
                onHouseWallsChange={(walls) => update({ houseWalls: walls.join(",") })}
              />
              <div className="space-y-2 min-w-[140px]">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Fall Direction</Label>
                  <Select value={unit.fallDirection || ""} onValueChange={(v) => update({ fallDirection: v })}>
                    <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Select..." /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="A-B">A-B (Top)</SelectItem>
                      <SelectItem value="B-C">B-C (Right)</SelectItem>
                      <SelectItem value="C-D">C-D (Bottom)</SelectItem>
                      <SelectItem value="D-A">D-A (Left)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <p className="text-[10px] text-muted-foreground">Click edges to toggle house walls. Arrow shows fall direction.</p>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Blade Direction</Label>
                <Select value={unit.bladeDirection || "along-width"} onValueChange={(v) => update({ bladeDirection: v })}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Select..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="along-width">Along Width (A-B)</SelectItem>
                    <SelectItem value="along-length">Along Length (A-D)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Motor Position</Label>
                <Select value={unit.motorPosition || "A-B"} onValueChange={(v) => update({ motorPosition: v })}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Select..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="A-B">A-B (Top)</SelectItem>
                    <SelectItem value="B-C">B-C (Right)</SelectItem>
                    <SelectItem value="C-D">C-D (Bottom)</SelectItem>
                    <SelectItem value="D-A">D-A (Left)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Per-Unit Plan View */}
          {unit.bladeWidth > 0 && unit.length > 0 && (
            <div className="mt-3">
              <EclipseUnitPlanView
                bladeWidth={unit.bladeWidth}
                length={unit.length}
                posts={unit.posts}
                mountType={unit.mountType}
                bladeColour={unit.bladeColour}
                structureColour={unit.structureColour}
                colourbondBladeColour={unit.colourbondBladeColour}
                colourbondStructureColour={unit.colourbondStructureColour}
                unitLabel={`Unit ${unitNumber}`}
                fallDirection={unit.fallDirection}
                houseWalls={unit.houseWalls}
                bladeDirection={unit.bladeDirection}
                motorPosition={unit.motorPosition}
                isRaked={unit.isRaked}
                rakedShortLength={unit.rakedShortLength}
                rakedWidth={unit.rakedWidth}
                rakedEdge={unit.rakedEdge}
              />
            </div>
          )}

          {canEditInternalNotes && (
            <>
              <Separator />
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <StickyNote className="w-4 h-4 text-teal-600" />
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Notes</h3>
                </div>
                <textarea
                  value={unit.notes}
                  onChange={(e) => update({ notes: e.target.value })}
                  placeholder="e.g. Corner installation, requires crane access"
                  rows={2}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-y"
                />
              </div>
            </>
          )}
        </CardContent>
      )}
    </Card>
  );
}

// ─── Material Breakdown Component ────────────────────────────────────────────
function MaterialBreakdown({ unitNumber, result }: { unitNumber: number; result: any }) {
  const [expanded, setExpanded] = useState(false);
  if (!result) return null;

  return (
    <Card className="border border-border/60">
      <CardHeader className="py-3 px-4 cursor-pointer" onClick={() => setExpanded(!expanded)}>
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium">Unit {unitNumber} — {fmt(result.rrpIncGST)} inc GST</CardTitle>
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </div>
      </CardHeader>
      {expanded && (
        <CardContent className="px-4 pb-4">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th className="text-left py-1 pr-2">Code</th>
                  <th className="text-left py-1 pr-2">Description</th>
                  <th className="text-right py-1 pr-2">Qty</th>
                  <th className="text-right py-1 pr-2">Unit $</th>
                  <th className="text-right py-1 pr-2">Disc %</th>
                  <th className="text-right py-1">Total</th>
                </tr>
              </thead>
              <tbody>
                {result.materials.map((m: any, i: number) => (
                  <tr key={i} className="border-b border-border/30">
                    <td className="py-1 pr-2 font-mono text-muted-foreground">{m.code || "—"}</td>
                    <td className="py-1 pr-2">{m.description}</td>
                    <td className="py-1 pr-2 text-right font-mono">{m.qty}</td>
                    <td className="py-1 pr-2 text-right font-mono">{fmt(m.unitPrice)}</td>
                    <td className="py-1 pr-2 text-right font-mono">{m.discount}%</td>
                    <td className="py-1 text-right font-mono font-medium">{fmt(m.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
            <div className="bg-secondary/50 rounded p-2">
              <p className="text-muted-foreground">Material Cost</p>
              <p className="font-medium">{fmt(result.materialCost)}</p>
            </div>
            <div className="bg-secondary/50 rounded p-2">
              <p className="text-muted-foreground">Labour</p>
              <p className="font-medium">{fmt(result.labourCost)}</p>
            </div>
            <div className="bg-secondary/50 rounded p-2">
              <p className="text-muted-foreground">Sell ex GST</p>
              <p className="font-medium">{fmt(result.sellPriceExGST)}</p>
            </div>
            <div className="bg-teal-50 dark:bg-teal-950/30 rounded p-2">
              <p className="text-muted-foreground">RRP inc GST</p>
              <p className="font-bold text-teal-700 dark:text-teal-400">{fmt(result.rrpIncGST)}</p>
            </div>
          </div>
        </CardContent>
      )}
    </Card>
  );
}

// ─── Additional Costs Tab ────────────────────────────────────────────────────
function AdditionalCostsSection({ costs, onChange, roofRRP, totalPosts, bracketCost = 0, councilFeeOptions = [], homeWarrantyTiers = [], region = "" }: {
  costs: AdditionalCosts;
  onChange: (c: AdditionalCosts) => void;
  roofRRP: number;
  totalPosts: number;
  bracketCost?: number;
  councilFeeOptions?: { key: string; value: string }[];
  homeWarrantyTiers?: { threshold: number; amount: number }[];
  region?: string;
}) {
  const addTotal = totalAdditionalCosts(costs);
  // Bracket costs are now included in roofRRP (per-unit material line in calculation engine)
  const grandTotal = roofRRP + addTotal;

  // Suggested home warranty based on grand total
  const suggestedWarranty = useMemo(() => {
    if (homeWarrantyTiers.length === 0) return 0;
    const total = roofRRP + addTotal;
    let amount = 0;
    for (const tier of homeWarrantyTiers) {
      if (total >= tier.threshold) amount = tier.amount;
    }
    return amount;
  }, [homeWarrantyTiers, roofRRP, addTotal]);

  // Lump-sum items (excluding footings which has special logic)
  const lumpSumItems: { key: keyof AdditionalCosts; label: string }[] = [
    { key: "attachmentToHouse", label: "Attachment to House" },
    { key: "travel", label: "Travel" },
    { key: "siteClean", label: "Site Clean" },
    { key: "demolition", label: "Demolition" },
    { key: "plumbing", label: "Plumbing" },
    { key: "approvals", label: "Approvals" },
    { key: "concrete", label: "Concrete" },
    { key: "gableBrackets", label: "Gable Brackets" },
    { key: "electrical", label: "Electrical" },
  ];

  return (
    <div className="space-y-4">
      {/* Footings: auto-calculated from posts × rate */}
      <div className="p-3 rounded-md border border-border/50 bg-muted/30 space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-xs font-medium">Footings ({totalPosts} posts)</Label>
          <span className="text-sm font-bold">{fmt(costs.footings)}</span>
        </div>
        <div className="flex items-center gap-2">
          <Label className="text-xs text-muted-foreground whitespace-nowrap">Rate per post</Label>
          <div className="relative flex-1 max-w-[140px]">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">$</span>
            <Input
              type="number"
              value={costs.footingRate || ""}
              onChange={(e) => {
                const rate = parseFloat(e.target.value) || 0;
                const footings = calculateFootingsCost(totalPosts, rate);
                onChange({ ...costs, footingRate: rate, footings });
              }}
              className="pl-7 h-7 text-sm"
              placeholder="0.00"
            />
          </div>
          <span className="text-xs text-muted-foreground">× {totalPosts} = {fmt(costs.footings)}</span>
        </div>
      </div>

      {/* Lump-sum cost items */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {lumpSumItems.map(({ key, label }) => (
          <div key={key} className="space-y-1">
            <Label className="text-xs text-muted-foreground">{label}</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">$</span>
              <Input
                type="number"
                value={(costs[key] as number) || ""}
                onChange={(e) => onChange({ ...costs, [key]: parseFloat(e.target.value) || 0 })}
                className="pl-7 h-8 text-sm"
                placeholder="0.00"
              />
            </div>
          </div>
        ))}
      </div>

      {/* Council Fees - dropdown from pricing settings */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Council Fees</Label>
          {councilFeeOptions.length > 0 ? (
            <select
              value={costs.councilFees.toString()}
              onChange={(e) => onChange({ ...costs, councilFees: parseFloat(e.target.value) || 0 })}
              className="flex h-8 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <option value="0">None</option>
              {councilFeeOptions.map((cf) => (
                <option key={cf.key} value={cf.value}>{cf.key} - ${parseFloat(cf.value).toLocaleString()}</option>
              ))}
            </select>
          ) : (
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">$</span>
              <Input
                type="number"
                value={costs.councilFees || ""}
                onChange={(e) => onChange({ ...costs, councilFees: parseFloat(e.target.value) || 0 })}
                className="pl-7 h-8 text-sm"
                placeholder="0.00"
              />
            </div>
          )}
        </div>
        {region !== "ACT" && (
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Home Warranty (HOW)</Label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">$</span>
            <Input
              type="number"
              value={costs.homeWarranty || ""}
              onChange={(e) => onChange({ ...costs, homeWarranty: parseFloat(e.target.value) || 0 })}
              className="pl-7 h-8 text-sm"
              placeholder="0.00"
            />
          </div>
          {suggestedWarranty > 0 && costs.homeWarranty !== suggestedWarranty && (
            <button
              type="button"
              onClick={() => onChange({ ...costs, homeWarranty: suggestedWarranty })}
              className="text-[10px] text-blue-600 hover:underline cursor-pointer"
            >
              Suggested: ${suggestedWarranty.toLocaleString()} (click to apply)
            </button>
          )}
        </div>
        )}
      </div>

      {/* Other (with description) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Other Description</Label>
          <Input
            value={costs.otherDescription || ""}
            onChange={(e) => onChange({ ...costs, otherDescription: e.target.value })}
            className="h-8 text-sm"
            placeholder="e.g. Crane hire"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Other Amount</Label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">$</span>
            <Input
              type="number"
              value={costs.other || ""}
              onChange={(e) => onChange({ ...costs, other: parseFloat(e.target.value) || 0 })}
              className="pl-7 h-8 text-sm"
              placeholder="0.00"
            />
          </div>
        </div>
      </div>

      {/* Summary totals */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 mt-4">
        <Card className="p-3 text-center">
          <p className="text-xs text-muted-foreground">Roof System RRP</p>
          <p className="text-sm font-bold">{fmt(roofRRP)}</p>
        </Card>
        {bracketCost > 0 && (
          <Card className="p-3 text-center">
            <p className="text-xs text-muted-foreground">Brackets (in RRP)</p>
            <p className="text-sm font-bold text-muted-foreground">{fmt(bracketCost)}</p>
          </Card>
        )}
        <Card className="p-3 text-center">
          <p className="text-xs text-muted-foreground">Additional Costs</p>
          <p className="text-sm font-bold">{fmt(addTotal)}</p>
        </Card>
        <Card className="p-3 text-center bg-teal-50 dark:bg-teal-950/30">
          <p className="text-xs text-muted-foreground">Grand Total</p>
          <p className="text-lg font-bold text-teal-700 dark:text-teal-400">{fmt(grandTotal)}</p>
        </Card>
      </div>
    </div>
  );
}

// ─── Helper: Load proposal images as base64 for PDF embedding ───────────────
async function loadProposalImagesForPdf(images: { name: string; description: string | null; imageUrl: string }[]): Promise<ProposalImageData[]> {
  const results: ProposalImageData[] = [];
  for (const img of images) {
    try {
      let dataUrl: string | null = null;
      // Try fetch first (works for same-origin / CORS-enabled URLs)
      try {
        const resp = await fetch(img.imageUrl, { mode: "cors" });
        if (resp.ok) {
          const blob = await resp.blob();
          // Force correct MIME type based on file extension (CloudFront may return application/octet-stream)
          const ext = img.imageUrl.split(".").pop()?.toLowerCase() || "png";
          const mimeType = ext === "jpg" || ext === "jpeg" ? "image/jpeg" : "image/png";
          const correctBlob = blob.type.startsWith("image/") ? blob : new Blob([blob], { type: mimeType });
          dataUrl = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.readAsDataURL(correctBlob);
          });
        }
      } catch {
        // fetch failed (likely CORS), try canvas approach
      }
      // Fallback: load via Image element + canvas (handles cross-origin with anonymous)
      if (!dataUrl) {
        dataUrl = await new Promise<string | null>((resolve) => {
          const imgEl = new Image();
          imgEl.crossOrigin = "anonymous";
          imgEl.onload = () => {
            try {
              const canvas = document.createElement("canvas");
              canvas.width = imgEl.naturalWidth;
              canvas.height = imgEl.naturalHeight;
              const ctx = canvas.getContext("2d")!;
              ctx.drawImage(imgEl, 0, 0);
              resolve(canvas.toDataURL("image/png"));
            } catch {
              resolve(null);
            }
          };
          imgEl.onerror = () => resolve(null);
          imgEl.src = img.imageUrl;
        });
      }
      if (dataUrl) {
        results.push({ name: img.name, description: img.description || "", imageUrl: dataUrl });
      }
    } catch {
      // Skip images that fail to load
    }
  }
  return results;
}

// ─── Main Editor ─────────────────────────────────────────────────────────────
export default function EclipseQuoteEditor({ id }: { id: number }) {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const isAdmin = isAdminRole(user?.role || "");
  const utils = trpc.useUtils();

  const { data: quote, isLoading } = trpc.eclipseRoof.quotes.get.useQuery({ id });
  // Auto-save state
  const [autoSaveStatus, setAutoSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isAutoSaveRef = useRef(false);
  const initialLoadRef = useRef(true);
  const triggerAutoRecalcRef = useRef(false);

  const updateMutation = trpc.eclipseRoof.quotes.update.useMutation({
    onSuccess: () => {
      if (isAutoSaveRef.current) {
        setAutoSaveStatus("saved");
        setTimeout(() => setAutoSaveStatus("idle"), 3000);
        // Auto-recalculate after auto-save to keep pricing current
        triggerAutoRecalcRef.current = true;
      } else {
        toast.success("Eclipse quote saved");
      }
      isAutoSaveRef.current = false;
      utils.eclipseRoof.quotes.get.invalidate({ id });
      utils.eclipseRoof.quotes.list.invalidate();
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
  const calculateMutation = trpc.eclipseRoof.calculate.useMutation();

  // Fetch master data pricing (commission & margin)
  const { data: pricingData } = trpc.eclipseRoof.pricing.getAll.useQuery();
  // Fetch master data for council fees and home warranty
  const { data: allMasterData } = trpc.masterData.getAll.useQuery();
  const councilFeeOptions = useMemo(() => {
    if (!allMasterData) return [];
    return allMasterData.filter(d => d.category === "council_fee").map(d => ({ key: d.key, value: d.value }));
  }, [allMasterData]);
  const homeWarrantyTiers = useMemo(() => {
    if (!allMasterData) return [];
    return allMasterData.filter(d => d.category === "home_warranty").sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)).map(d => ({ threshold: parseFloat(d.key) || 0, amount: parseFloat(d.value) || 0 }));
  }, [allMasterData]);
  const priceSettings = useMemo(() => {
    if (!allMasterData) return { deliveryRatePerKm: "0", deliveryFactorTiers: [] as { minValue: number; factor: number }[], travelBands: [] as { key: string; value: string }[], smallJob: [] as { key: string; value: string }[], smallJobThreshold: "0", constructionMgmtRates: [] as { key: string; value: string }[] };
    const deliveryRatePerKm = allMasterData.find(d => d.category === "delivery" && d.key === "rate_per_km")?.value || "0";
    const deliveryFactorTiers = allMasterData.filter(d => d.category === "delivery_factor_tier").sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)).map(d => ({ minValue: parseFloat(d.key) || 0, factor: parseFloat(d.value) || 1 }));
    const travelBands = allMasterData.filter(d => d.category === "travel_band").sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)).map(d => ({ key: d.key, value: d.value }));
    const smallJob = allMasterData.filter(d => d.category === "small_job_surcharge" && d.key !== "threshold").sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)).map(d => ({ key: d.key, value: d.value }));
    const smallJobThreshold = allMasterData.find(d => d.category === "small_job_surcharge" && d.key === "threshold")?.value || "0";
    const constructionMgmtRates = allMasterData.filter(d => d.category === "construction_mgmt_rate").sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)).map(d => ({ key: d.key, value: d.value }));
    return { deliveryRatePerKm, deliveryFactorTiers, travelBands, smallJob, smallJobThreshold, constructionMgmtRates };
  }, [allMasterData]);
  const commissionRate = useMemo(() => ((pricingData?.prices?.commissionRate ?? 10) / 100), [pricingData]);
  const margin = useMemo(() => ((pricingData?.prices?.margin ?? 38) / 100), [pricingData]);

  // Fetch enabled Eclipse proposal images for PDF appendix
  const { data: proposalImages = [] } = trpc.planConverter.listProductImages.useQuery({ category: "Eclipse Proposal" });
  const enabledProposalImages = useMemo(
    () => proposalImages.filter((img: any) => !(img.tags || []).includes("disabled")),
    [proposalImages]
  );

  // AI Description generation
  const genDescMutation = trpc.eclipseRoof.generateDescription.useMutation({
    onSuccess: (data: any) => {
      if (data.description) {
        setDescriptionOfWork(data.description);
        toast.success("Description generated by AI");
        setShowRefinement(false);
        setRefinementInstruction("");
      }
    },
    onError: (err: any) => toast.error(err.message),
  });

  // DOW groups and items for template picker
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);
  const { data: dowGroups } = trpc.assistant.listDowGroups.useQuery();
  const { data: dowItems } = trpc.assistant.listDowItems.useQuery(undefined, { enabled: showTemplatePicker });

  // Save to master library mutation
  const saveToLibraryMutation = trpc.assistant.saveDescriptionToLibrary.useMutation({
    onSuccess: () => {
      toast.success("Description saved to master library");
      setSaveToLibraryGroup("");
      setShowSaveToLibrary(false);
    },
    onError: (err: any) => toast.error(err.message),
  });

  // Local state
  const [clientId, setClientId] = useState<number | null>(null);
  const [clientName, setClientName] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [clientAddress, setClientAddress] = useState("");
  const [status, setStatus] = useState("draft");

  const [units, setUnits] = useState<UnitInput[]>([defaultUnit()]);
  const [additionalCosts, setAdditionalCosts] = useState<AdditionalCosts>(defaultAdditionalCosts());
  // Adjustment fields (same pattern as OPQ/Deck)
  const [adjDelivery, setAdjDelivery] = useState("0");
  const [adjDeliveryOverride, setAdjDeliveryOverride] = useState(false);
  const [adjTravel, setAdjTravel] = useState("0");
  const [adjTravelDistanceKm, setAdjTravelDistanceKm] = useState("");
  const [adjTravelBranchName, setAdjTravelBranchName] = useState("");
  const [adjTravelBandKey, setAdjTravelBandKey] = useState("");
  const [adjTravelOverridden, setAdjTravelOverridden] = useState(false);
  const [adjSmallJob, setAdjSmallJob] = useState("0");
  const [adjConstructionMgmt, setAdjConstructionMgmt] = useState("0");
  const [adjConstructionMgmtOverride, setAdjConstructionMgmtOverride] = useState(false);
  const [adjComplexity, setAdjComplexity] = useState("0");
  const [adjComplexityOverride, setAdjComplexityOverride] = useState(false);
  const [notes, setNotes] = useState("");
  const [region, setRegion] = useState("");
  const [localCouncil, setLocalCouncil] = useState("");
  const [designAdvisor, setDesignAdvisor] = useState("");
  const [descriptionOfWork, setDescriptionOfWork] = useState("");
  const [specData, setSpecData] = useState<EclipseSpecData>({});
  const [showRefinement, setShowRefinement] = useState(false);
  const [refinementInstruction, setRefinementInstruction] = useState("");
  const [templateFilterGroup, setTemplateFilterGroup] = useState<string>("all");
  const [templateSearchQuery, setTemplateSearchQuery] = useState("");
  const [showSaveToLibrary, setShowSaveToLibrary] = useState(false);
  const [saveToLibraryGroup, setSaveToLibraryGroup] = useState("");
  const [calcResult, setCalcResult] = useState<ProjectResult | null>(null);
  const [activeSection, setActiveSection] = useState("units");
  const [openSections, setOpenSections] = useState<string[]>(["units"]);
  const [showWarnings, setShowWarnings] = useState(true);
  const [dismissAdvisory, setDismissAdvisory] = useState(() => {
    try { return localStorage.getItem("eclipse_dismiss_advisory") === "true"; } catch { return false; }
  });
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [pdfPreviewOpen, setPdfPreviewOpen] = useState(false);
  const [pdfPreviewBlob, setPdfPreviewBlob] = useState<Blob | null>(null);
  const [pdfPreviewFilename, setPdfPreviewFilename] = useState("");
  const [siteLayout, setSiteLayout] = useState<SiteLayoutData>(defaultSiteLayoutData(1));
  const siteLayoutRef = useRef<EclipseSiteLayoutHandle>(null);
  const rakedElevRefs = useRef<(RakedElevationDiagramHandle | null)[]>([]);
  // Property site plan state
  const [parcelData, setParcelData] = useState<any>(null);
  const [structureOffset, setStructureOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [structureRotation, setStructureRotation] = useState(0);
  const [setbacks, setSetbacks] = useState<{ front: string; rear: string; left: string; right: string }>({ front: "", rear: "", left: "", right: "" });
  const [sitePlanExpanded, setSitePlanExpanded] = useState(false);
  const [parcelLoading, setParcelLoading] = useState(false);
  const lookupParcelMutation = trpc.quotes.lookupParcel.useMutation({
    onSuccess: (data) => {
      setParcelData(data);
      toast.success(`Property boundary found: ${data.lotId} (${data.source === "actmapi" ? "ACTmapi" : "NSW Cadastre"})`);
    },
    onError: (err: any) => toast.error(err.message),
    onSettled: () => setParcelLoading(false),
  });

  // Checklist pricing (same pattern as OPQ spec sheet)
  type ChecklistSelection = { itemId: number; label: string; unitPrice: number; qty: number; total: number; section: string; unit: string };
  const [checklistSelections, setChecklistSelections] = useState<ChecklistSelection[]>([]);
  const { data: activeChecklistItems } = trpc.checklistItems.listActive.useQuery();

  // Swipe gesture: swipe right from left edge to open mobile nav
  useNavSwipe(mobileNavOpen, setMobileNavOpen);

  // Hydrate from server
  useEffect(() => {
    if (!quote) return;
    setClientId((quote as any).clientId || null);
    setClientName(quote.clientName || "");
    setClientPhone(quote.clientPhone || "");
    setClientEmail(quote.clientEmail || "");
    setClientAddress(quote.clientAddress || "");
    setStatus(quote.status || "draft");

    setNotes(quote.notes || "");
    setRegion((quote as any).region || "");
    setLocalCouncil((quote as any).localCouncil || "");
    setDesignAdvisor((quote as any).designAdvisor || "");
    setDescriptionOfWork((quote as any).descriptionOfWork || "");
    setSpecData(((quote as any).specData as EclipseSpecData) || {});
    setAdditionalCosts({
      footings: parseFloat(quote.footings as any) || 0,
      footingRate: parseFloat((quote as any).footingRate as any) || 0,
      attachmentToHouse: parseFloat((quote as any).attachmentToHouse as any) || 0,
      travel: parseFloat((quote as any).travel as any) || 0,
      siteClean: parseFloat((quote as any).siteClean as any) || parseFloat(quote.constructionCleaning as any) || 0,
      demolition: parseFloat((quote as any).demolition as any) || 0,
      plumbing: parseFloat((quote as any).plumbing as any) || 0,
      approvals: parseFloat(quote.approvals as any) || 0,
      concrete: parseFloat((quote as any).concrete as any) || 0,
      gableBrackets: parseFloat(quote.gableBrackets as any) || 0,
      electrical: parseFloat((quote as any).electrical as any) || 0,
      councilFees: parseFloat((quote as any).councilFees as any) || 0,
      homeWarranty: parseFloat((quote as any).homeWarranty as any) || 0,
      other: parseFloat((quote as any).otherCost as any) || 0,
      otherDescription: (quote as any).otherCostDescription || "",
    });
    // Hydrate adjustment fields
    setAdjDelivery((quote as any).deliveryAmount || "0");
    setAdjDeliveryOverride((quote as any).deliveryOverride || false);
    setAdjTravel((quote as any).travelAllowanceAmount || "0");
    setAdjTravelDistanceKm((quote as any).travelDistanceKm || "");
    setAdjTravelBranchName((quote as any).travelBranchName || "");
    setAdjTravelBandKey((quote as any).travelBandKey || "");
    setAdjTravelOverridden((quote as any).travelOverridden || false);
    setAdjSmallJob((quote as any).smallJobSurcharge || "0");
    setAdjConstructionMgmt((quote as any).constructionMgmtPercent || "0");
    setAdjConstructionMgmtOverride((quote as any).constructionMgmtOverride || false);
    setAdjComplexity((quote as any).complexityLoadingPercent || "0");
    setAdjComplexityOverride((quote as any).complexityOverride || false);
    // Parse units from JSON
    try {
      const parsed = typeof quote.units === "string" ? JSON.parse(quote.units) : quote.units;
      if (Array.isArray(parsed) && parsed.length > 0) {
        setUnits(parsed);
      } else {
        setUnits([defaultUnit()]);
      }
    } catch {
      setUnits([defaultUnit()]);
    }
    // Parse site layout and property site plan from sitePlanData JSON
    try {
      const spd = quote.sitePlanData as any;
      if (spd && spd.siteLayout) {
        setSiteLayout(spd.siteLayout);
      }
      if (spd && spd.parcelData) {
        setParcelData(spd.parcelData);
      }
      if (spd && spd.structureOffsetX != null) {
        setStructureOffset({ x: spd.structureOffsetX || 0, y: spd.structureOffsetY || 0 });
      }
      if (spd && spd.structureRotation != null) {
        setStructureRotation(spd.structureRotation || 0);
      }
      if (spd && spd.setbacks) {
        setSetbacks(spd.setbacks);
      }
    } catch { /* ignore */ }
    // Load checklist selections
    try {
      const cs = (quote as any).checklistSelections;
      if (cs) {
        const parsed = typeof cs === "string" ? JSON.parse(cs) : cs;
        if (Array.isArray(parsed)) setChecklistSelections(parsed);
      }
    } catch { /* ignore */ }
  }, [quote]);

  const handleSave = useCallback(() => {
    updateMutation.mutate({
      id,
      clientId,
      clientName,
      clientPhone,
      clientEmail,
      clientAddress,
      status: status as any,

      units,
      footings: additionalCosts.footings.toString(),
      footingRate: additionalCosts.footingRate.toString(),
      approvals: additionalCosts.approvals.toString(),
      projectManagement: "0", // deprecated
      gableBrackets: additionalCosts.gableBrackets.toString(),
      constructionCleaning: "0", // deprecated - use siteClean
      attachmentToHouse: additionalCosts.attachmentToHouse.toString(),
      travel: additionalCosts.travel.toString(),
      siteClean: additionalCosts.siteClean.toString(),
      demolition: additionalCosts.demolition.toString(),
      plumbing: additionalCosts.plumbing.toString(),
      concrete: additionalCosts.concrete.toString(),
      electrical: additionalCosts.electrical.toString(),
      otherCost: additionalCosts.other.toString(),
      otherCostDescription: additionalCosts.otherDescription,
      councilFees: additionalCosts.councilFees.toString(),
      homeWarranty: additionalCosts.homeWarranty.toString(),
      // Adjustment fields
      deliveryAmount: adjDelivery,
      deliveryOverride: adjDeliveryOverride,
      travelAllowanceAmount: adjTravel,
      travelDistanceKm: adjTravelDistanceKm || undefined,
      travelBranchName: adjTravelBranchName || undefined,
      travelBandKey: adjTravelBandKey || undefined,
      travelOverridden: adjTravelOverridden,
      smallJobSurcharge: adjSmallJob,
      constructionMgmtPercent: adjConstructionMgmt,
      constructionMgmtOverride: adjConstructionMgmtOverride,
      complexityLoadingPercent: adjComplexity,
      complexityOverride: adjComplexityOverride,
      notes,
      designAdvisor,
      region,
      localCouncil,
      descriptionOfWork,
      specData: specData && Object.keys(specData).length > 0 ? specData : null,
      // Persist site layout + property site plan in sitePlanData JSON
      sitePlanData: JSON.stringify({
        siteLayout,
        parcelData: parcelData || undefined,
        structureOffsetX: structureOffset.x,
        structureOffsetY: structureOffset.y,
        structureRotation,
        setbacks,
      }),
      // Include calculated totals if available
      ...(calcResult ? {
        totalSqm: calcResult.totalSqm.toFixed(2),
        totalSellPriceEx: calcResult.totalSellPriceEx.toFixed(2),
        totalGST: calcResult.totalGST.toFixed(2),
        totalRRPInc: calcResult.totalRRPInc.toFixed(2),
        rrpPerSqm: calcResult.rrpPerSqm.toFixed(2),
      } : {}),
      checklistSelections: checklistSelections.length > 0 ? checklistSelections : null,
    });
  }, [id, clientId, clientName, clientPhone, clientEmail, clientAddress, status, units, additionalCosts, adjDelivery, adjDeliveryOverride, adjTravel, adjTravelDistanceKm, adjTravelBranchName, adjTravelBandKey, adjTravelOverridden, adjSmallJob, adjConstructionMgmt, adjConstructionMgmtOverride, adjComplexity, adjComplexityOverride, notes, designAdvisor, region, localCouncil, descriptionOfWork, specData, calcResult, siteLayout, parcelData, structureOffset, structureRotation, setbacks, checklistSelections, updateMutation]);

  // ─── Auto-save with 1.5s debounce ─────────────────────────────────────────
  useEffect(() => {
    // Skip auto-save on initial data load from server
    if (initialLoadRef.current) {
      initialLoadRef.current = false;
      return;
    }
    // Don't auto-save if there are validation errors
    if (hasErrors) return;

    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(() => {
      setAutoSaveStatus("saving");
      isAutoSaveRef.current = true;
      handleSave();
    }, 9000);

    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, clientName, clientPhone, clientEmail, clientAddress, status, units, additionalCosts, notes, designAdvisor, region, localCouncil, descriptionOfWork, specData, siteLayout, parcelData, structureOffset, structureRotation, setbacks, checklistSelections]);

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

  const handleCalculate = useCallback(() => {
    calculateMutation.mutate(
      { units, commissionRate, margin, positions: siteLayout.positions.length >= units.length ? siteLayout.positions : undefined },
      {
        onSuccess: (result) => {
          setCalcResult(result as any);
          // Silenced: recalc results visible in summary cards
          triggerAutoRecalcRef.current = false;
        },
        onError: (err) => { triggerAutoRecalcRef.current = false; toast.error(err.message); },
      }
    );
  }, [units, commissionRate, margin, siteLayout.positions, calculateMutation]);

  // Auto-recalculate after auto-save completes (silently)
  useEffect(() => {
    if (triggerAutoRecalcRef.current && !calculateMutation.isPending && !hasErrors && units.some(u => u.bladeWidth > 0 && u.length > 0)) {
      triggerAutoRecalcRef.current = false;
      calculateMutation.mutate(
        { units, commissionRate, margin, positions: siteLayout.positions.length >= units.length ? siteLayout.positions : undefined },
        {
          onSuccess: (result) => setCalcResult(result as any),
          onError: () => { /* silent */ },
        }
      );
    }
  });

  // ─── Engineering Validation ─────────────────────────────────────────────────
  const validationErrors = useMemo(() => validateAllUnits(units), [units]);
  const hasErrors = validationErrors.some(e => e.severity === "error");

  // ─── Overall structure footprint for Property Site Plan ──────────────────────
  const overallFootprint = useMemo(() => {
    if (units.length === 0) return { width: 0, length: 0 };
    if (units.length === 1) return { width: units[0].bladeWidth, length: units[0].length };
    // Multi-unit: compute bounding box from positions
    const positions = siteLayout.positions;
    if (!positions || positions.length < units.length) {
      // Fallback: sum widths (side-by-side assumption)
      const totalWidth = units.reduce((s, u) => s + u.bladeWidth, 0);
      const maxLength = Math.max(...units.map(u => u.length));
      return { width: totalWidth, length: maxLength };
    }
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    units.forEach((u, i) => {
      const p = positions[i];
      const isRotated = p.rotation === 90 || p.rotation === 270;
      const w = isRotated ? u.length : u.bladeWidth;
      const h = isRotated ? u.bladeWidth : u.length;
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x + w);
      minY = Math.min(minY, p.y);
      maxY = Math.max(maxY, p.y + h);
    });
    return { width: maxX - minX, length: maxY - minY };
  }, [units, siteLayout.positions]);

  // ─── Auto-Calculate (debounced) ────────────────────────────────────────────
  const autoCalcTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevCalcInputRef = useRef<string>("");

  useEffect(() => {
    // Only auto-calc if at least one unit has dimensions and no hard errors
    const hasData = units.some(u => u.bladeWidth > 0 && u.length > 0);
    if (!hasData || hasErrors) return;

    const inputKey = JSON.stringify({ units, commissionRate, margin, positions: siteLayout.positions });
    if (inputKey === prevCalcInputRef.current) return;

    if (autoCalcTimerRef.current) clearTimeout(autoCalcTimerRef.current);
    autoCalcTimerRef.current = setTimeout(() => {
      prevCalcInputRef.current = inputKey;
      calculateMutation.mutate(
        { units, commissionRate, margin, positions: siteLayout.positions.length >= units.length ? siteLayout.positions : undefined },
        {
          onSuccess: (result) => setCalcResult(result as any),
          onError: () => {}, // silent on auto-calc
        }
      );
    }, 2500);

    return () => { if (autoCalcTimerRef.current) clearTimeout(autoCalcTimerRef.current); };
  }, [units, commissionRate, margin, siteLayout.positions, hasErrors]);

  const addUnit = () => setUnits([...units, defaultUnit()]);
  const duplicateUnit = (index: number) => {
    const copy = { ...units[index] };
    const newUnits = [...units];
    newUnits.splice(index + 1, 0, copy);
    setUnits(newUnits);
    toast.success(`Unit ${index + 1} duplicated`);
  };
  const removeUnit = (index: number) => {
    if (units.length <= 1) { toast.error("At least one unit is required"); return; }
    const newUnits = units.filter((_, i) => i !== index);
    setUnits(newUnits);
    // Clear stale calc result to prevent index mismatch crash
    setCalcResult(null);
    // Trim siteLayout positions to match new unit count
    if (siteLayout.positions.length > newUnits.length) {
      const newPositions = siteLayout.positions.filter((_, i) => i !== index);
      setSiteLayout({ ...siteLayout, positions: newPositions });
    }
  };
  const updateUnit = (index: number, u: UnitInput) => {
    const newUnits = [...units];
    newUnits[index] = u;
    setUnits(newUnits);
  };

  if (isLoading) {
    return (
      <div className="p-6 max-w-6xl mx-auto space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!quote) {
    return (
      <div className="p-6 max-w-6xl mx-auto">
        <p className="text-destructive">Eclipse quote not found.</p>
        <Button variant="outline" className="mt-4" onClick={() => setLocation("/eclipse-quotes")}>
          <ArrowLeft className="w-4 h-4 mr-2" /> Back to Eclipse Quotes
        </Button>
      </div>
    );
  }

  const roofRRP = calcResult?.totalRRPInc || 0;
  const addTotal = totalAdditionalCosts(additionalCosts);
  const totalPosts = units.reduce((sum, u) => sum + (u.posts || 0), 0);

  // Calculate bracket costs from per-unit selections × admin pricing
  const bracketPricing = useMemo(() => {
    if (!pricingData?.prices) return { fasciaBracketPrice: 45, extendaBracketPrice: 65, gableBracketPrice: 55, bracketCover1to5m: 120, bracketCover6to10m: 200, bracketCover11to15m: 280, bracketCover16to20m: 360 };
    const p = pricingData.prices;
    return { fasciaBracketPrice: p.fasciaBracketPrice || 45, extendaBracketPrice: p.extendaBracketPrice || 65, gableBracketPrice: p.gableBracketPrice || 55, bracketCover1to5m: p.bracketCover1to5m || 120, bracketCover6to10m: p.bracketCover6to10m || 200, bracketCover11to15m: p.bracketCover11to15m || 280, bracketCover16to20m: p.bracketCover16to20m || 360 };
  }, [pricingData]);
  const totalBracketCost = useMemo(() => {
    return units.reduce((sum, u) => sum + calculateBracketCost(u, bracketPricing as any), 0);
  }, [units, bracketPricing]);
  const checklistTotal = useMemo(() => checklistSelections.reduce((sum, s) => sum + s.total, 0), [checklistSelections]);
  // Bracket costs are now included in roofRRP (per-unit material line in calculation engine)
  const grandTotal = roofRRP + addTotal + checklistTotal;

  return (
    <div className="p-3 sm:p-6 max-w-6xl mx-auto space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <Button variant="ghost" size="icon" className="shrink-0" onClick={() => setLocation("/eclipse-quotes")}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-bold">{quote.quoteNumber}</h1>
              <Badge variant="outline" className={statusOptions.find(s => s.value === status)?.class}>
                {status}
              </Badge>
              {(quote as any).hbcfRequired && (
                <Badge variant="destructive" className="text-[11px] shrink-0 gap-1">
                  <AlertTriangle className="h-3 w-3" />
                  HBCF required
                </Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground truncate">
              {clientName || "Eclipse Opening Roof Quote"}
              {(quote as any).hbcfRequirementReason ? ` · ${(quote as any).hbcfRequirementReason}` : ""}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleCalculate} disabled={calculateMutation.isPending}>
            <Calculator className="w-4 h-4 sm:mr-2" />
            <span className="hidden sm:inline">{calculateMutation.isPending ? "Calculating..." : "Calculate"}</span>
          </Button>
          <Button size="sm" onClick={handleSave} disabled={updateMutation.isPending}>
            <Save className="w-4 h-4 sm:mr-2" />
            <span className="hidden sm:inline">{updateMutation.isPending ? "Saving..." : "Save"}</span>
          </Button>
          {/* Auto-save status indicator */}
          {autoSaveStatus === "saving" && (
            <span className="text-xs text-muted-foreground animate-pulse">Auto-saving...</span>
          )}
          {autoSaveStatus === "saved" && (
            <span className="text-xs text-green-600">✓ Saved</span>
          )}
          {autoSaveStatus === "error" && (
            <span className="text-xs text-red-600">Auto-save failed</span>
          )}
          {calcResult && (
            <div className="flex items-center gap-1">
              <Button variant="default" size="sm" className="bg-teal-700 hover:bg-teal-800 text-white" onClick={async () => {
                try {
                  const loadedImages = await loadProposalImagesForPdf(enabledProposalImages);
                  const result = generateEclipseQuotePDF({
                    quoteNumber: quote.quoteNumber,
                    clientName,
                    clientPhone,
                    clientEmail,
                    clientAddress,
                    units,
                    result: calcResult!,
                    additionalCosts,
                    bracketCost: totalBracketCost,
                    checklistTotal,
                    siteLayoutImage: siteLayoutRef.current?.getCanvasDataUrl() ?? undefined,
                    propertySitePlanImage: (document.querySelector('#eclipse-property-site-plan canvas') as HTMLCanvasElement)?.toDataURL('image/png') ?? undefined,
                    proposalImages: loadedImages,
                    previewOnly: true,
                  });
                  if (result) {
                    setPdfPreviewBlob(result.blob);
                    setPdfPreviewFilename(result.filename);
                    setPdfPreviewOpen(true);
                  }
                } catch (err: any) {
                  toast.error(err.message || "Failed to generate PDF");
                }
              }}>
                <Eye className="w-4 h-4 sm:mr-2" />
                <span className="hidden sm:inline">Preview Proposal</span>
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Summary Bar (shown when calculated) */}
      {calcResult && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 sm:gap-3">
          <Card className="p-3 text-center">
            <p className="text-xs text-muted-foreground">Total m²</p>
            <p className="text-sm font-bold">{calcResult.totalSqm.toFixed(2)}</p>
          </Card>
          <Card className="p-3 text-center">
            <p className="text-xs text-muted-foreground">Sell ex GST</p>
            <p className="text-sm font-bold">{fmt(calcResult.totalSellPriceEx)}</p>
          </Card>
          <Card className="p-3 text-center">
            <p className="text-xs text-muted-foreground">GST</p>
            <p className="text-sm font-bold">{fmt(calcResult.totalGST)}</p>
          </Card>
          <Card className="p-3 text-center">
            <p className="text-xs text-muted-foreground">RRP inc GST</p>
            <p className="text-sm font-bold">{fmt(calcResult.totalRRPInc)}</p>
          </Card>
          <Card className="p-3 text-center bg-teal-50 dark:bg-teal-950/30">
            <p className="text-xs text-muted-foreground">Grand Total</p>
            <p className="text-sm font-bold text-teal-700 dark:text-teal-400">{fmt(grandTotal)}</p>
          </Card>
        </div>
      )}

      {/* Engineering Validation Warnings */}
      {validationErrors.length > 0 && (
        <div className={`rounded-lg border p-3 space-y-1 ${hasErrors ? 'border-destructive/50 bg-destructive/10' : 'border-amber-500/50 bg-amber-50 dark:bg-amber-950/20'}`}>
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <AlertTriangle className={`w-4 h-4 ${hasErrors ? 'text-destructive' : 'text-amber-600'}`} />
              <span className={`text-sm font-medium ${hasErrors ? 'text-destructive' : 'text-amber-700 dark:text-amber-400'}`}>Engineering Validation</span>
              <span className="text-xs text-muted-foreground">({validationErrors.filter(e => e.severity === 'error').length} errors, {validationErrors.filter(e => e.severity === 'warning').length} warnings)</span>
            </div>
            <div className="flex items-center gap-3">
              {validationErrors.some(e => e.severity === 'warning') && !dismissAdvisory && (
                <button
                  type="button"
                  onClick={() => setShowWarnings(!showWarnings)}
                  className="text-xs text-muted-foreground hover:text-foreground underline"
                >
                  {showWarnings ? 'Hide warnings' : 'Show warnings'}
                </button>
              )}
              <label className="flex items-center gap-1.5 cursor-pointer" title="Suppress advisory warnings (errors always shown)">
                <input
                  type="checkbox"
                  checked={dismissAdvisory}
                  onChange={(e) => {
                    setDismissAdvisory(e.target.checked);
                    try { localStorage.setItem("eclipse_dismiss_advisory", String(e.target.checked)); } catch {}
                  }}
                  className="w-3 h-3 rounded border-muted-foreground accent-teal-600"
                />
                <span className="text-[10px] text-muted-foreground whitespace-nowrap">Dismiss advisory</span>
              </label>
            </div>
          </div>
          {validationErrors
            .filter(e => e.severity === 'error' || (!dismissAdvisory && showWarnings))
            .map((e, i) => (
            <div key={i} className={`flex items-start gap-2 text-sm ${e.severity === 'error' ? 'text-destructive' : 'text-amber-600 dark:text-amber-400'}`}>
              <span className="shrink-0 mt-0.5">{e.severity === 'error' ? '●' : '▲'}</span>
              <span><span className="font-medium">{e.field}:</span> {e.message}</span>
            </div>
          ))}
          {dismissAdvisory && validationErrors.some(e => e.severity === 'warning') && (
            <p className="text-[10px] text-muted-foreground italic pt-1">
              {validationErrors.filter(e => e.severity === 'warning').length} advisory warning(s) suppressed
            </p>
          )}
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
            <div className="space-y-1 mt-4">
              <p className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wider mb-2 px-2">Sections</p>
              <div className="flex gap-1 px-2 mb-2">
                <button
                  onClick={() => setOpenSections([
                    "client", "units",
                    ...(isAdmin ? ["materials"] : []),
                    "specsheet", "checklist", "additional",
                    ...(units.length > 1 ? ["sitelayout"] : []),
                    "propertysite", "airender",
                    ...(isAdmin ? ["notes", ...(clientId && clientPhone ? ["comms"] : []), "summary"] : []),
                  ])}
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
              {[
                { id: "client", label: "Client", icon: ArrowLeft },
                { id: "units", label: "Units", icon: Ruler },
                ...(isAdmin ? [{ id: "materials", label: "Materials", icon: Layers }] : []),
                { id: "specsheet", label: "Construction Spec", icon: ClipboardCheck },
                { id: "checklist", label: "Checklist Pricing", icon: DollarSign },
                { id: "additional", label: "Add. Costs", icon: Plus },
                ...(units.length > 1 ? [{ id: "sitelayout", label: "Site Layout", icon: Sun }] : []),
                { id: "propertysite", label: "Property Plan", icon: MapPin },
                { id: "airender", label: "AI Render", icon: Sparkles },
                ...(isAdmin ? [{ id: "notes", label: "Notes", icon: StickyNote }] : []),
                ...(isAdmin && clientId && clientPhone ? [{ id: "comms", label: "Communications", icon: ChevronDown }] : []),
                ...(isAdmin ? [{ id: "summary", label: "Summary", icon: Calculator }] : []),
              ].map(section => {
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
                        const el = document.getElementById(`eclipse-section-${section.id}`);
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
                onClick={() => setOpenSections([
                  "client", "units",
                  ...(isAdmin ? ["materials"] : []),
                  "specsheet", "checklist", "additional",
                  ...(units.length > 1 ? ["sitelayout"] : []),
                  "propertysite", "airender",
                  ...(isAdmin ? ["notes", ...(clientId && clientPhone ? ["comms"] : []), "summary"] : []),
                ])}
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
            {/* Progress indicator */}
            <div className="flex items-center gap-2 px-2 mb-3">
              <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-500 rounded-full transition-all duration-300"
                  style={{ width: `${(() => { const total = [!!clientName, units.some(u => u.bladeWidth > 0 && u.length > 0), !!calcResult, additionalCosts.footings > 0 || additionalCosts.approvals > 0 || additionalCosts.councilFees > 0, Object.keys(specData).length > 0, !!notes].filter(Boolean).length; return (total / 6) * 100; })()}%` }}
                />
              </div>
              <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                {[!!clientName, units.some(u => u.bladeWidth > 0 && u.length > 0), !!calcResult, additionalCosts.footings > 0 || additionalCosts.approvals > 0 || additionalCosts.councilFees > 0, Object.keys(specData).length > 0, !!notes].filter(Boolean).length}/6
              </span>
            </div>
            {[
              { id: "client", label: "Client", icon: ArrowLeft },
              { id: "units", label: "Units", icon: Ruler },
              ...(isAdmin ? [{ id: "materials", label: "Materials", icon: Layers }] : []),
              { id: "specsheet", label: "Construction Spec", icon: ClipboardCheck },
              { id: "checklist", label: "Checklist Pricing", icon: DollarSign },
              { id: "additional", label: "Add. Costs", icon: Plus },
              ...(units.length > 1 ? [{ id: "sitelayout", label: "Site Layout", icon: Sun }] : []),
              { id: "propertysite", label: "Property Plan", icon: MapPin },
              { id: "airender", label: "AI Render", icon: Sparkles },
              ...(isAdmin ? [{ id: "notes", label: "Notes", icon: StickyNote }] : []),
              ...(isAdmin && clientId && clientPhone ? [{ id: "comms", label: "Communications", icon: ChevronDown }] : []),
              ...(isAdmin ? [{ id: "summary", label: "Summary", icon: Calculator }] : []),
            ].map(section => {
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
                    const el = document.getElementById(`eclipse-section-${section.id}`);
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
            {/* Client */}
            <AccordionItem value="client" id="eclipse-section-client" className="border rounded-lg px-4">
              <AccordionTrigger className="text-sm font-medium">Client</AccordionTrigger>
              <AccordionContent>
          <Card>
            <CardHeader><CardTitle className="text-base">Client & Job Information</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <ClientPicker
                selectedClientId={clientId}
                onClientSelect={(client) => {
                  setClientId(client.id);
                  setClientName(client.name);
                  setClientPhone(client.phone || "");
                  setClientEmail(client.email || "");
                  const fullAddr = [client.address, client.suburb, client.state, client.postcode].filter(Boolean).join(", ");
                  setClientAddress(fullAddr);
                  // Auto-detect region from lead data
                  if (client.postcode || client.suburb || client.state) {
                    const detected = detectRegion(client.postcode || "", client.suburb || "", client.state || "");
                    if (detected) setRegion(detected);
                  }
                  // Auto-populate design adviser from lead
                  if (client.designAdvisor) setDesignAdvisor(client.designAdvisor);
                }}
                onClientClear={() => setClientId(null)}
                clientName={clientName}
                clientEmail={clientEmail}
                clientPhone={clientPhone}
                clientAddress={clientAddress}
              />
              {/* Site Address with autocomplete */}
              <div className="space-y-1">
                <Label className="text-xs">Site Address</Label>
                <AddressAutocomplete
                  value={clientAddress}
                  onChange={setClientAddress}
                  onAddressSelect={(addr) => {
                    const street = addr.unitNumber
                      ? `${addr.unitNumber}/${addr.streetAddress}`
                      : (addr.streetAddress || addr.fullAddress);
                    setClientAddress(street);
                    if (addr.postcode || addr.suburb || addr.state) {
                      const detected = detectRegion(addr.postcode || "", addr.suburb || "", addr.state || "");
                      if (detected) setRegion(detected);
                    }
                  }}
                  placeholder="Start typing site address..."
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Region</Label>
                  <RegionSelect value={region} onChange={setRegion} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Local Council</Label>
                  <CouncilSelect value={localCouncil} onChange={setLocalCouncil} />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Design Adviser</Label>
                <DesignAdvisorSelect value={designAdvisor} onChange={setDesignAdvisor} />
              </div>
              <Separator />
              {/* Description of Work */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-medium">Description of Work</Label>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="sm" onClick={() => setShowTemplatePicker(!showTemplatePicker)} className="h-7 text-xs gap-1.5 text-blue-600">
                      <FileText className="h-3 w-3" /> Use Template
                    </Button>
                    {descriptionOfWork && (
                      <>
                        <Button variant="ghost" size="sm" onClick={() => setShowRefinement(!showRefinement)} className="h-7 text-xs gap-1.5">
                          <RefreshCw className="h-3 w-3" /> Refine
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => setShowSaveToLibrary(!showSaveToLibrary)} className="h-7 text-xs gap-1.5 text-green-600">
                          <BookmarkPlus className="h-3 w-3" /> Save to Library
                        </Button>
                      </>
                    )}
                    <Button variant="ghost" size="sm" onClick={() => genDescMutation.mutate({ eclipseQuoteId: id })} disabled={genDescMutation.isPending} className="h-7 text-xs gap-1.5">
                      <Wand2 className="h-3 w-3" /> {genDescMutation.isPending ? "Generating..." : "AI Generate"}
                    </Button>
                  </div>
                </div>
                <Textarea
                  value={descriptionOfWork}
                  onChange={(e) => setDescriptionOfWork(e.target.value)}
                  rows={3}
                  className="text-sm"
                  placeholder="Describe the scope of work for this Eclipse opening roof project..."
                />
                {/* Refinement panel */}
                {showRefinement && descriptionOfWork && (
                  <div className="flex items-center gap-2 p-2 bg-muted/40 rounded-md">
                    <Input
                      value={refinementInstruction}
                      onChange={(e) => setRefinementInstruction(e.target.value)}
                      placeholder="e.g. make it shorter, add more detail about the louvre system..."
                      className="h-7 text-xs flex-1"
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && refinementInstruction.trim()) {
                          genDescMutation.mutate({
                            eclipseQuoteId: id,
                            refinementInstruction: refinementInstruction.trim(),
                            previousDescription: descriptionOfWork,
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
                          eclipseQuoteId: id,
                          refinementInstruction: refinementInstruction.trim(),
                          previousDescription: descriptionOfWork,
                        });
                      }}
                    >
                      {genDescMutation.isPending ? "Refining..." : "Regenerate"}
                    </Button>
                  </div>
                )}
                {/* Save to Library panel */}
                {showSaveToLibrary && descriptionOfWork && (
                  <div className="flex items-center gap-2 p-2 bg-green-50 dark:bg-green-950/30 rounded-md border border-green-200 dark:border-green-800">
                    <Label className="text-[10px] text-muted-foreground whitespace-nowrap">Save to group:</Label>
                    <Select value={saveToLibraryGroup} onValueChange={setSaveToLibraryGroup}>
                      <SelectTrigger className="h-7 text-xs w-[180px]">
                        <SelectValue placeholder="Select roof shape group" />
                      </SelectTrigger>
                      <SelectContent>
                        {(dowGroups || []).map((g: any) => (
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
                        if (saveToLibraryGroup && descriptionOfWork) {
                          saveToLibraryMutation.mutate({
                            description: descriptionOfWork,
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
                {/* Template picker panel */}
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
                            {(dowGroups || []).map((g: any) => (
                              <SelectItem key={g.key} value={g.key}>{g.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => { setShowTemplatePicker(false); setTemplateSearchQuery(""); }}>Close</Button>
                      </div>
                    </div>
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
                      {(dowItems || []).filter((item: any) => templateFilterGroup === "all" || item.groupKey === templateFilterGroup).filter((item: any) => !templateSearchQuery.trim() || item.value.toLowerCase().includes(templateSearchQuery.toLowerCase())).map((item: any) => {
                        const groupName = (dowGroups || []).find((g: any) => g.key === item.groupKey)?.name || "";
                        return (
                          <div key={item.key} className="rounded border border-transparent hover:border-blue-300 transition-colors">
                            <div className="flex items-start gap-1 p-2 hover:bg-blue-100 dark:hover:bg-blue-900/40 rounded">
                              <button
                                className="flex-1 text-left text-xs"
                                onClick={() => {
                                  setDescriptionOfWork(item.value);
                                  setShowTemplatePicker(false);
                                  setTemplateSearchQuery("");
                                  toast.success("Template applied");
                                }}
                              >
                                <div className="flex items-start gap-2">
                                  <span className="inline-block px-1.5 py-0.5 bg-blue-100 dark:bg-blue-800 text-[9px] font-medium rounded text-blue-700 dark:text-blue-200 whitespace-nowrap mt-0.5">{groupName}</span>
                                  <span className="text-xs leading-relaxed line-clamp-2">{item.value}</span>
                                </div>
                              </button>
                            </div>
                          </div>
                        );
                      })}
                      {(dowItems || []).filter((item: any) => templateFilterGroup === "all" || item.groupKey === templateFilterGroup).filter((item: any) => !templateSearchQuery.trim() || item.value.toLowerCase().includes(templateSearchQuery.toLowerCase())).length === 0 && (
                        <p className="text-xs text-muted-foreground text-center py-4">No templates found</p>
                      )}
                    </div>
                  </div>
                )}
              </div>
              <Separator />
              {/* Status & Pricing */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label>Status</Label>
                  <Select value={status} onValueChange={setStatus}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {statusOptions.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {isAdmin && (
                <div className="space-y-1">
                  <Label>Notes</Label>
                  <Textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={3}
                    placeholder="Internal notes..."
                  />
                </div>
              )}
            </CardContent>
          </Card>
              </AccordionContent>
            </AccordionItem>

            {/* Units */}
            <AccordionItem value="units" id="eclipse-section-units" className="border rounded-lg px-4">
              <AccordionTrigger className="text-sm font-medium">Units</AccordionTrigger>
              <AccordionContent className="space-y-4">
          {units.map((unit, i) => (
            <UnitCard
              key={i}
              unitNumber={i + 1}
              unit={unit}
              onChange={(u) => updateUnit(i, u)}
              onRemove={() => removeUnit(i)}
              onDuplicate={() => duplicateUnit(i)}
              sqm={(unit.bladeWidth / 1000) * (unit.length / 1000)}
              canEditInternalNotes={isAdmin}
            />
          ))}
          <Button variant="outline" className="w-full" onClick={addUnit}>
            <Plus className="w-4 h-4 mr-2" /> Add Unit
          </Button>
              </AccordionContent>
            </AccordionItem>

            {/* Materials (admin only) */}
            {isAdmin && <AccordionItem value="materials" id="eclipse-section-materials" className="border rounded-lg px-4">
              <AccordionTrigger className="text-sm font-medium">Materials</AccordionTrigger>
              <AccordionContent className="space-y-3">
          {!calcResult ? (
            <Card>
              <CardContent className="p-8 text-center text-muted-foreground">
                <Layers className="w-10 h-10 mx-auto mb-3 opacity-50" />
                <p>Click "Calculate" to see material breakdowns.</p>
              </CardContent>
            </Card>
          ) : (
            calcResult.units.map((r, i) =>
              r ? <MaterialBreakdown key={i} unitNumber={i + 1} result={r} /> : null
            )
          )}
              </AccordionContent>
            </AccordionItem>}


            {/* ═══ Construction Spec ═══ */}
            <AccordionItem value="specsheet" id="eclipse-section-specsheet" className="border rounded-lg px-4">
              <AccordionTrigger className="text-sm font-medium">Construction Spec</AccordionTrigger>
              <AccordionContent>
                <EclipseSpecSheet
                  specData={specData}
                  onChange={setSpecData}
                />
              </AccordionContent>
            </AccordionItem>

            {/* Checklist Pricing */}
            <AccordionItem value="checklist" id="eclipse-section-checklist" className="border rounded-lg px-4">
              <AccordionTrigger className="text-sm font-medium">
                Checklist Pricing
                {checklistSelections.length > 0 && (
                  <span className="ml-2 text-xs text-muted-foreground">
                    ({checklistSelections.length} items — ${checklistSelections.reduce((s, i) => s + i.total, 0).toFixed(2)})
                  </span>
                )}
              </AccordionTrigger>
              <AccordionContent>
                {activeChecklistItems && activeChecklistItems.length > 0 ? (
                  <div className="space-y-3">
                    {Object.entries(
                      activeChecklistItems.reduce((acc: Record<string, typeof activeChecklistItems>, item: any) => {
                        const sec = item.section || "General";
                        if (!acc[sec]) acc[sec] = [];
                        acc[sec].push(item);
                        return acc;
                      }, {} as Record<string, typeof activeChecklistItems>)
                    ).map(([section, items]) => (
                      <div key={section}>
                        <p className="text-xs font-semibold text-muted-foreground uppercase mb-1">{section}</p>
                        <div className="space-y-1">
                          {(items as any[]).map((item: any) => {
                            const sel = checklistSelections.find(s => s.itemId === item.id);
                            return (
                              <div key={item.id} className="flex items-center gap-2">
                                <input
                                  type="checkbox"
                                  checked={!!sel}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      setChecklistSelections(prev => [...prev, {
                                        itemId: item.id, label: item.label, unitPrice: parseFloat(item.unitPrice),
                                        qty: 1, total: parseFloat(item.unitPrice), section: item.section || "General", unit: item.unit || "each"
                                      }]);
                                    } else {
                                      setChecklistSelections(prev => prev.filter(s => s.itemId !== item.id));
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
                                        setChecklistSelections(prev => prev.map(s =>
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
                    {checklistSelections.length > 0 && (
                      <div className="flex justify-between items-center pt-2 border-t">
                        <span className="text-sm font-medium">Checklist Subtotal</span>
                        <span className="text-sm font-bold">${checklistSelections.reduce((sum, s) => sum + s.total, 0).toFixed(2)}</span>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No priced additional cost items configured. Add them in Admin Settings → Additional Costs Pricing.</p>
                )}
              </AccordionContent>
            </AccordionItem>

            {/* Additional Costs */}
            <AccordionItem value="additional" id="eclipse-section-additional" className="border rounded-lg px-4">
              <AccordionTrigger className="text-sm font-medium">
                Additional Costs
                {addTotal > 0 && (
                  <span className="ml-2 text-xs text-muted-foreground">(${addTotal.toLocaleString()})</span>
                )}
              </AccordionTrigger>
              <AccordionContent>
                {/* Adjustments (Delivery, Travel, Small Job, Construction Mgmt, Complexity) */}
                <div className="mb-6">
                  <h4 className="text-sm font-semibold mb-3">Adjustments</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {/* Delivery $ — auto-calculated, read-only with admin unlock */}
                    <div className="space-y-1.5">
                      <Label className="text-xs">Delivery $</Label>
                      <Input
                        type="number" step="0.01"
                        value={adjDelivery}
                        onChange={(e) => setAdjDelivery(e.target.value)}
                        className={`h-8 text-sm ${!adjDeliveryOverride ? 'bg-muted/50 cursor-not-allowed' : ''}`}
                        readOnly={!adjDeliveryOverride}
                        placeholder="0.00"
                      />
                      {(() => {
                        const distanceKm = parseFloat(adjTravelDistanceKm || "0");
                        const ratePerKm = parseFloat(priceSettings.deliveryRatePerKm || "0");
                        const tiers = priceSettings.deliveryFactorTiers;
                        let factor = 1;
                        const totalSell = roofRRP + totalAdditionalCosts(additionalCosts);
                        for (const t of tiers) { if (totalSell >= t.minValue) factor = t.factor; }
                        const autoDelivery = distanceKm * ratePerKm * factor;
                        return (
                          <div className="space-y-1">
                            {distanceKm > 0 && <p className="text-[10px] text-muted-foreground">{distanceKm}km × ${ratePerKm}/km × {factor} = ${autoDelivery.toFixed(2)}</p>}
                            {!adjDeliveryOverride && autoDelivery > 0 && adjDelivery !== autoDelivery.toFixed(2) && (
                              <Button variant="outline" size="sm" className="h-6 text-[10px]" onClick={() => setAdjDelivery(autoDelivery.toFixed(2))}>
                                Apply ${autoDelivery.toFixed(2)}
                              </Button>
                            )}
                            {adjDeliveryOverride && (
                              <Button variant="ghost" size="sm" className="h-6 text-[10px] text-muted-foreground" onClick={() => setAdjDeliveryOverride(false)}>
                                Reset to auto
                              </Button>
                            )}
                            {!adjDeliveryOverride && isAdmin && (
                              <Button variant="ghost" size="sm" className="h-5 text-[10px] text-teal-600 p-0" onClick={() => { setAdjDeliveryOverride(true); toast.info("Delivery unlocked for manual override"); }}>
                                <Lock className="h-2.5 w-2.5 mr-0.5" /> Unlock override
                              </Button>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                    {/* Travel Allowance $ — auto-calculated, read-only with admin unlock */}
                    <div className="space-y-1.5">
                      <Label className="text-xs">Travel Allowance $</Label>
                      <Input
                        type="number" step="0.01"
                        value={adjTravel}
                        onChange={(e) => setAdjTravel(e.target.value)}
                        className={`h-8 text-sm ${!adjTravelOverridden ? 'bg-muted/50 cursor-not-allowed' : ''}`}
                        readOnly={!adjTravelOverridden}
                        placeholder="0.00"
                      />
                      {adjTravelDistanceKm && (
                        <div className="flex items-center gap-1.5 flex-wrap text-[10px] text-muted-foreground">
                          <MapPin className="h-3 w-3" />
                          <span>{adjTravelDistanceKm}km</span>
                          {adjTravelBranchName && <span>from {adjTravelBranchName}</span>}
                          {adjTravelBandKey && <Badge variant="outline" className="text-[9px] px-1 py-0">{adjTravelBandKey}</Badge>}
                        </div>
                      )}
                      <div className="flex gap-1">
                        {adjTravelOverridden && (
                          <Button variant="ghost" size="sm" className="h-6 text-[10px] text-muted-foreground" onClick={() => setAdjTravelOverridden(false)}>
                            Reset to auto
                          </Button>
                        )}
                        {!adjTravelOverridden && isAdmin && (
                          <Button variant="ghost" size="sm" className="h-5 text-[10px] text-teal-600 p-0" onClick={() => { setAdjTravelOverridden(true); toast.info("Travel unlocked for manual override"); }}>
                            <Lock className="h-2.5 w-2.5 mr-0.5" /> Unlock override
                          </Button>
                        )}
                      </div>
                    </div>
                    {/* Small Job Surcharge — dropdown from price settings */}
                    <div className="space-y-1.5">
                      <Label className="text-xs">Small Job Surcharge %</Label>
                      {priceSettings.smallJob.length > 0 ? (
                        <select
                          value={adjSmallJob}
                          onChange={(e) => setAdjSmallJob(e.target.value)}
                          className="flex h-8 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        >
                          <option value="0">None (0%)</option>
                          {priceSettings.smallJob.map((sj, idx) => (
                            <option key={idx} value={sj.value}>{sj.key}: {sj.value}%</option>
                          ))}
                        </select>
                      ) : (
                        <Input type="number" step="0.1" value={adjSmallJob} onChange={(e) => setAdjSmallJob(e.target.value)} className="h-8 text-sm" placeholder="0" />
                      )}
                      {priceSettings.smallJobThreshold !== "0" && <p className="text-[10px] text-muted-foreground">Applies below ${parseFloat(priceSettings.smallJobThreshold).toLocaleString()} threshold</p>}
                    </div>
                    {/* Construction Mgmt % — auto-calculated, read-only with admin unlock */}
                    <div className="space-y-1.5">
                      <Label className="text-xs">Construction Mgmt %</Label>
                      <Input
                        type="number" step="0.1"
                        value={adjConstructionMgmt}
                        onChange={(e) => setAdjConstructionMgmt(e.target.value)}
                        className={`h-8 text-sm ${!adjConstructionMgmtOverride ? 'bg-muted/50 cursor-not-allowed' : ''}`}
                        readOnly={!adjConstructionMgmtOverride}
                      />
                      <div className="space-y-1">
                        {adjConstructionMgmtOverride && (
                          <Button variant="ghost" size="sm" className="h-6 text-[10px] text-muted-foreground" onClick={() => setAdjConstructionMgmtOverride(false)}>
                            Reset to auto
                          </Button>
                        )}
                        {!adjConstructionMgmtOverride && isAdmin && (
                          <Button variant="ghost" size="sm" className="h-5 text-[10px] text-teal-600 p-0" onClick={() => { setAdjConstructionMgmtOverride(true); toast.info("Construction Mgmt unlocked for manual override"); }}>
                            <Lock className="h-2.5 w-2.5 mr-0.5" /> Unlock override
                          </Button>
                        )}
                        {priceSettings.constructionMgmtRates.length > 0 && <p className="text-[10px] text-muted-foreground">Rates: {priceSettings.constructionMgmtRates.map(c => `${c.key}=${c.value}%`).join(", ")}</p>}
                      </div>
                    </div>
                  </div>
                </div>
                {/* Original Additional Costs */}
                <AdditionalCostsSection
                  costs={additionalCosts}
                  onChange={setAdditionalCosts}
                  roofRRP={roofRRP}
                  totalPosts={totalPosts}
                  bracketCost={totalBracketCost}
                  councilFeeOptions={councilFeeOptions}
                  homeWarrantyTiers={homeWarrantyTiers}
                  region={region}
                />
              </AccordionContent>
            </AccordionItem>

            {/* Site Layout (Combined SVG Plan) */}
            <AccordionItem value="sitelayout" id="eclipse-section-sitelayout" className="border rounded-lg px-4">
              <AccordionTrigger className="text-sm font-medium">Site Layout</AccordionTrigger>
              <AccordionContent forceMount className={openSections.includes("sitelayout") ? "" : "hidden"}>
                <EclipseSiteLayout
                  ref={siteLayoutRef}
                  units={units}
                  layoutData={siteLayout}
                  onLayoutChange={setSiteLayout}
                />
              </AccordionContent>
            </AccordionItem>

            {/* Property Site Plan (Satellite + Parcel Boundary) */}
            <AccordionItem value="propertysite" id="eclipse-section-propertysite" className="border rounded-lg px-4">
              <AccordionTrigger className="text-sm font-medium">Property Site Plan</AccordionTrigger>
              <AccordionContent forceMount className={openSections.includes("propertysite") ? "" : "hidden"}>
                <div className="space-y-4">
                  {/* Fetch Site Data */}
                  <div className="flex items-center gap-3 flex-wrap">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        if (!clientAddress) { toast.error("Please enter a site address in Client section first"); return; }
                        setParcelLoading(true);
                        lookupParcelMutation.mutate({ address: clientAddress });
                      }}
                      disabled={parcelLoading || !clientAddress}
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
                      <Input type="number" placeholder="e.g. 6000" value={setbacks.front} onChange={(e) => setSetbacks(s => ({ ...s, front: e.target.value }))} className="h-8 text-sm" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Rear Setback (mm)</Label>
                      <Input type="number" placeholder="e.g. 3000" value={setbacks.rear} onChange={(e) => setSetbacks(s => ({ ...s, rear: e.target.value }))} className="h-8 text-sm" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Left Setback (mm)</Label>
                      <Input type="number" placeholder="e.g. 1500" value={setbacks.left} onChange={(e) => setSetbacks(s => ({ ...s, left: e.target.value }))} className="h-8 text-sm" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Right Setback (mm)</Label>
                      <Input type="number" placeholder="e.g. 1500" value={setbacks.right} onChange={(e) => setSetbacks(s => ({ ...s, right: e.target.value }))} className="h-8 text-sm" />
                    </div>
                  </div>

                  {/* SitePlanDiagram */}
                  {sitePlanExpanded && (
                    <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm flex flex-col p-4 overflow-auto">
                      <SitePlanDiagram
                        boundaryCoords={parcelData?.coordinates}
                        propertyFrontageM={parcelData?.dimensions?.frontageM}
                        propertyDepthM={parcelData?.dimensions?.depthM}
                        propertyAreaSqm={parcelData?.areaSqm}
                        structureWidthMm={overallFootprint.width || undefined}
                        structureLengthMm={overallFootprint.length || undefined}
                        setbackFrontMm={setbacks.front ? parseFloat(setbacks.front) : undefined}
                        setbackRearMm={setbacks.rear ? parseFloat(setbacks.rear) : undefined}
                        setbackLeftMm={setbacks.left ? parseFloat(setbacks.left) : undefined}
                        setbackRightMm={setbacks.right ? parseFloat(setbacks.right) : undefined}
                        lotId={parcelData?.lotId}
                        suburb={parcelData?.suburb}
                        centroid={parcelData?.centroid}
                        structureOffsetX={structureOffset.x}
                        structureOffsetY={structureOffset.y}
                        structureRotation={structureRotation}
                        onStructureDrag={(x, y) => setStructureOffset({ x, y })}
                        onStructureRotate={(deg) => setStructureRotation(deg)}
                        draggable={true}
                        expanded={true}
                        onToggleExpand={() => setSitePlanExpanded(false)}
                      />
                    </div>
                  )}

                  <div id="eclipse-property-site-plan">
                    <SitePlanDiagram
                      boundaryCoords={parcelData?.coordinates}
                      propertyFrontageM={parcelData?.dimensions?.frontageM}
                      propertyDepthM={parcelData?.dimensions?.depthM}
                      propertyAreaSqm={parcelData?.areaSqm}
                      structureWidthMm={overallFootprint.width || undefined}
                      structureLengthMm={overallFootprint.length || undefined}
                      setbackFrontMm={setbacks.front ? parseFloat(setbacks.front) : undefined}
                      setbackRearMm={setbacks.rear ? parseFloat(setbacks.rear) : undefined}
                      setbackLeftMm={setbacks.left ? parseFloat(setbacks.left) : undefined}
                      setbackRightMm={setbacks.right ? parseFloat(setbacks.right) : undefined}
                      lotId={parcelData?.lotId}
                      suburb={parcelData?.suburb}
                      centroid={parcelData?.centroid}
                      structureOffsetX={structureOffset.x}
                      structureOffsetY={structureOffset.y}
                      structureRotation={structureRotation}
                      onStructureDrag={(x, y) => setStructureOffset({ x, y })}
                      onStructureRotate={(deg) => setStructureRotation(deg)}
                      draggable={true}
                      onToggleExpand={() => setSitePlanExpanded(true)}
                    />
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>



            {/* AI Render */}
            <AccordionItem value="airender" id="eclipse-section-airender" className="border rounded-lg px-4">
              <AccordionTrigger className="text-sm font-medium">AI Render</AccordionTrigger>
              <AccordionContent>
                <QuoteAIRender quoteId={id} quoteType="eclipse" />
              </AccordionContent>
            </AccordionItem>

            {/* Notes */}
            {isAdmin && <AccordionItem value="notes" id="eclipse-section-notes" className="border rounded-lg px-4">
              <AccordionTrigger className="text-sm font-medium">Notes</AccordionTrigger>
              <AccordionContent>
                <QuoteNotesSection quoteId={id} quoteType="eclipse" />
              </AccordionContent>
            </AccordionItem>}

            {/* Communications */}
            {isAdmin && clientId && clientPhone && (
              <AccordionItem value="comms" id="eclipse-section-comms" className="border rounded-lg px-4">
                <AccordionTrigger className="text-sm font-medium">Communications</AccordionTrigger>
                <AccordionContent>
                  <CommunicationsTab leadId={clientId} leadPhone={clientPhone} leadName={clientName} />
                </AccordionContent>
              </AccordionItem>
            )}

            {/* Summary (admin only) - at bottom */}
            {isAdmin && <AccordionItem value="summary" id="eclipse-section-summary" className="border rounded-lg px-4">
              <AccordionTrigger className="text-sm font-medium">Summary</AccordionTrigger>
              <AccordionContent>
          <Card>
            <CardHeader><CardTitle className="text-base">Project Summary</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {!calcResult ? (
                <p className="text-muted-foreground text-center py-6">Calculate to see the project summary.</p>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm" style={{ minWidth: '500px' }}>
                      <thead>
                        <tr className="border-b text-muted-foreground">
                          <th className="text-left py-2 whitespace-nowrap">Unit</th>
                          <th className="text-right py-2 whitespace-nowrap">m²</th>
                          <th className="text-right py-2 whitespace-nowrap">Material</th>
                          <th className="text-right py-2 whitespace-nowrap">Labour</th>
                          <th className="text-right py-2 whitespace-nowrap">Sell ex GST</th>
                          <th className="text-right py-2 whitespace-nowrap">RRP inc GST</th>
                        </tr>
                      </thead>
                      <tbody>
                        {calcResult.units.map((r, i) => {
                          if (!r || !units[i]) return null;
                          const sqm = (units[i].bladeWidth / 1000) * (units[i].length / 1000);
                          return (
                            <tr key={i} className="border-b border-border/30">
                              <td className="py-2">Unit {i + 1}</td>
                              <td className="py-2 text-right font-mono">{sqm.toFixed(2)}</td>
                              <td className="py-2 text-right font-mono">{fmt(r.materialCost)}</td>
                              <td className="py-2 text-right font-mono">{fmt(r.labourCost)}</td>
                              <td className="py-2 text-right font-mono">{fmt(r.sellPriceExGST)}</td>
                              <td className="py-2 text-right font-mono font-medium">{fmt(r.rrpIncGST)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot>
                        <tr className="font-bold border-t-2">
                          <td className="py-2">Total</td>
                          <td className="py-2 text-right">{calcResult.totalSqm.toFixed(2)}</td>
                          <td className="py-2 text-right" colSpan={2}></td>
                          <td className="py-2 text-right">{fmt(calcResult.totalSellPriceEx)}</td>
                          <td className="py-2 text-right">{fmt(calcResult.totalRRPInc)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>

                  {(addTotal > 0 || totalBracketCost > 0 || checklistTotal > 0) && (
                    <div className="border-t pt-3">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Roof System RRP</span>
                        <span>{fmt(calcResult.totalRRPInc)}</span>
                      </div>
                      {totalBracketCost > 0 && (
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Brackets (included in RRP)</span>
                          <span className="text-muted-foreground">{fmt(totalBracketCost)}</span>
                        </div>
                      )}
                      {checklistTotal > 0 && (
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Checklist Pricing</span>
                          <span>{fmt(checklistTotal)}</span>
                        </div>
                      )}
                      {addTotal > 0 && (
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Additional Costs</span>
                          <span>{fmt(addTotal)}</span>
                        </div>
                      )}
                      <div className="flex justify-between text-base font-bold mt-1 pt-1 border-t">
                        <span>Grand Total inc GST</span>
                        <span className="text-teal-700 dark:text-teal-400">{fmt(grandTotal)}</span>
                      </div>
                    </div>
                  )}

                  <div className="flex justify-between text-sm text-muted-foreground">
                    <span>RRP per m²</span>
                    <span>{fmt(calcResult.rrpPerSqm)}</span>
                  </div>

                  <Separator />

                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" onClick={async () => {
                      try {
                        const loadedImages = await loadProposalImagesForPdf(enabledProposalImages);
                        const result = generateEclipseQuotePDF({
                          quoteNumber: quote.quoteNumber,
                          clientName,
                          clientPhone,
                          clientEmail,
                          clientAddress,
                          units,
                          result: calcResult!,
                          additionalCosts,
                          bracketCost: totalBracketCost,
                          checklistTotal,
                          checklistSelections,
                          siteLayoutImage: siteLayoutRef.current?.getCanvasDataUrl() ?? undefined,
                          propertySitePlanImage: (document.querySelector('#eclipse-property-site-plan canvas') as HTMLCanvasElement)?.toDataURL('image/png') ?? undefined,
                          proposalImages: loadedImages,
                          previewOnly: true,
                        });
                        if (result) {
                          setPdfPreviewBlob(result.blob);
                          setPdfPreviewFilename(result.filename);
                          setPdfPreviewOpen(true);
                        }
                      } catch (err: any) {
                        toast.error(err.message || "Failed to generate PDF");
                      }
                    }}>
                      <Eye className="w-4 h-4 mr-2" /> Preview Quote PDF
                    </Button>
                    <Button variant="outline" onClick={async () => {
                      try {
                        const loadedImages = await loadProposalImagesForPdf(enabledProposalImages);
                        generateEclipseQuotePDF({
                          quoteNumber: quote.quoteNumber,
                          clientName,
                          clientPhone,
                          clientEmail,
                          clientAddress,
                          units,
                          result: calcResult!,
                          additionalCosts,
                          bracketCost: totalBracketCost,
                          checklistTotal,
                          checklistSelections,
                          siteLayoutImage: siteLayoutRef.current?.getCanvasDataUrl() ?? undefined,
                          propertySitePlanImage: (document.querySelector('#eclipse-property-site-plan canvas') as HTMLCanvasElement)?.toDataURL('image/png') ?? undefined,
                          proposalImages: loadedImages,
                        });
                        toast.success("Quote PDF downloaded");
                      } catch (err: any) {
                        toast.error(err.message || "Failed to generate PDF");
                      }
                    }}>
                      <FileDown className="w-4 h-4 mr-2" /> Download Quote PDF
                    </Button>
                    {(user?.role === "admin" || user?.role === "super_admin") && (
                      <>
                        <Button variant="outline" onClick={async () => {
                          try {
                            const loadedImages = await loadProposalImagesForPdf(enabledProposalImages);
                            const rakedElevationImages: { unitIndex: number; dataUrl: string }[] = [];
                            units.forEach((u, i) => {
                              if (u.isRaked && rakedElevRefs.current[i]) {
                                const dataUrl = rakedElevRefs.current[i]!.getCanvasDataUrl();
                                if (dataUrl) rakedElevationImages.push({ unitIndex: i, dataUrl });
                              }
                            });
                            const result = generateEclipseManagementPDF({
                              quoteNumber: quote.quoteNumber,
                              clientName,
                              clientPhone,
                              clientEmail,
                              clientAddress,
                              units,
                              result: calcResult!,
                              commissionRate,
                              margin,
                              additionalCosts,
                              bracketCost: totalBracketCost,
                              checklistTotal,
                              checklistSelections,
                              siteLayoutImage: siteLayoutRef.current?.getCanvasDataUrl() ?? undefined,
                              propertySitePlanImage: (document.querySelector('#eclipse-property-site-plan canvas') as HTMLCanvasElement)?.toDataURL('image/png') ?? undefined,
                              proposalImages: loadedImages,
                              rakedElevationImages,
                              previewOnly: true,
                            });
                            if (result) {
                              setPdfPreviewBlob(result.blob);
                              setPdfPreviewFilename(result.filename);
                              setPdfPreviewOpen(true);
                            }
                          } catch (err: any) {
                            toast.error(err.message || "Failed to generate PDF");
                          }
                        }}>
                          <Eye className="w-4 h-4 mr-2" /> Preview Management PDF
                        </Button>
                        <Button variant="outline" onClick={async () => {
                          try {
                            const loadedImages = await loadProposalImagesForPdf(enabledProposalImages);
                            const rakedElevationImages: { unitIndex: number; dataUrl: string }[] = [];
                            units.forEach((u, i) => {
                              if (u.isRaked && rakedElevRefs.current[i]) {
                                const dataUrl = rakedElevRefs.current[i]!.getCanvasDataUrl();
                                if (dataUrl) rakedElevationImages.push({ unitIndex: i, dataUrl });
                              }
                            });
                            generateEclipseManagementPDF({
                              quoteNumber: quote.quoteNumber,
                              clientName,
                              clientPhone,
                              clientEmail,
                              clientAddress,
                              units,
                              result: calcResult!,
                              commissionRate,
                              margin,
                              additionalCosts,
                              bracketCost: totalBracketCost,
                              checklistTotal,
                              checklistSelections,
                              siteLayoutImage: siteLayoutRef.current?.getCanvasDataUrl() ?? undefined,
                              propertySitePlanImage: (document.querySelector('#eclipse-property-site-plan canvas') as HTMLCanvasElement)?.toDataURL('image/png') ?? undefined,
                              proposalImages: loadedImages,
                              rakedElevationImages,
                            });
                            toast.success("Management PDF downloaded");
                          } catch (err: any) {
                            toast.error(err.message || "Failed to generate PDF");
                          }
                        }}>
                          <FileDown className="w-4 h-4 mr-2" /> Download Management PDF
                        </Button>
                      </>
                    )}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
              </AccordionContent>
            </AccordionItem>}
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
