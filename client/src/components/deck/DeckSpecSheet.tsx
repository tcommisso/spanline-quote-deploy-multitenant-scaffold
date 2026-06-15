/**
 * DeckSpecSheet — Construction specification fields for Deck quotes.
 * Stored as JSON in deck_quotes.specData column.
 * Fields: wind category, soil class, footing type, balustrade type,
 * electrical requirements, plumbing requirements, site access conditions.
 */
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";

// Wind categories per AS/NZS 1170.2
const WIND_CATEGORIES = [
  { value: "N1", label: "N1 (0.44 kPa, non-cyclonic)" },
  { value: "N2", label: "N2 (0.65 kPa, non-cyclonic)" },
  { value: "N3", label: "N3 (1.01 kPa, non-cyclonic)" },
  { value: "N4", label: "N4 (1.5 kPa, non-cyclonic)" },
  { value: "C1", label: "C1 (1.01 kPa, cyclonic)" },
  { value: "C2", label: "C2 (1.5 kPa, cyclonic)" },
  { value: "C3", label: "C3 (2.16 kPa, cyclonic)" },
  { value: "C4", label: "C4 (2.94 kPa, cyclonic)" },
];

const SOIL_CLASSES = [
  { value: "A", label: "Class A — Most sand/rock sites" },
  { value: "S", label: "Class S — Slightly reactive clay" },
  { value: "M", label: "Class M — Moderately reactive clay" },
  { value: "H1", label: "Class H1 — Highly reactive clay" },
  { value: "H2", label: "Class H2 — Very highly reactive clay" },
  { value: "E", label: "Class E — Extremely reactive clay" },
  { value: "P", label: "Class P — Problem sites (soft/fill)" },
];

const FOOTING_TYPES = [
  { value: "concrete_pier", label: "Concrete Pier" },
  { value: "screw_pile", label: "Screw Pile" },
  { value: "pad_footing", label: "Pad Footing" },
  { value: "strip_footing", label: "Strip Footing" },
  { value: "existing", label: "Existing (subject to inspection)" },
];

const BALUSTRADE_TYPES = [
  { value: "none", label: "None" },
  { value: "glass", label: "Glass" },
  { value: "wire", label: "Stainless Wire" },
  { value: "aluminium", label: "Aluminium" },
  { value: "timber", label: "Timber" },
  { value: "composite", label: "Composite" },
];

export interface DeckSpecData {
  windCategory?: string;
  soilClass?: string;
  footingType?: string;
  footingDepthMm?: number;
  footingDiameterMm?: number;
  balustradeType?: string;
  balustradeHeightMm?: number;
  balustradeLm?: number;
  electricalRequired?: boolean;
  electricalNotes?: string;
  plumbingRequired?: boolean;
  plumbingNotes?: string;
  accessDifficult?: boolean;
  restrictedWorkTimes?: boolean;
  siteConditionsNotes?: string;
  engineeringRequired?: boolean;
  councilApprovalRequired?: boolean;
  existingStructureDemolition?: boolean;
}

interface DeckSpecSheetProps {
  specData: DeckSpecData;
  onChange: (specData: DeckSpecData) => void;
}

