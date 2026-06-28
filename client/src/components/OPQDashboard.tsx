import { useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { isAdminRole } from "@shared/const";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { DollarSign, Info } from "lucide-react";

const tabLabels: Record<string, string> = {
  roof: "Roof", channel: "Channel", beam: "Beam", post: "Post",
  gable: "Gable", cantilever: "Cantilever", carport: "Carport",
  glassroom: "Glassroom", screenroom: "Screenroom",
  lattice: "Lattice & Handrails", spacemaker: "Spacemaker",
  trades: "Trades", extras: "Extras", windows: "Windows", awnings: "Awnings",
};

export default function OPQDashboard({ quoteId }: { quoteId: number }) {
  const { user } = useAuth();
  const isAdmin = isAdminRole(user?.role || "");
  const { data: quote, isLoading: quoteLoading } = trpc.quotes.get.useQuery({ id: quoteId });
  const { data: components, isLoading: compLoading } = trpc.components.getByQuote.useQuery({ quoteId });
  const { data: skyluxEntries } = trpc.skylux.getByQuote.useQuery({ quoteId });
  const { data: eclipseEntries } = trpc.eclipse.getByQuote.useQuery({ quoteId });

  // Fetch price settings from master data
  const { data: allMasterData } = trpc.masterData.getAll.useQuery();
  const { data: financialBreakdown } = trpc.quotes.getFinancialBreakdown.useQuery({ id: quoteId });




  // Parse small job threshold from master data (other adjustments now live in SpecSheet)
  const priceSettings = useMemo(() => {
    if (!allMasterData) return { smallJobThreshold: "0" };
    const smallJobThreshold = allMasterData.find(d => d.category === "small_job_surcharge" && d.key === "threshold")?.value || "0";
    return { smallJobThreshold };
  }, [allMasterData]);



  if (quoteLoading || compLoading) return <Skeleton className="h-96 w-full" />;
  if (!quote) return <p className="text-sm text-muted-foreground">Quote not found</p>;

  // Calculate component totals
  const compTotals = (components || []).map(comp => {
    const items = (comp.lineItems as any[]) || [];
    const sell = items.reduce((s: number, i: any) => s + (i.qty || 0) * (i.sellRate || 0), 0);
    const cost = items.reduce((s: number, i: any) => s + (i.qty || 0) * (i.costRate || 0), 0);
    return { tabName: comp.tabName, included: comp.included, sell, cost };
  });

  // Skylux totals
  const skyluxSell = (skyluxEntries || []).filter(s => s.included).reduce((sum, s) => sum + parseFloat(s.sellPrice || "0"), 0);
  const skyluxCost = (skyluxEntries || []).filter(s => s.included).reduce((sum, s) => sum + parseFloat(s.baseCost || "0"), 0);

  // Eclipse totals
  const eclipseSell = (eclipseEntries || []).filter(e => e.included).reduce((sum, e) => sum + parseFloat(e.totalSell || "0"), 0);
  const eclipseCost = (eclipseEntries || []).filter(e => e.included).reduce((sum, e) => sum + parseFloat(e.totalCost || "0"), 0);

  // Subtotal from components
  const componentsSell = compTotals.filter(c => c.included).reduce((s, c) => s + c.sell, 0);
  const componentsCost = compTotals.filter(c => c.included).reduce((s, c) => s + c.cost, 0);

  const subtotalSell = componentsSell + skyluxSell + eclipseSell;
  const subtotalCost = componentsCost + skyluxCost + eclipseCost;

  // Checklist pricing total (from spec sheet selections)
  const checklistPricingTotal = Array.isArray((quote as any)?.specChecklistSelections)
    ? ((quote as any).specChecklistSelections as Array<{ total: number }>).reduce((sum, s) => sum + (s.total || 0), 0)
    : 0;

  // Adjustments calculation (read from saved quote values)
  const delivery = parseFloat(quote.deliveryAmount || "0");
  const travel = parseFloat(quote.travelAllowance || "0");
  const constMgmtPct = parseFloat((quote as any).constructionMgmtPercent || "0") / 100;
  const complexity = parseFloat(quote.complexityLoading || "0") / 100;
  const discount = parseFloat(quote.discountPercent || "0") / 100;
  const council = parseFloat(quote.councilFees || "0");
  const warranty = parseFloat(quote.homeWarranty || "0");
  const professionalCost = parseFloat((quote as any).otherCost || "0");

  // Small job surcharge: apply % if subtotal < threshold
  const smallJobThreshold = parseFloat(priceSettings.smallJobThreshold || "0");
  const smallJobPct = parseFloat(quote.smallJobSurcharge || "0") / 100;
  const smallJobApplies = smallJobThreshold > 0 && subtotalSell < smallJobThreshold;
  const smallJobAmount = smallJobApplies ? subtotalSell * smallJobPct : 0;

  const adjustedSell = subtotalSell + delivery + travel + smallJobAmount + checklistPricingTotal + professionalCost;
  const afterConstMgmt = adjustedSell * (1 + constMgmtPct);
  const afterComplexity = afterConstMgmt * (1 + complexity);
  const afterDiscount = afterComplexity * (1 - discount);
  const grandTotalExGst = afterDiscount + council + warranty;
  const gst = grandTotalExGst * 0.1;
  const grandTotalIncGst = grandTotalExGst + gst;

  const overallMargin = grandTotalExGst > 0 ? ((grandTotalExGst - subtotalCost) / grandTotalExGst) * 100 : 0;
  const grossProfit = grandTotalExGst - subtotalCost;


  return (
    <div className="space-y-6">
      {/* Summary Cards — admin-only financials */}
      {isAdmin && (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <SummaryCard title="Grand Total (inc GST)" value={grandTotalIncGst} icon={DollarSign} accent />
        <SummaryCard title="Total ex GST" value={grandTotalExGst} />
        <SummaryCard title="Gross Profit" value={grossProfit} positive={grossProfit > 0} />
        <SummaryCard title="Overall Margin" value={overallMargin} isPercent positive={overallMargin > 30} />
      </div>
      )}




      {/* Calculation Breakdown Panel — admin-only */}
      {isAdmin && financialBreakdown && (
        <Card className="border-blue-200/50 bg-blue-50/30 dark:border-blue-900/30 dark:bg-blue-950/10">
          <CardHeader className="pb-3 flex flex-row items-center gap-2">
            <Info className="h-4 w-4 text-blue-600" />
            <CardTitle className="text-sm font-medium text-blue-900 dark:text-blue-100">Calculation Breakdown</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-xs">
            {/* Complexity */}
            {financialBreakdown.complexity && financialBreakdown.complexity.criteria.length > 0 && (
              <div>
                <p className="font-medium text-muted-foreground mb-1">Complexity Loading ({financialBreakdown.complexity.total}%)</p>
                <div className="pl-3 space-y-0.5">
                  {financialBreakdown.complexity.criteria.map((c: any, i: number) => (
                    <p key={i} className="text-muted-foreground">{c.name}: +{c.rate}%</p>
                  ))}
                </div>
              </div>
            )}
            {/* Construction Mgmt */}
            {financialBreakdown.constructionMgmt && financialBreakdown.constructionMgmt.percent > 0 && (
              <div>
                <p className="font-medium text-muted-foreground mb-1">Construction Mgmt ({financialBreakdown.constructionMgmt.percent}%)</p>
                <div className="pl-3 space-y-0.5">
                  <p className="text-muted-foreground">Roof shape: {financialBreakdown.constructionMgmt.roofShape || 'N/A'}</p>
                </div>
              </div>
            )}
            {/* Delivery */}
            {financialBreakdown.delivery && financialBreakdown.delivery.total > 0 && (
              <div>
                <p className="font-medium text-muted-foreground mb-1">Delivery (${financialBreakdown.delivery.total.toFixed(2)})</p>
                <div className="pl-3 space-y-0.5">
                  <p className="text-muted-foreground">Distance: {financialBreakdown.delivery.distanceKm}km</p>
                  <p className="text-muted-foreground">Rate: ${financialBreakdown.delivery.ratePerKm}/km</p>
                  <p className="text-muted-foreground">Factor: ×{financialBreakdown.delivery.factorTier}</p>
                  <p className="text-muted-foreground">Calc: {financialBreakdown.delivery.distanceKm}km × ${financialBreakdown.delivery.ratePerKm} × {financialBreakdown.delivery.factorTier} = ${financialBreakdown.delivery.total.toFixed(2)}</p>
                </div>
              </div>
            )}
            {/* Small Job */}
            {financialBreakdown.smallJob && (
              <div>
                <p className="font-medium text-muted-foreground mb-1">Small Job Surcharge {financialBreakdown.smallJob.applied ? <Badge variant="secondary" className="text-[9px] ml-1">Applied</Badge> : <Badge variant="outline" className="text-[9px] ml-1">Not Applied</Badge>}</p>
                <div className="pl-3 space-y-0.5">
                  <p className="text-muted-foreground">Threshold: ${financialBreakdown.smallJob.threshold?.toLocaleString()}</p>
                  <p className="text-muted-foreground">Subtotal: ${financialBreakdown.smallJob.subtotal?.toFixed(2)} {financialBreakdown.smallJob.applied ? '(below threshold)' : '(above threshold)'}</p>
                  {financialBreakdown.smallJob.applied && <p className="text-muted-foreground">Surcharge: ${financialBreakdown.smallJob.surcharge?.toFixed(2)}</p>}
                </div>
              </div>
            )}
            {!financialBreakdown.complexity?.criteria?.length && !financialBreakdown.constructionMgmt?.percent && !financialBreakdown.delivery?.total && !financialBreakdown.smallJob?.applied && (
              <p className="text-muted-foreground italic">No automatic calculations applied. Use "Recalculate All" to refresh.</p>
            )}
          </CardContent>
        </Card>
      )}



    </div>
  );
}

function SummaryCard({ title, value, icon: Icon, accent, isPercent, positive }: {
  title: string; value: number; icon?: any; accent?: boolean; isPercent?: boolean; positive?: boolean;
}) {
  return (
    <Card className={accent ? "border-primary/30 bg-primary/5" : ""}>
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground mb-1">{title}</p>
        <p className={`text-xl font-semibold tracking-tight font-mono ${accent ? "text-primary" : positive !== undefined ? (positive ? "text-emerald-600" : "text-destructive") : ""}`}>
          {isPercent ? `${value.toFixed(1)}%` : `$${value.toFixed(2)}`}
        </p>
      </CardContent>
    </Card>
  );
}

function AdjLine({ label, value, bold }: { label: string; value: number; bold?: boolean }) {
  return (
    <div className={`flex justify-between py-1 ${bold ? "font-medium" : ""}`}>
      <span className="text-muted-foreground">{label}</span>
      <span className={`font-mono ${value < 0 ? "text-destructive" : ""}`}>
        {value < 0 ? "-" : ""}${Math.abs(value).toFixed(2)}
      </span>
    </div>
  );
}

