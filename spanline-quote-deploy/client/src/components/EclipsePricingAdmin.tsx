import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Save, RotateCcw, ChevronDown, ChevronUp } from "lucide-react";
import { toast } from "sonner";
import { type EditablePrices, getDefaultPrices } from "../../../shared/eclipsePricing";

function PriceInput({ label, value, onChange, isModified }: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  isModified: boolean;
}) {
  return (
    <div className="space-y-1">
      <Label className={`text-xs ${isModified ? "text-amber-600 font-semibold" : "text-muted-foreground"}`}>
        {label} {isModified && "*"}
      </Label>
      <div className="relative">
        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">$</span>
        <Input
          type="number"
          value={value || ""}
          onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
          className="pl-6 h-8 text-sm font-mono"
          step="0.01"
        />
      </div>
    </div>
  );
}

function SectionCard({ title, children, defaultOpen = true }: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Card>
      <CardHeader className="py-3 px-4 cursor-pointer" onClick={() => setOpen(!open)}>
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium">{title}</CardTitle>
          {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </div>
      </CardHeader>
      {open && <CardContent className="px-4 pb-4">{children}</CardContent>}
    </Card>
  );
}

export default function EclipsePricingAdmin() {
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.eclipseRoof.pricing.getAll.useQuery();
  const saveMutation = trpc.eclipseRoof.pricing.save.useMutation({
    onSuccess: () => {
      toast.success("Eclipse pricing saved");
      utils.eclipseRoof.pricing.getAll.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });
  const resetMutation = trpc.eclipseRoof.pricing.reset.useMutation({
    onSuccess: (result) => {
      toast.success("Eclipse pricing reset to defaults");
      setPrices(result.prices as any);
      utils.eclipseRoof.pricing.getAll.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const defaults = getDefaultPrices();
  const [prices, setPrices] = useState<EditablePrices>(defaults);

  useEffect(() => {
    if (data?.prices) {
      setPrices(data.prices as EditablePrices);
    }
  }, [data]);

  const update = (field: keyof EditablePrices, value: any) => {
    setPrices((prev) => ({ ...prev, [field]: value }));
  };

  const updateLouvre = (index: number, field: "white" | "powderCoated", value: number) => {
    setPrices((prev) => {
      const lp = [...prev.louvrePrices];
      lp[index] = { ...lp[index], [field]: value };
      return { ...prev, louvrePrices: lp };
    });
  };

  const isModified = (field: keyof EditablePrices): boolean => {
    const d = defaults[field];
    const c = prices[field];
    if (typeof d === "number" && typeof c === "number") return Math.abs(d - c) > 0.001;
    return JSON.stringify(d) !== JSON.stringify(c);
  };

  if (isLoading) {
    return <div className="flex items-center justify-center h-32"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Eclipse Pricing</h2>
          <p className="text-xs text-muted-foreground">
            Edit material prices for Eclipse Opening Roof calculations.
            {data?.isDefault && " (Using defaults — no custom prices saved yet.)"}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => resetMutation.mutate()} disabled={resetMutation.isPending}>
            <RotateCcw className="w-3 h-3 mr-1" /> Reset
          </Button>
          <Button size="sm" onClick={() => saveMutation.mutate({ prices })} disabled={saveMutation.isPending}>
            <Save className="w-3 h-3 mr-1" /> {saveMutation.isPending ? "Saving..." : "Save Prices"}
          </Button>
        </div>
      </div>

      {/* Labour & General */}
      <SectionCard title="Labour & General">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <PriceInput label="Labour per Day" value={prices.labourPerDay} onChange={(v) => update("labourPerDay", v)} isModified={isModified("labourPerDay")} />
          <div className="space-y-1">
            <Label className={`text-xs ${isModified("defaultDiscount") ? "text-amber-600 font-semibold" : "text-muted-foreground"}`}>
              Default Discount % {isModified("defaultDiscount") && "*"}
            </Label>
            <Input type="number" value={prices.defaultDiscount || ""} onChange={(e) => update("defaultDiscount", parseFloat(e.target.value) || 0)} className="h-8 text-sm font-mono" />
          </div>
          <PriceInput label="Consumables" value={prices.consumables} onChange={(v) => update("consumables", v)} isModified={isModified("consumables")} />
        </div>
      </SectionCard>

      {/* Louvre Prices by Blade Size */}
      <SectionCard title="Louvre Prices by Blade Size">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b text-muted-foreground">
                <th className="text-left py-1 pr-2">Size (mm)</th>
                <th className="text-right py-1 pr-2">White ($)</th>
                <th className="text-right py-1 pr-2">Powder Coated ($)</th>
                <th className="text-right py-1">PC Premium</th>
              </tr>
            </thead>
            <tbody>
              {prices.louvrePrices.map((lp, i) => {
                const premium = lp.white > 0 ? ((lp.powderCoated - lp.white) / lp.white * 100).toFixed(1) : "—";
                return (
                  <tr key={lp.size} className="border-b border-border/30">
                    <td className="py-1.5 pr-2 font-medium">{lp.size}</td>
                    <td className="py-1.5 pr-2">
                      <Input type="number" value={lp.white || ""} onChange={(e) => updateLouvre(i, "white", parseFloat(e.target.value) || 0)} className="h-7 text-xs font-mono w-24 ml-auto" step="0.1" />
                    </td>
                    <td className="py-1.5 pr-2">
                      <Input type="number" value={lp.powderCoated || ""} onChange={(e) => updateLouvre(i, "powderCoated", parseFloat(e.target.value) || 0)} className="h-7 text-xs font-mono w-24 ml-auto" step="0.1" />
                    </td>
                    <td className="py-1.5 text-right text-muted-foreground">{premium}%</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </SectionCard>

      {/* Structural Components */}
      <SectionCard title="Structural Components" defaultOpen={false}>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <PriceInput label="Track 5.5m White" value={prices.trackWhite} onChange={(v) => update("trackWhite", v)} isModified={isModified("trackWhite")} />
          <PriceInput label="Track 5.5m PC" value={prices.trackPC} onChange={(v) => update("trackPC", v)} isModified={isModified("trackPC")} />
          <PriceInput label="Locking Angle White" value={prices.lockAngleWhite} onChange={(v) => update("lockAngleWhite", v)} isModified={isModified("lockAngleWhite")} />
          <PriceInput label="Locking Angle PC" value={prices.lockAnglePC} onChange={(v) => update("lockAnglePC", v)} isModified={isModified("lockAnglePC")} />
          <PriceInput label="Gutter 6.0m" value={prices.gutterColour} onChange={(v) => update("gutterColour", v)} isModified={isModified("gutterColour")} />
          <PriceInput label="Gutter Strap/Joiner" value={prices.gutterStrap} onChange={(v) => update("gutterStrap", v)} isModified={isModified("gutterStrap")} />
          <PriceInput label="Motor Cover White" value={prices.motorCoverWhite} onChange={(v) => update("motorCoverWhite", v)} isModified={isModified("motorCoverWhite")} />
          <PriceInput label="Motor Cover PC" value={prices.motorCoverPC} onChange={(v) => update("motorCoverPC", v)} isModified={isModified("motorCoverPC")} />
          <PriceInput label="Beam 200x50 White" value={prices.beam200_65White} onChange={(v) => update("beam200_65White", v)} isModified={isModified("beam200_65White")} />
          <PriceInput label="Beam 200x50 PC" value={prices.beam200_65PC} onChange={(v) => update("beam200_65PC", v)} isModified={isModified("beam200_65PC")} />
          <PriceInput label="Beam 250x50 White" value={prices.beam250_65White} onChange={(v) => update("beam250_65White", v)} isModified={isModified("beam250_65White")} />
          <PriceInput label="Beam 250x50 PC" value={prices.beam250_65PC} onChange={(v) => update("beam250_65PC", v)} isModified={isModified("beam250_65PC")} />
          <PriceInput label="Post 100x100" value={prices.postHalf} onChange={(v) => update("postHalf", v)} isModified={isModified("postHalf")} />
        </div>
      </SectionCard>

      {/* Electrical & Controls */}
      <SectionCard title="Electrical & Controls" defaultOpen={false}>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <PriceInput label="Motor Assembly 24VDC" value={prices.motorAssembly} onChange={(v) => update("motorAssembly", v)} isModified={isModified("motorAssembly")} />
          <PriceInput label="Control Kit (Lights)" value={prices.controlKitLights} onChange={(v) => update("controlKitLights", v)} isModified={isModified("controlKitLights")} />
          <PriceInput label="Control Kit (No Lights)" value={prices.controlKitNoLights} onChange={(v) => update("controlKitNoLights", v)} isModified={isModified("controlKitNoLights")} />
          <PriceInput label="Remote Handset" value={prices.remoteHandset} onChange={(v) => update("remoteHandset", v)} isModified={isModified("remoteHandset")} />
          <PriceInput label="Rain Sensor Assembly" value={prices.rainSensorAssembly} onChange={(v) => update("rainSensorAssembly", v)} isModified={isModified("rainSensorAssembly")} />
          <PriceInput label="Rain Sensor Chip" value={prices.rainSensorChip} onChange={(v) => update("rainSensorChip", v)} isModified={isModified("rainSensorChip")} />
          <PriceInput label="Electrician" value={prices.electrician} onChange={(v) => update("electrician", v)} isModified={isModified("electrician")} />
          <PriceInput label="LED Light (each)" value={prices.ledLightPer} onChange={(v) => update("ledLightPer", v)} isModified={isModified("ledLightPer")} />
        </div>
      </SectionCard>

      {/* Hardware & Accessories */}
      <SectionCard title="Hardware & Accessories" defaultOpen={false}>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <PriceInput label="Pile Insert" value={prices.pileInsert} onChange={(v) => update("pileInsert", v)} isModified={isModified("pileInsert")} />
          <PriceInput label="Pin - Control Alum" value={prices.controlPin} onChange={(v) => update("controlPin", v)} isModified={isModified("controlPin")} />
          <PriceInput label="Pin - Motor End Pivot SS" value={prices.motorPin} onChange={(v) => update("motorPin", v)} isModified={isModified("motorPin")} />
          <PriceInput label="Pin - Free End Alum" value={prices.freeEndPin} onChange={(v) => update("freeEndPin", v)} isModified={isModified("freeEndPin")} />
          <PriceInput label="Internal Brackets" value={prices.internalBrackets} onChange={(v) => update("internalBrackets", v)} isModified={isModified("internalBrackets")} />
          <PriceInput label="Post to Beam Connector" value={prices.postToBeam} onChange={(v) => update("postToBeam", v)} isModified={isModified("postToBeam")} />
        </div>
      </SectionCard>

      {/* Installation & Delivery */}
      <SectionCard title="Installation & Delivery" defaultOpen={false}>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <PriceInput label="Downpipes" value={prices.downpipe} onChange={(v) => update("downpipe", v)} isModified={isModified("downpipe")} />
          <PriceInput label="Flashings" value={prices.flashings} onChange={(v) => update("flashings", v)} isModified={isModified("flashings")} />
          <PriceInput label="Freight" value={prices.freight} onChange={(v) => update("freight", v)} isModified={isModified("freight")} />
        </div>
      </SectionCard>

      {/* Bracket Pricing */}
      <SectionCard title="Bracket Pricing" defaultOpen={false}>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <PriceInput label="Fascia Bracket (each)" value={prices.fasciaBracketPrice} onChange={(v) => update("fasciaBracketPrice", v)} isModified={isModified("fasciaBracketPrice")} />
          <PriceInput label="Extenda Bracket (each)" value={prices.extendaBracketPrice} onChange={(v) => update("extendaBracketPrice", v)} isModified={isModified("extendaBracketPrice")} />
          <PriceInput label="Gable Bracket (each)" value={prices.gableBracketPrice} onChange={(v) => update("gableBracketPrice", v)} isModified={isModified("gableBracketPrice")} />
          <PriceInput label="Bracket Cover 1-5m" value={prices.bracketCover1to5m} onChange={(v) => update("bracketCover1to5m", v)} isModified={isModified("bracketCover1to5m")} />
          <PriceInput label="Bracket Cover 6-10m" value={prices.bracketCover6to10m} onChange={(v) => update("bracketCover6to10m", v)} isModified={isModified("bracketCover6to10m")} />
          <PriceInput label="Bracket Cover 11-15m" value={prices.bracketCover11to15m} onChange={(v) => update("bracketCover11to15m", v)} isModified={isModified("bracketCover11to15m")} />
          <PriceInput label="Bracket Cover 16-20m" value={prices.bracketCover16to20m} onChange={(v) => update("bracketCover16to20m", v)} isModified={isModified("bracketCover16to20m")} />
        </div>
      </SectionCard>

      {/* Commission & Margin */}
      <SectionCard title="Commission & Margin">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <div className="space-y-1">
            <Label className={`text-xs ${isModified("commissionRate") ? "text-amber-600 font-semibold" : "text-muted-foreground"}`}>
              Commission Rate % {isModified("commissionRate") && "*"}
            </Label>
            <Input type="number" value={prices.commissionRate || ""} onChange={(e) => update("commissionRate", parseFloat(e.target.value) || 0)} className="h-8 text-sm font-mono" step="0.5" />
          </div>
          <div className="space-y-1">
            <Label className={`text-xs ${isModified("margin") ? "text-amber-600 font-semibold" : "text-muted-foreground"}`}>
              Margin % {isModified("margin") && "*"}
            </Label>
            <Input type="number" value={prices.margin || ""} onChange={(e) => update("margin", parseFloat(e.target.value) || 0)} className="h-8 text-sm font-mono" step="0.5" />
          </div>
        </div>
      </SectionCard>
    </div>
  );
}