export default function DeckSpecSheet({ specData, onChange }: DeckSpecSheetProps) {
  const update = (field: keyof DeckSpecData, value: any) => {
    onChange({ ...specData, [field]: value });
  };

  return (
    <div className="space-y-4">
      {/* Wind & Soil */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Site Classification</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label className="text-xs">Wind Category</Label>
            <Select value={specData.windCategory || ""} onValueChange={(v) => update("windCategory", v)}>
              <SelectTrigger className="h-9"><SelectValue placeholder="Select wind category" /></SelectTrigger>
              <SelectContent>
                {WIND_CATEGORIES.map((w) => (
                  <SelectItem key={w.value} value={w.value}>{w.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Soil Classification</Label>
            <Select value={specData.soilClass || ""} onValueChange={(v) => update("soilClass", v)}>
              <SelectTrigger className="h-9"><SelectValue placeholder="Select soil class" /></SelectTrigger>
              <SelectContent>
                {SOIL_CLASSES.map((s) => (
                  <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Footings */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Footings</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <Label className="text-xs">Footing Type</Label>
            <Select value={specData.footingType || ""} onValueChange={(v) => update("footingType", v)}>
              <SelectTrigger className="h-9"><SelectValue placeholder="Select footing type" /></SelectTrigger>
              <SelectContent>
                {FOOTING_TYPES.map((f) => (
                  <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Depth (mm)</Label>
            <Input type="number" className="h-9" value={specData.footingDepthMm || ""} onChange={(e) => update("footingDepthMm", e.target.value ? parseInt(e.target.value) : undefined)} placeholder="e.g. 600" />
          </div>
          <div>
            <Label className="text-xs">Diameter (mm)</Label>
            <Input type="number" className="h-9" value={specData.footingDiameterMm || ""} onChange={(e) => update("footingDiameterMm", e.target.value ? parseInt(e.target.value) : undefined)} placeholder="e.g. 450" />
          </div>
        </CardContent>
      </Card>

      {/* Balustrade */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Balustrade</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <Label className="text-xs">Type</Label>
            <Select value={specData.balustradeType || ""} onValueChange={(v) => update("balustradeType", v)}>
              <SelectTrigger className="h-9"><SelectValue placeholder="Select type" /></SelectTrigger>
              <SelectContent>
                {BALUSTRADE_TYPES.map((b) => (
                  <SelectItem key={b.value} value={b.value}>{b.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Height (mm)</Label>
            <Input type="number" className="h-9" value={specData.balustradeHeightMm || ""} onChange={(e) => update("balustradeHeightMm", e.target.value ? parseInt(e.target.value) : undefined)} placeholder="e.g. 1000" />
          </div>
          <div>
            <Label className="text-xs">Total Length (LM)</Label>
            <Input type="number" className="h-9" step="0.1" value={specData.balustradeLm || ""} onChange={(e) => update("balustradeLm", e.target.value ? parseFloat(e.target.value) : undefined)} placeholder="e.g. 12.5" />
          </div>
        </CardContent>
      </Card>

      {/* Electrical & Plumbing */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Services</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Checkbox checked={!!specData.electricalRequired} onCheckedChange={(v) => update("electricalRequired", !!v)} id="deck-elec" />
                <Label htmlFor="deck-elec" className="text-xs font-medium">Electrical Required</Label>
              </div>
              {specData.electricalRequired && (
                <Textarea rows={2} className="text-xs" value={specData.electricalNotes || ""} onChange={(e) => update("electricalNotes", e.target.value)} placeholder="Lights, GPOs, fan points..." />
              )}
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Checkbox checked={!!specData.plumbingRequired} onCheckedChange={(v) => update("plumbingRequired", !!v)} id="deck-plumb" />
                <Label htmlFor="deck-plumb" className="text-xs font-medium">Plumbing Required</Label>
              </div>
              {specData.plumbingRequired && (
                <Textarea rows={2} className="text-xs" value={specData.plumbingNotes || ""} onChange={(e) => update("plumbingNotes", e.target.value)} placeholder="Drainage, tap points..." />
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Site Access & Approvals */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Site Conditions & Approvals</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="flex items-center gap-2">
              <Checkbox checked={!!specData.accessDifficult} onCheckedChange={(v) => update("accessDifficult", !!v)} id="deck-access" />
              <Label htmlFor="deck-access" className="text-xs">Difficult Access</Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox checked={!!specData.restrictedWorkTimes} onCheckedChange={(v) => update("restrictedWorkTimes", !!v)} id="deck-restricted" />
              <Label htmlFor="deck-restricted" className="text-xs">Restricted Times</Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox checked={!!specData.engineeringRequired} onCheckedChange={(v) => update("engineeringRequired", !!v)} id="deck-eng" />
              <Label htmlFor="deck-eng" className="text-xs">Engineering Req'd</Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox checked={!!specData.councilApprovalRequired} onCheckedChange={(v) => update("councilApprovalRequired", !!v)} id="deck-council" />
              <Label htmlFor="deck-council" className="text-xs">Council Approval</Label>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox checked={!!specData.existingStructureDemolition} onCheckedChange={(v) => update("existingStructureDemolition", !!v)} id="deck-demo" />
            <Label htmlFor="deck-demo" className="text-xs">Existing Structure Demolition Required</Label>
          </div>
          <div>
            <Label className="text-xs">Site Conditions Notes</Label>
            <Textarea rows={2} className="text-xs" value={specData.siteConditionsNotes || ""} onChange={(e) => update("siteConditionsNotes", e.target.value)} placeholder="Slope, soil conditions, obstacles, crane access..." />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
