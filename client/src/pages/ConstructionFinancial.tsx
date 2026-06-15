import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { useLocation } from "wouter";
import {
  DollarSign, TrendingUp, TrendingDown, BarChart3, Percent,
  CheckCircle2, Receipt, CreditCard, Filter, ArrowUpDown,
  ArrowUp, ArrowDown, ExternalLink, PieChart as PieChartIcon,
  CircleDot, Calendar,
} from "lucide-react";
// Import dialogs moved to Import History page
import CollapsibleFilters from "@/components/CollapsibleFilters";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrencyShort, formatCurrencyFull } from "@/lib/formatCurrency";

// ─── Australian Financial Year Helpers ───────────────────────────────────────
function getFYRange(fy: number): { fyStart: string; fyEnd: string } {
  return {
    fyStart: `${fy}-07-01`,
    fyEnd: `${fy + 1}-06-30`,
  };
}

export default function ConstructionFinancial() {
  const [, navigate] = useLocation();
  // Dynamic FY from backend
  const fysQuery = trpc.constructionClients.availableFYs.useQuery();
  const currentFy = fysQuery.data?.currentFy;
  // Default to null (All Years) — show all non-complete jobs regardless of year
  const [fyFilter, setFyFilter] = useState<number | null>(null);
  const selectedFY = fyFilter;
  const fyOptions = fysQuery.data?.years || [];
  const [filters, setFilters] = useState<{
    branch?: string;
    roofStyle?: string;
    postcode?: string;
    constructionManagerId?: number;
  }>({});
  const [sortField, setSortField] = useState<string>("contractValue");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const fyRange = useMemo(() => selectedFY != null ? getFYRange(selectedFY) : { fyStart: undefined, fyEnd: undefined }, [selectedFY]);

  // All queries include FY date range
  const queryInput = useMemo(() => ({
    ...filters,
    fyStart: fyRange.fyStart,
    fyEnd: fyRange.fyEnd,
  }), [filters, fyRange]);

  const summaryQuery = trpc.constructionFinancial.summary.useQuery(queryInput);
  const projectsQuery = trpc.constructionFinancial.projectList.useQuery(queryInput);
  const filterOptionsQuery = trpc.constructionFinancial.filterOptions.useQuery();
  const jobVolumeTrend = trpc.constructionFinancial.jobVolumeTrend.useQuery({ fyStart: fyRange.fyStart, fyEnd: fyRange.fyEnd });
  const financialTrend = trpc.constructionFinancial.financialTrend.useQuery({ fyStart: fyRange.fyStart, fyEnd: fyRange.fyEnd });
  const statusDistribution = trpc.constructionFinancial.statusDistribution.useQuery({ fyStart: fyRange.fyStart, fyEnd: fyRange.fyEnd });

  const summary = summaryQuery.data;
  const projects = projectsQuery.data || [];
  const filterOptions = filterOptionsQuery.data;

  // Sort projects
  const sortedProjects = useMemo(() => {
    const sorted = [...projects].sort((a: any, b: any) => {
      const aVal = a[sortField] ?? 0;
      const bVal = b[sortField] ?? 0;
      if (typeof aVal === "string") return sortDir === "asc" ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      return sortDir === "asc" ? aVal - bVal : bVal - aVal;
    });
    return sorted;
  }, [projects, sortField, sortDir]);

  const toggleSort = (field: string) => {
    if (sortField === field) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else { setSortField(field); setSortDir("desc"); }
  };

  const SortIcon = ({ field }: { field: string }) => {
    if (sortField !== field) return <ArrowUpDown className="h-3 w-3 opacity-30" />;
    return sortDir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />;
  };

  const fmt = formatCurrencyFull;
  const fmtShort = formatCurrencyShort;

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header with FY Selector */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <BarChart3 className="h-7 w-7 text-primary" />
          <h1 className="text-2xl font-bold">Financial Overview</h1>
        </div>
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          <Select
            value={selectedFY != null ? String(selectedFY) : "all"}
            onValueChange={(v) => setFyFilter(v === "all" ? null : Number(v))}
          >
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Financial Year" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Years</SelectItem>
              {fyOptions.map((fy) => (
                <SelectItem key={fy.value} value={String(fy.value)}>{fy.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <SummaryCard
          title="Total Projects"
          value={String(summary?.totalProjects || 0)}
          icon={CheckCircle2}
          subtitle={`${summary?.completionRate || 0}% completed`}
        />
        <SummaryCard
          title="Total Revenue"
          value={fmtShort(summary?.totalRevenue || 0)}
          icon={DollarSign}
          subtitle="Contract values"
          color="text-blue-600"
        />
        <SummaryCard
          title="Total Margin"
          value={fmtShort(summary?.totalMargin || 0)}
          icon={summary?.totalMargin && summary.totalMargin >= 0 ? TrendingUp : TrendingDown}
          subtitle={`${summary?.avgMarginPercent || 0}% avg margin`}
          color={summary?.totalMargin && summary.totalMargin >= 0 ? "text-green-600" : "text-red-600"}
        />
        <SummaryCard
          title="Uninvoiced Work"
          value={fmtShort((summary?.totalRevenue || 0) - (summary?.totalInvoiced || 0))}
          icon={CreditCard}
          subtitle={`${fmtShort(summary?.totalInvoiced || 0)} invoiced of ${fmtShort(summary?.totalRevenue || 0)} contract`}
          color="text-amber-600"
        />
      </div>

      {/* Revenue vs Cost Bar */}
      {summary && summary.totalRevenue > 0 && (
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">Revenue vs Cost</span>
              <span className="text-sm text-muted-foreground">
                {fmtShort(summary.totalCost)} cost / {fmtShort(summary.totalRevenue)} revenue
              </span>
            </div>
            <div className="h-6 bg-muted rounded-full overflow-hidden flex">
              <div
                className="bg-red-400 h-full transition-all"
                style={{ width: `${Math.min((summary.totalCost / summary.totalRevenue) * 100, 100)}%` }}
              />
              <div
                className="bg-green-400 h-full transition-all"
                style={{ width: `${Math.max(100 - (summary.totalCost / summary.totalRevenue) * 100, 0)}%` }}
              />
            </div>
            <div className="flex justify-between mt-1 text-xs text-muted-foreground">
              <span>Cost ({((summary.totalCost / summary.totalRevenue) * 100).toFixed(1)}%)</span>
              <span>Margin ({summary.avgMarginPercent}%)</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ═══ Trend Charts ═══ */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Revenue & Cost Trend (wide) */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-medium flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" />
              Revenue & Cost Trend
            </CardTitle>
            <p className="text-xs text-muted-foreground">Monthly revenue, cost, and margin{selectedFY != null ? ` (FY ${selectedFY}-${String(selectedFY + 1).slice(-2)})` : ""}</p>
          </CardHeader>
          <CardContent className="pt-0">
            {financialTrend.isLoading ? (
              <Skeleton className="h-[220px] w-full" />
            ) : !financialTrend.data?.length ? (
              <div className="h-[220px] flex items-center justify-center text-sm text-muted-foreground">
                No financial trend data available{selectedFY != null ? ` for FY ${selectedFY}-${String(selectedFY + 1).slice(-2)}` : ""}
              </div>
            ) : (
              <ChartContainer config={{
                revenue: { label: "Revenue", color: "oklch(0.65 0.15 250)" },
                cost: { label: "Cost", color: "oklch(0.60 0.18 25)" },
                margin: { label: "Margin", color: "oklch(0.72 0.17 155)" },
              }} className="h-[220px] w-full">
                <AreaChart data={financialTrend.data} margin={{ top: 5, right: 5, bottom: 5, left: 0 }}>
                  <defs>
                    <linearGradient id="finGradRevenue" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--color-revenue)" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="var(--color-revenue)" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="finGradMargin" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--color-margin)" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="var(--color-margin)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} tickFormatter={(v: string) => {
                    const [, m] = v.split("-");
                    return ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][parseInt(m) - 1] || m;
                  }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v: number) => formatCurrencyShort(v)} />
                  <ChartTooltip content={<ChartTooltipContent formatter={(value) => fmt(Number(value))} />} />
                  <Area type="monotone" dataKey="revenue" stroke="var(--color-revenue)" fill="url(#finGradRevenue)" strokeWidth={2} />
                  <Area type="monotone" dataKey="margin" stroke="var(--color-margin)" fill="url(#finGradMargin)" strokeWidth={2} />
                  <Line type="monotone" dataKey="cost" stroke="var(--color-cost)" strokeWidth={2} strokeDasharray="5 5" dot={false} />
                </AreaChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>

        {/* Job Volume Trend */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-medium flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-primary" />
              Job Volume
            </CardTitle>
            <p className="text-xs text-muted-foreground">Monthly jobs{selectedFY != null ? ` (FY ${selectedFY}-${String(selectedFY + 1).slice(-2)})` : ""}</p>
          </CardHeader>
          <CardContent className="pt-0">
            {jobVolumeTrend.isLoading ? (
              <Skeleton className="h-[220px] w-full" />
            ) : !jobVolumeTrend.data?.length ? (
              <div className="h-[220px] flex items-center justify-center text-sm text-muted-foreground">
                No trend data available{selectedFY != null ? ` for FY ${selectedFY}-${String(selectedFY + 1).slice(-2)}` : ""}
              </div>
            ) : (
              <ChartContainer config={{
                completed: { label: "Completed", color: "oklch(0.72 0.17 155)" },
                inProgress: { label: "In Progress", color: "oklch(0.75 0.15 75)" },
              }} className="h-[220px] w-full">
                <BarChart data={jobVolumeTrend.data} margin={{ top: 5, right: 5, bottom: 5, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="month" tick={{ fontSize: 10 }} tickFormatter={(v: string) => {
                    const [, m] = v.split("-");
                    return ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][parseInt(m) - 1] || m;
                  }} />
                  <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="completed" stackId="a" fill="var(--color-completed)" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="inProgress" stackId="a" fill="var(--color-inProgress)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Margin Trend Line */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-medium flex items-center gap-2">
            <Percent className="h-4 w-4 text-primary" />
            Margin % Trend
          </CardTitle>
          <p className="text-xs text-muted-foreground">Average margin percentage per month{selectedFY != null ? ` (FY ${selectedFY}-${String(selectedFY + 1).slice(-2)})` : ""}</p>
        </CardHeader>
        <CardContent className="pt-0">
          {financialTrend.isLoading ? (
            <Skeleton className="h-[180px] w-full" />
          ) : !financialTrend.data?.length ? (
            <div className="h-[180px] flex items-center justify-center text-sm text-muted-foreground">
              No margin data available{selectedFY != null ? ` for FY ${selectedFY}-${String(selectedFY + 1).slice(-2)}` : ""}
            </div>
          ) : (
            <ChartContainer config={{
              avgMarginPercent: { label: "Avg Margin %", color: "oklch(0.72 0.17 155)" },
            }} className="h-[180px] w-full">
              <LineChart data={financialTrend.data} margin={{ top: 5, right: 5, bottom: 5, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} tickFormatter={(v: string) => {
                  const [, m] = v.split("-");
                  return ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][parseInt(m) - 1] || m;
                }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v: number) => `${v}%`} />
                <ChartTooltip content={<ChartTooltipContent formatter={(value) => `${Number(value).toFixed(1)}%`} />} />
                <Line type="monotone" dataKey="avgMarginPercent" stroke="var(--color-avgMarginPercent)" strokeWidth={2.5} dot={{ r: 4 }} activeDot={{ r: 6 }} />
              </LineChart>
            </ChartContainer>
          )}
        </CardContent>
      </Card>

      {/* Filters */}
      <CollapsibleFilters label="Filters">
        <Select
          value={filters.branch || "all"}
          onValueChange={(v) => setFilters({ ...filters, branch: v === "all" ? undefined : v })}
        >
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Branch" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Branches</SelectItem>
            {(filterOptions?.branches || []).map((b) => (
              <SelectItem key={b} value={b}>{b}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={filters.roofStyle || "all"}
          onValueChange={(v) => setFilters({ ...filters, roofStyle: v === "all" ? undefined : v })}
        >
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Roof Style" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Styles</SelectItem>
            {(filterOptions?.roofStyles || []).map((r) => (
              <SelectItem key={r} value={r}>{r}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={filters.postcode || "all"}
          onValueChange={(v) => setFilters({ ...filters, postcode: v === "all" ? undefined : v })}
        >
          <SelectTrigger className="w-[120px]">
            <SelectValue placeholder="Postcode" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            {(filterOptions?.postcodes || []).map((p) => (
              <SelectItem key={p} value={p}>{p}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {(filters.branch || filters.roofStyle || filters.postcode) && (
          <Button variant="ghost" size="sm" onClick={() => setFilters({})}>Clear Filters</Button>
        )}
      </CollapsibleFilters>

      {/* Projects Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left p-3 font-medium">Client / Job</th>
                  <th className="text-left p-3 font-medium cursor-pointer" onClick={() => toggleSort("status")}>
                    <span className="flex items-center gap-1">Status <SortIcon field="status" /></span>
                  </th>
                  <th className="text-right p-3 font-medium cursor-pointer" onClick={() => toggleSort("contractValue")}>
                    <span className="flex items-center gap-1 justify-end">Contract <SortIcon field="contractValue" /></span>
                  </th>
                  <th className="text-right p-3 font-medium cursor-pointer" onClick={() => toggleSort("totalCost")}>
                    <span className="flex items-center gap-1 justify-end">Cost <SortIcon field="totalCost" /></span>
                  </th>
                  <th className="text-right p-3 font-medium cursor-pointer" onClick={() => toggleSort("margin")}>
                    <span className="flex items-center gap-1 justify-end">Margin <SortIcon field="margin" /></span>
                  </th>
                  <th className="text-right p-3 font-medium cursor-pointer" onClick={() => toggleSort("marginPercent")}>
                    <span className="flex items-center gap-1 justify-end">% <SortIcon field="marginPercent" /></span>
                  </th>
                  <th className="text-center p-3 font-medium">Progress</th>
                  <th className="text-center p-3 font-medium">Health</th>
                  <th className="p-3 w-8"></th>
                </tr>
              </thead>
              <tbody>
                {sortedProjects.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="p-8 text-center text-muted-foreground">
                      No projects with financial data found{selectedFY != null ? ` for FY ${selectedFY}-${String(selectedFY + 1).slice(-2)}` : ""}
                    </td>
                  </tr>
                ) : (
                  sortedProjects.map((p: any) => (
                    <tr key={p.id} className="border-b hover:bg-muted/30 transition-colors">
                      <td className="p-3">
                        <div>
                          <p className="font-medium">{p.clientName}</p>
                          <p className="text-xs text-muted-foreground">{p.quoteNumber ? `#${p.quoteNumber}` : ""} {p.siteAddress}</p>
                        </div>
                      </td>
                      <td className="p-3">
                        <Badge variant="outline" className="text-[10px]">{p.status}</Badge>
                      </td>
                      <td className="p-3 text-right font-mono">{fmt(p.contractValue)}</td>
                      <td className="p-3 text-right font-mono">{fmt(p.totalCost)}</td>
                      <td className={`p-3 text-right font-mono ${p.margin >= 0 ? "text-green-600" : "text-red-600"}`}>
                        {fmt(p.margin)}
                      </td>
                      <td className={`p-3 text-right font-mono ${p.marginPercent >= 0 ? "text-green-600" : "text-red-600"}`}>
                        {p.marginPercent.toFixed(1)}%
                      </td>
                      <td className="p-3">
                        <div className="flex items-center gap-2 justify-center">
                          <Progress value={p.progressPercent} className="h-1.5 w-16" />
                          <span className="text-[10px] text-muted-foreground w-8">{p.progressPercent}%</span>
                        </div>
                      </td>
                      <td className="p-3 text-center">
                        <HealthDot marginPercent={p.marginPercent} />
                      </td>
                      <td className="p-3">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => navigate(`/construction/clients/${p.id}`)}
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Health Dot (Traffic Light) ──────────────────────────────────────────────
function HealthDot({ marginPercent }: { marginPercent: number }) {
  let color: string;
  let title: string;
  if (marginPercent >= 45) {
    color = "text-green-500";
    title = `Healthy (${marginPercent.toFixed(1)}%)`;
  } else if (marginPercent >= 35) {
    color = "text-amber-500";
    title = `Watch (${marginPercent.toFixed(1)}%)`;
  } else {
    color = "text-red-500";
    title = `At Risk (${marginPercent.toFixed(1)}%)`;
  }
  return (
    <div className="flex justify-center" title={title}>
      <CircleDot className={`h-5 w-5 ${color}`} />
    </div>
  );
}

// ─── Summary Card ────────────────────────────────────────────────────────────
function SummaryCard({
  title, value, icon: Icon, subtitle, color,
}: {
  title: string;
  value: string;
  icon: any;
  subtitle?: string;
  color?: string;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-muted-foreground">{title}</span>
          <Icon className={`h-4 w-4 ${color || "text-muted-foreground"}`} />
        </div>
        <p className={`text-2xl font-bold ${color || ""}`}>{value}</p>
        {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
      </CardContent>
    </Card>
  );
}
