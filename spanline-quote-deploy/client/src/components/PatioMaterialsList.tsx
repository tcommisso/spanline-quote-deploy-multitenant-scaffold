import { useCallback, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Package, DollarSign, Download } from "lucide-react";
import { trpc } from "@/lib/trpc";
import type { RoofStyle } from "./PatioStructureOverlay";
import type { ColorbondColour } from "@/lib/colorbondColours";
import type { PatioElement } from "./PatioElementLibrary";

interface PatioMaterialsListProps {
  structureState: {
    roofStyle: RoofStyle;
    width: number;
    projection: number;
    roofPitch: number;
    beamHeight: number;
    postHeight: number;
    floorToGround: number;
    postCount: number;
  };
  colours: {
    roof: ColorbondColour;
    beam: ColorbondColour;
    post: ColorbondColour;
    gutter: ColorbondColour;
    fascia: ColorbondColour;
  };
  elements: PatioElement[];
  gutterStyle?: "none" | "quad" | "half-round" | "fascia";
  downpipeStyle?: "none" | "round" | "square";
  projectName?: string;
}

interface MaterialItem {
  category: string;
  description: string;
  colour: string;
  quantity: number;
  unit: string;
  size?: string;
  /** Product code used to match against product rates */
  productCode?: string;
  /** Quantity in the product's native UOM (e.g. metres) for pricing */
  pricingQty?: number;
  pricingUom?: string;
}

/** Map gutter style to product code */
const GUTTER_PRODUCT_CODE: Record<string, string> = {
  quad: "GUT-QUAD",
  "half-round": "GUT-HALF",
  fascia: "GUT-FASC",
};

/** Map downpipe style to product code */
const DOWNPIPE_PRODUCT_CODE: Record<string, string> = {
  round: "DP-RND90",
  square: "DP-SQ100",
};

