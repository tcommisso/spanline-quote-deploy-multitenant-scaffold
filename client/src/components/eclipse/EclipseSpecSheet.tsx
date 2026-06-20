/**
 * EclipseSpecSheet — Construction specification fields for Eclipse (Opening Roof) quotes.
 * Stored as JSON in eclipse_quotes.specData column.
 * Fields: wind category, soil class, footing type, attachment method,
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

const ATTACHMENT_METHODS = [
  { value: "None", label: "None" },
  { value: "Fascia brackets", label: "Fascia brackets" },
  { value: "Gable brackets", label: "Gable brackets" },
  { value: "popup brackets", label: "popup brackets" },
  { value: "wall brackets", label: "wall brackets" },
];

export interface EclipseSpecData {
  windCategory?: string;
  soilClass?: string;
  footingType?: string;
  footingDepthMm?: number;
  footingDiameterMm?: number;
  attachmentMethod?: string;
  attachmentNotes?: string;
  // Brackets
  bracketAttachmentSides?: string;
  fasciaBrackets?: string;
  extendaBrackets?: string;
  gableBrackets?: string;
  oversizedDGutter?: string;
  bracketCover?: string;
  bracketColour?: string;
  popupBrackets?: string;
  popupColour?: string;
  freeStanding?: string;
  wallFixingBeam?: string;
  wallFixingBracket?: string;
  foamCut?: string;
  electricalRequired?: boolean;
  electricalNotes?: string;
  plumbingRequired?: boolean;
  plumbingNotes?: string;
  concreteRequired?: boolean;
  concreteType?: string;
  concreteNotes?: string;
  accessDifficult?: boolean;
  restrictedWorkTimes?: boolean;
  siteConditionsNotes?: string;
  engineeringRequired?: boolean;
  councilApprovalRequired?: boolean;
  existingStructureDemolition?: boolean;
}

interface EclipseSpecSheetProps {
  specData: EclipseSpecData;
  onChange: (specData: EclipseSpecData) => void;
}

export default function EclipseSpecSheet({ specData, onChange }: EclipseSpecSheetProps) {
  const update = (field: keyof EclipseSpecData, value: any) => {
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

      {/* Footings & Attachment */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Footings & Attachment</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label className="text-xs">Attachment Method</Label>
              <Select value={specData.attachmentMethod || ""} onValueChange={(v) => update("attachmentMethod", v)}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Select attachment" /></SelectTrigger>
                <SelectContent>
                  {ATTACHMENT_METHODS.map((a) => (
                    <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Attachment Notes</Label>
              <Input className="h-9" value={specData.attachmentNotes || ""} onChange={(e) => update("attachmentNotes", e.target.value)} placeholder="e.g. Fix to existing steel beam" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Brackets */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Attachment & Brackets</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            <div>
              <Label className="text-xs">Attachment Sides</Label>
              <Select value={specData.bracketAttachmentSides || ""} onValueChange={(v) => {
                update("bracketAttachmentSides", v);
                if (v === "None" || v === "") {
                  update("fasciaBrackets", ""); update("extendaBrackets", ""); update("gableBrackets", "");
                  update("oversizedDGutter", ""); update("bracketCover", ""); update("bracketColour", "");
                  update("popupBrackets", ""); update("popupColour", ""); update("freeStanding", "");
                  update("wallFixingBeam", ""); update("wallFixingBracket", ""); update("foamCut", "");
                }
              }}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Select sides" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="None">None</SelectItem>
                  <SelectItem value="1 Side">1 Side</SelectItem>
                  <SelectItem value="2 Side">2 Side</SelectItem>
                  <SelectItem value="3 Side">3 Side</SelectItem>
                  <SelectItem value="4 Side">4 Side</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {specData.bracketAttachmentSides && specData.bracketAttachmentSides !== "None" && (<>
            <div>
              <Label className="text-xs">Fascia Brackets</Label>
              <Select value={specData.fasciaBrackets || ""} onValueChange={(v) => update("fasciaBrackets", v)}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Qty" /></SelectTrigger>
                <SelectContent>{["1","2","3","4","5","6","7","8","9","10"].map(n => <SelectItem key={n} value={n}>{n}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Extenda Brackets</Label>
              <Select value={specData.extendaBrackets || ""} onValueChange={(v) => update("extendaBrackets", v)}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Qty" /></SelectTrigger>
                <SelectContent>{["1","2","3","4","5","6","7","8","9","10"].map(n => <SelectItem key={n} value={n}>{n}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Gable Brackets</Label>
              <Select value={specData.gableBrackets || ""} onValueChange={(v) => update("gableBrackets", v)}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Qty" /></SelectTrigger>
                <SelectContent>{["1","2","3","4","5","6","7","8","9","10"].map(n => <SelectItem key={n} value={n}>{n}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Oversized D Gutter</Label>
              <Select value={specData.oversizedDGutter || ""} onValueChange={(v) => update("oversizedDGutter", v)}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Length" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="1 to 5m">1 to 5m</SelectItem>
                  <SelectItem value="6 to 10m">6 to 10m</SelectItem>
                  <SelectItem value="11 to 15m">11 to 15m</SelectItem>
                  <SelectItem value="16 to 20m">16 to 20m</SelectItem>
                  <SelectItem value="Other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Bracket Cover</Label>
              <Select value={specData.bracketCover || ""} onValueChange={(v) => update("bracketCover", v)}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Length" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="1 to 5m">1 to 5m</SelectItem>
                  <SelectItem value="6 to 10m">6 to 10m</SelectItem>
                  <SelectItem value="11 to 15m">11 to 15m</SelectItem>
                  <SelectItem value="16 to 20m">16 to 20m</SelectItem>
                  <SelectItem value="Other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Bracket Colour</Label>
              <Input className="h-9 text-xs" value={specData.bracketColour || ""} onChange={(e) => update("bracketColour", e.target.value)} placeholder="e.g. Surfmist" />
            </div>
            <div>
              <Label className="text-xs">Pop-up Brackets</Label>
              <Select value={specData.popupBrackets || ""} onValueChange={(v) => update("popupBrackets", v)}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Qty" /></SelectTrigger>
                <SelectContent>{["1","2","3","4","5","6","7","8","9","10"].map(n => <SelectItem key={n} value={n}>{n}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Pop-up Colour</Label>
              <Input className="h-9 text-xs" value={specData.popupColour || ""} onChange={(e) => update("popupColour", e.target.value)} placeholder="e.g. Monument" />
            </div>
            <div>
              <Label className="text-xs">Free Standing</Label>
              <Select value={specData.freeStanding || ""} onValueChange={(v) => update("freeStanding", v)}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent><SelectItem value="Yes">Yes</SelectItem><SelectItem value="No">No</SelectItem></SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Wall Fixing Beam</Label>
              <Select value={specData.wallFixingBeam || ""} onValueChange={(v) => update("wallFixingBeam", v)}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Length" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="1 to 5m">1 to 5m</SelectItem>
                  <SelectItem value="6 to 10m">6 to 10m</SelectItem>
                  <SelectItem value="11 to 15m">11 to 15m</SelectItem>
                  <SelectItem value="16 to 20m">16 to 20m</SelectItem>
                  <SelectItem value="Other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Wall Fixing Bracket</Label>
              <Select value={specData.wallFixingBracket || ""} onValueChange={(v) => update("wallFixingBracket", v)}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Qty" /></SelectTrigger>
                <SelectContent>{["1","2","3","4","5","6","7","8","9","10"].map(n => <SelectItem key={n} value={n}>{n}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Foam Cut</Label>
              <Select value={specData.foamCut || ""} onValueChange={(v) => update("foamCut", v)}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Length" /></SelectTrigger>
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
        </CardContent>
      </Card>

      {/* Services: Electrical, Plumbing, Concrete */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Services</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Checkbox checked={!!specData.electricalRequired} onCheckedChange={(v) => update("electricalRequired", !!v)} id="ecl-elec" />
                <Label htmlFor="ecl-elec" className="text-xs font-medium">Electrical Required</Label>
              </div>
              {specData.electricalRequired && (
                <Textarea rows={2} className="text-xs" value={specData.electricalNotes || ""} onChange={(e) => update("electricalNotes", e.target.value)} placeholder="LED downlights, fan point, GPO..." />
              )}
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Checkbox checked={!!specData.plumbingRequired} onCheckedChange={(v) => update("plumbingRequired", !!v)} id="ecl-plumb" />
                <Label htmlFor="ecl-plumb" className="text-xs font-medium">Plumbing Required</Label>
              </div>
              {specData.plumbingRequired && (
                <Textarea rows={2} className="text-xs" value={specData.plumbingNotes || ""} onChange={(e) => update("plumbingNotes", e.target.value)} placeholder="Downpipe connection, stormwater..." />
              )}
            </div>
          </div>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Checkbox checked={!!specData.concreteRequired} onCheckedChange={(v) => update("concreteRequired", !!v)} id="ecl-concrete" />
              <Label htmlFor="ecl-concrete" className="text-xs font-medium">Concrete Required</Label>
            </div>
            {specData.concreteRequired && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Select value={specData.concreteType || ""} onValueChange={(v) => update("concreteType", v)}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="Concrete type" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="patio_slab">Patio Slab</SelectItem>
                    <SelectItem value="enclosure_slab">Enclosure Slab</SelectItem>
                    <SelectItem value="topper_slab">Topper Slab</SelectItem>
                    <SelectItem value="stamped">Stamped Concrete</SelectItem>
                  </SelectContent>
                </Select>
                <Input className="h-9 text-xs" value={specData.concreteNotes || ""} onChange={(e) => update("concreteNotes", e.target.value)} placeholder="Area m², thickness..." />
              </div>
            )}
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
              <Checkbox checked={!!specData.accessDifficult} onCheckedChange={(v) => update("accessDifficult", !!v)} id="ecl-access" />
              <Label htmlFor="ecl-access" className="text-xs">Difficult Access</Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox checked={!!specData.restrictedWorkTimes} onCheckedChange={(v) => update("restrictedWorkTimes", !!v)} id="ecl-restricted" />
              <Label htmlFor="ecl-restricted" className="text-xs">Restricted Times</Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox checked={!!specData.engineeringRequired} onCheckedChange={(v) => update("engineeringRequired", !!v)} id="ecl-eng" />
              <Label htmlFor="ecl-eng" className="text-xs">Engineering Req'd</Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox checked={!!specData.councilApprovalRequired} onCheckedChange={(v) => update("councilApprovalRequired", !!v)} id="ecl-council" />
              <Label htmlFor="ecl-council" className="text-xs">Council Approval</Label>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox checked={!!specData.existingStructureDemolition} onCheckedChange={(v) => update("existingStructureDemolition", !!v)} id="ecl-demo" />
            <Label htmlFor="ecl-demo" className="text-xs">Existing Structure Demolition Required</Label>
          </div>
          <div>
            <Label className="text-xs">Site Conditions Notes</Label>
            <Textarea rows={2} className="text-xs" value={specData.siteConditionsNotes || ""} onChange={(e) => update("siteConditionsNotes", e.target.value)} placeholder="Slope, obstacles, crane access, neighbour constraints..." />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