export default function PatioMaterialsList({
  structureState,
  colours,
  elements,
  gutterStyle = "quad",
  downpipeStyle = "round",
  projectName,
}: PatioMaterialsListProps) {
  // Fetch guttering product rates for pricing
  const { data: gutteringRates } = trpc.products.getRatesForTab.useQuery(
    { tabName: "guttering" },
    { staleTime: 60_000 }
  );

  // Build a productCode → rate lookup from the guttering rates
  const ratesByCode = useMemo(() => {
    if (!gutteringRates) return {};
    const map: Record<string, { costRate: number; sellRate: number; name: string; uom: string }> = {};
    for (const [, rate] of Object.entries(gutteringRates)) {
      const r = rate as { costRate: number; sellRate: number; name: string; uom: string };
      // Derive product code from name for matching
      if (r.name.includes("Quad Gutter")) map["GUT-QUAD"] = r;
      else if (r.name.includes("Half Round Gutter")) map["GUT-HALF"] = r;
      else if (r.name.includes("Fascia Gutter")) map["GUT-FASC"] = r;
      else if (r.name.includes("90mm Round")) map["DP-RND90"] = r;
      else if (r.name.includes("100mm Square")) map["DP-SQ100"] = r;
      else if (r.name.includes("Gutter Bracket")) map["GUT-BRKT"] = r;
      else if (r.name.includes("Gutter Stop End")) map["GUT-STOP"] = r;
      else if (r.name.includes("Gutter Joiner")) map["GUT-JNTR"] = r;
      else if (r.name.includes("Downpipe Elbow")) map["DP-ELBOW"] = r;
      else if (r.name.includes("Downpipe Shoe")) map["DP-SHOE"] = r;
    }
    return map;
  }, [gutteringRates]);

  const materials = useMemo(() => {
    const items: MaterialItem[] = [];

    // ─── Roofing ─────────────────────────────────────────────────────────────
    const roofSheetLength = structureState.projection / 1000 / Math.cos((structureState.roofPitch * Math.PI) / 180);
    const sheetWidth = 0.762; // standard Colorbond sheet cover width in metres
    const sheetCount = Math.ceil((structureState.width / 1000) / sheetWidth);

    items.push({
      category: "Roofing",
      description: "Roof Sheets",
      colour: colours.roof,
      quantity: sheetCount,
      unit: "sheets",
      size: `${(roofSheetLength * 1000).toFixed(0)}mm long`,
    });

    // Ridge cap for gable/hip
    if (structureState.roofStyle === "gable" || structureState.roofStyle === "hip") {
      items.push({
        category: "Roofing",
        description: "Ridge Cap",
        colour: colours.roof,
        quantity: Math.ceil((structureState.width / 1000) / 2.4),
        unit: "pcs",
        size: "2400mm",
      });
    }

    // Barge capping
    items.push({
      category: "Roofing",
      description: "Barge Capping",
      colour: colours.roof,
      quantity: 2,
      unit: "pcs",
      size: `${(roofSheetLength * 1000).toFixed(0)}mm`,
    });

    // ─── Gutters ─────────────────────────────────────────────────────────────
    const gutterRuns = structureState.roofStyle === "gable" || structureState.roofStyle === "hip" ? 2 : 1;
    const gutterLengthM = (structureState.width / 1000) * gutterRuns;

    if (gutterStyle !== "none") {
      const gutterLabels: Record<string, string> = {
        quad: "Quad Gutter 115mm",
        "half-round": "Half Round Gutter 115mm",
        fascia: "Fascia Gutter 125mm",
      };
      items.push({
        category: "Guttering",
        description: gutterLabels[gutterStyle] || "Quad Gutter 115mm",
        colour: colours.gutter,
        quantity: gutterRuns,
        unit: gutterRuns === 1 ? "run" : "runs",
        size: `${structureState.width}mm`,
        productCode: GUTTER_PRODUCT_CODE[gutterStyle],
        pricingQty: gutterLengthM,
        pricingUom: "m",
      });

      // Gutter brackets (1 per 600mm)
      const bracketCount = Math.ceil((structureState.width / 600)) * gutterRuns;
      items.push({
        category: "Guttering",
        description: "Gutter Brackets",
        colour: "-",
        quantity: bracketCount,
        unit: "ea",
        productCode: "GUT-BRKT",
        pricingQty: bracketCount,
        pricingUom: "ea",
      });

      // Stop ends (2 per gutter run)
      items.push({
        category: "Guttering",
        description: "Gutter Stop Ends",
        colour: colours.gutter,
        quantity: gutterRuns * 2,
        unit: "ea",
        productCode: "GUT-STOP",
        pricingQty: gutterRuns * 2,
        pricingUom: "ea",
      });
    }

    if (downpipeStyle !== "none") {
      const dpLabels: Record<string, string> = {
        round: "90mm Round Downpipe",
        square: "100mm Square Downpipe",
      };
      // Downpipe length = post height in metres × number of downpipes
      const dpCount = gutterRuns * 2;
      const dpLengthEach = structureState.postHeight / 1000;
      items.push({
        category: "Guttering",
        description: dpLabels[downpipeStyle] || "90mm Round Downpipe",
        colour: colours.gutter,
        quantity: dpCount,
        unit: "pcs",
        size: `${structureState.postHeight}mm long`,
        productCode: DOWNPIPE_PRODUCT_CODE[downpipeStyle],
        pricingQty: dpCount * dpLengthEach,
        pricingUom: "m",
      });

      // Downpipe elbows (2 per downpipe)
      items.push({
        category: "Guttering",
        description: "Downpipe Elbows",
        colour: colours.gutter,
        quantity: dpCount * 2,
        unit: "ea",
        productCode: "DP-ELBOW",
        pricingQty: dpCount * 2,
        pricingUom: "ea",
      });

      // Downpipe shoes (1 per downpipe)
      items.push({
        category: "Guttering",
        description: "Downpipe Shoe/Outlets",
        colour: colours.gutter,
        quantity: dpCount,
        unit: "ea",
        productCode: "DP-SHOE",
        pricingQty: dpCount,
        pricingUom: "ea",
      });
    }

    // ─── Fascia ──────────────────────────────────────────────────────────────
    items.push({
      category: "Fascia",
      description: "Fascia Board",
      colour: colours.fascia,
      quantity: gutterRuns,
      unit: "lengths",
      size: `${structureState.width}mm × 150mm`,
    });

    // ─── Beams ───────────────────────────────────────────────────────────────
    items.push({
      category: "Structural",
      description: "Main Beam",
      colour: colours.beam,
      quantity: 1,
      unit: "pc",
      size: `${structureState.width}mm`,
    });

    const rafterCount = Math.ceil(structureState.width / 1200);
    items.push({
      category: "Structural",
      description: "Rafters",
      colour: colours.beam,
      quantity: rafterCount,
      unit: "pcs",
      size: `${structureState.projection}mm`,
    });

    // ─── Posts ───────────────────────────────────────────────────────────────
    items.push({
      category: "Structural",
      description: "Posts",
      colour: colours.post,
      quantity: structureState.postCount,
      unit: "pcs",
      size: `${structureState.postHeight}mm × 90×90mm SHS`,
    });

    items.push({
      category: "Structural",
      description: "Post Footings (concrete)",
      colour: "-",
      quantity: structureState.postCount,
      unit: "pcs",
      size: "450mm × 450mm × 600mm deep",
    });

    // ─── Fixings ─────────────────────────────────────────────────────────────
    items.push({
      category: "Fixings",
      description: "Roof Screws (Type 17)",
      colour: colours.roof,
      quantity: sheetCount * 8,
      unit: "pcs",
      size: "12-14×50mm",
    });

    items.push({
      category: "Fixings",
      description: "Beam Brackets",
      colour: "-",
      quantity: structureState.postCount,
      unit: "pcs",
      size: "Post-to-beam",
    });

    // ─── Windows & Doors ─────────────────────────────────────────────────────
    elements.forEach((el) => {
      items.push({
        category: "Windows & Doors",
        description: el.label,
        colour: "-",
        quantity: 1,
        unit: "pc",
        size: `${el.width}mm × ${el.height}mm`,
      });

      if (el.screen !== "N/A") {
        items.push({
          category: "Windows & Doors",
          description: `${el.screen} Screen for ${el.label}`,
          colour: "-",
          quantity: 1,
          unit: "pc",
          size: `${el.width}mm × ${el.height}mm`,
        });
      }
    });

    return items;
  }, [structureState, colours, elements, gutterStyle, downpipeStyle]);

  // Group by category
  const grouped = useMemo(() => {
    const groups: Record<string, MaterialItem[]> = {};
    materials.forEach((item) => {
      if (!groups[item.category]) groups[item.category] = [];
      groups[item.category].push(item);
    });
    return groups;
  }, [materials]);

  const totalItems = materials.reduce((sum, m) => sum + m.quantity, 0);

  // Calculate guttering cost subtotal
  const gutteringCostTotal = useMemo(() => {
    let total = 0;
    for (const item of materials) {
      if (!item.productCode) continue;
      const rate = ratesByCode[item.productCode];
      if (!rate) continue;
      const qty = item.pricingQty ?? item.quantity;
      total += qty * rate.costRate;
    }
    return total;
  }, [materials, ratesByCode]);

  const gutteringSellTotal = useMemo(() => {
    let total = 0;
    for (const item of materials) {
      if (!item.productCode) continue;
      const rate = ratesByCode[item.productCode];
      if (!rate) continue;
      const qty = item.pricingQty ?? item.quantity;
      total += qty * rate.sellRate;
    }
    return total;
  }, [materials, ratesByCode]);

  const hasRates = Object.keys(ratesByCode).length > 0;

  // ─── CSV Export ──────────────────────────────────────────────────────────
  const handleExportCsv = useCallback(() => {
    const headers = ["Category", "Description", "Size", "Colour", "Qty", "Unit", "Cost ($)", "Sell ($)"];
    const rows: string[][] = [];

    for (const item of materials) {
      const rate = item.productCode ? ratesByCode[item.productCode] : null;
      const pricingQty = item.pricingQty ?? item.quantity;
      const costTotal = rate ? (pricingQty * rate.costRate).toFixed(2) : "";
      const sellTotal = rate ? (pricingQty * rate.sellRate).toFixed(2) : "";

      rows.push([
        item.category,
        item.description,
        item.size || "",
        item.colour === "-" ? "" : item.colour,
        String(item.quantity),
        item.unit,
        costTotal,
        sellTotal,
      ]);
    }

    // Add summary rows
    if (hasRates && gutteringCostTotal > 0) {
      rows.push([]);
      rows.push(["SUMMARY", "", "", "", "", "", "", ""]);
      rows.push(["Guttering Material Cost", "", "", "", "", "", gutteringCostTotal.toFixed(2), ""]);
      rows.push(["Guttering Sell Price", "", "", "", "", "", "", gutteringSellTotal.toFixed(2)]);
    }

    // Build CSV string
    const escapeCsvField = (field: string) => {
      if (field.includes(",") || field.includes('"') || field.includes("\n")) {
        return `"${field.replace(/"/g, '""')}"`;
      }
      return field;
    };

    const csvContent = [
      headers.map(escapeCsvField).join(","),
      ...rows.map(row => row.map(escapeCsvField).join(",")),
    ].join("\n");

    // Trigger download
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    const slug = projectName
      ? projectName.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase()
      : "patio";
    link.download = `${slug}-materials-estimate-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [materials, ratesByCode, hasRates, gutteringCostTotal, gutteringSellTotal, projectName]);

  return (
    <Card>
      <CardHeader className="py-2 px-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-xs flex items-center gap-1.5">
            <Package className="h-3.5 w-3.5" />
            Materials List
          </CardTitle>
          <div className="flex items-center gap-1.5">
            <Badge variant="secondary" className="text-[9px]">
              {totalItems} items
            </Badge>
            <Button
              variant="ghost"
              size="icon"
              className="h-5 w-5"
              onClick={handleExportCsv}
              title="Export as CSV"
            >
              <Download className="h-3 w-3" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="px-3 pb-3">
        <div className="space-y-3 max-h-[400px] overflow-y-auto">
          {Object.entries(grouped).map(([category, items]) => {
            const showPricing = category === "Guttering" && hasRates;
            return (
              <div key={category}>
                <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">
                  {category}
                </h4>
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="text-[9px] h-6 py-0">Item</TableHead>
                      <TableHead className="text-[9px] h-6 py-0">Size</TableHead>
                      <TableHead className="text-[9px] h-6 py-0">Colour</TableHead>
                      <TableHead className="text-[9px] h-6 py-0 text-right">Qty</TableHead>
                      {showPricing && (
                        <>
                          <TableHead className="text-[9px] h-6 py-0 text-right">Cost</TableHead>
                          <TableHead className="text-[9px] h-6 py-0 text-right">Sell</TableHead>
                        </>
                      )}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((item, idx) => {
                      const rate = item.productCode ? ratesByCode[item.productCode] : null;
                      const pricingQty = item.pricingQty ?? item.quantity;
                      const costTotal = rate ? pricingQty * rate.costRate : null;
                      const sellTotal = rate ? pricingQty * rate.sellRate : null;

                      return (
                        <TableRow key={idx} className="hover:bg-muted/30">
                          <TableCell className="text-[10px] py-1 font-medium">{item.description}</TableCell>
                          <TableCell className="text-[10px] py-1 text-muted-foreground">{item.size || "-"}</TableCell>
                          <TableCell className="text-[10px] py-1">
                            {item.colour !== "-" ? (
                              <Badge variant="outline" className="text-[8px] py-0 px-1">
                                {item.colour}
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>
                          <TableCell className="text-[10px] py-1 text-right font-mono">
                            {item.quantity} {item.unit}
                          </TableCell>
                          {showPricing && (
                            <>
                              <TableCell className="text-[10px] py-1 text-right font-mono">
                                {costTotal !== null ? `$${costTotal.toFixed(2)}` : "-"}
                              </TableCell>
                              <TableCell className="text-[10px] py-1 text-right font-mono">
                                {sellTotal !== null ? `$${sellTotal.toFixed(2)}` : "-"}
                              </TableCell>
                            </>
                          )}
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            );
          })}
        </div>

        {/* Guttering cost summary */}
        {hasRates && gutteringCostTotal > 0 && (
          <div className="mt-3 pt-2 border-t border-border">
            <div className="flex items-center gap-1.5 mb-1">
              <DollarSign className="h-3 w-3 text-muted-foreground" />
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                Guttering Cost Summary
              </span>
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
              <span className="text-[10px] text-muted-foreground">Material Cost:</span>
              <span className="text-[10px] font-mono text-right">${gutteringCostTotal.toFixed(2)}</span>
              <span className="text-[10px] text-muted-foreground">Sell Price:</span>
              <span className="text-[10px] font-mono text-right font-semibold">${gutteringSellTotal.toFixed(2)}</span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
