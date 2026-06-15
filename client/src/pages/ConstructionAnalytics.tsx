import { useState, useMemo, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Area,
  AreaChart,
} from "recharts";
import {
  BarChart3, PieChart as PieChartIcon, TrendingUp, DollarSign,
  Calendar, Activity, CheckCircle2, Clock, AlertTriangle, Wrench, HardHat,
} from "lucide-react";
import { PullToRefresh } from "@/components/PullToRefresh";

import { formatCurrencyShort } from "@/lib/formatCurrency";
const formatCurrency = formatCurrencyShort;

export default function ConstructionAnalytics() {
  // ─── FY Filter ──────────────────────────────────────────────────────────────
  const fysQuery = trpc.constructionClients.availableFYs.useQuery();
  const currentFy = fysQuery.data?.currentFy;
  // "unset" = user hasn't chosen yet (default to currentFy), null = user chose "All Years"
  const [fyFilter, setFyFilter] = useState<number | null | "unset">("unset");
  const activeFy = fyFilter === "unset" ? (currentFy ?? null) : fyFilter;
  const fyOptions = fysQuery.data?.years || [];

  // FY date range
  const fyStart = activeFy != null ? `${activeFy}-07-01` : undefined;
  const fyEnd = activeFy != null ? `${activeFy + 1}-06-30` : undefined;

  // ─── Queries ────────────────────────────────────────────────────────────────
  const statsQuery = trpc.construction.jobs.stats.useQuery(
    { fyStartYear: activeFy ?? undefined },
    { enabled: fyFilter === "unset" ? currentFy != null : true }
  );
  const financialSummary = trpc.constructionFinancial.summary.useQuery(
    { fyStart, fyEnd },
    { enabled: fyFilter === "unset" ? currentFy != null : true }
  );
  const healthSummary = trpc.constructionFinancial.healthSummary.useQuery();
  const jobVolumeTrend = trpc.constructionFinancial.jobVolumeTrend.useQuery();
  const financialTrend = trpc.constructionFinancial.financialTrend.useQuery();
  const statusDistribution = trpc.constructionFinancial.statusDistribution.useQuery();

  const stats = statsQuery.data;
  const financial = financialSummary.data;

  const utils = trpc.useUtils();
  const handleRefresh = useCallback(async () => {
    await Promise.all([
      utils.construction.jobs.stats.invalidate(),
      utils.constructionFinancial.summary.invalidate(),
      utils.constructionFinancial.healthSummary.invalidate(),
      utils.constructionFinancial.jobVolumeTrend.invalidate(),
      utils.constructionFinancial.financialTrend.invalidate(),
      utils.constructionFinancial.statusDistribution.invalidate(),
    ]);
  }, [utils]);

  return (
    <PullToRefresh onRefresh={handleRefresh}>
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Construction Analytics</h1>
          <p className="text-sm text-muted-foreground">
            Job status, financial trends, and performance metrics
            {activeFy != null ? ` · FY ${activeFy}-${String(activeFy + 1).slice(-2)}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-muted-foreground hidden sm:block" />
          <Select
            value={activeFy != null ? String(activeFy) : "all"}
            onValueChange={(v) => setFyFilter(v === "all" ? null : Number(v))}
          >
            <SelectTrigger className="w-[130px] sm:w-[150px]">
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

      {/* KPI Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4 pb-4 px-4">
            <div className="flex items-center gap-2 mb-1">
              <Wrench className="h-4 w-4 text-amber-500" />
              <span className="text-xs text-muted-foreground">Active Jobs</span>
            </div>
            <p className="text-2xl font-bold text-amber-600">{(stats?.inProgress || 0) + (stats?.scheduled || 0)}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{stats?.inProgress || 0} in progress, {stats?.scheduled || 0} scheduled</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4 px-4">
            <div className="flex items-center gap-2 mb-1">
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              <span className="text-xs text-muted-foreground">Completed</span>
            </div>
            <p className="text-2xl font-bold text-emerald-600">{stats?.completed || 0}</p>
            <p className="text-xs text-muted-foreground mt-0.5">of {stats?.total || 0} total jobs</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4 px-4">
            <div className="flex items-center gap-2 mb-1">
              <DollarSign className="h-4 w-4 text-blue-500" />
              <span className="text-xs text-muted-foreground">Revenue</span>
            </div>
            <p className="text-2xl font-bold">{formatCurrency(financial?.totalRevenue || 0)}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{financial?.avgMarginPercent || 0}% avg margin</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4 px-4">
            <div className="flex items-center gap-2 mb-1">
              <Activity className="h-4 w-4 text-purple-500" />
              <span className="text-xs text-muted-foreground">Completion Rate</span>
            </div>
            <p className="text-2xl font-bold">{financial?.completionRate || 0}%</p>
            <p className="text-xs text-muted-foreground mt-0.5">{stats?.onHold || 0} on hold</p>
          </CardContent>
        </Card>
      </div>

      {/* Project Health Summary */}
      {healthSummary.data && (healthSummary.data.green + healthSummary.data.amber + healthSummary.data.red) > 0 && (
        <Card className="border-none shadow-sm bg-muted/30">
          <CardContent className="py-3 px-4">
            <div className="flex items-center gap-4 flex-wrap">
              <span className="text-sm font-medium text-muted-foreground">Project Health</span>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5">
                  <span className="h-3 w-3 rounded-full bg-emerald-500 inline-block" />
                  <span className="text-sm font-semibold">{healthSummary.data.green}</span>
                  <span className="text-xs text-muted-foreground">Healthy</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="h-3 w-3 rounded-full bg-amber-500 inline-block" />
                  <span className="text-sm font-semibold">{healthSummary.data.amber}</span>
                  <span className="text-xs text-muted-foreground">Watch</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="h-3 w-3 rounded-full bg-red-500 inline-block" />
                  <span className="text-sm font-semibold">{healthSummary.data.red}</span>
                  <span className="text-xs text-muted-foreground">At Risk</span>
                </div>
              </div>
              <span className="text-xs text-muted-foreground ml-auto">Active jobs · margin thresholds: ≥45% / 35–44% / &lt;35%</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Job Status Breakdown + Financial Summary */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Job Status Breakdown */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-medium">Job Status Breakdown</CardTitle>
          </CardHeader>
          <CardContent className="pt-0 space-y-3">
            {[
              { label: "Scheduled", count: stats?.scheduled || 0, color: "bg-blue-500", total: stats?.total || 1 },
              { label: "In Progress", count: stats?.inProgress || 0, color: "bg-amber-500", total: stats?.total || 1 },
              { label: "On Hold", count: stats?.onHold || 0, color: "bg-orange-500", total: stats?.total || 1 },
              { label: "Completed", count: stats?.completed || 0, color: "bg-green-500", total: stats?.total || 1 },
            ].map((item) => (
              <div key={item.label}>
                <div className="flex items-center justify-between text-sm mb-1">
                  <span className="text-muted-foreground">{item.label}</span>
                  <span className="font-medium">{item.count}</span>
                </div>
                <div className="w-full bg-muted rounded-full h-2">
                  <div
                    className={`${item.color} rounded-full h-2 transition-all`}
                    style={{ width: `${item.total > 0 ? (item.count / item.total) * 100 : 0}%` }}
                  />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Financial Summary */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-medium">Financial Summary</CardTitle>
          </CardHeader>
          <CardContent className="pt-0 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="text-center p-3 rounded-lg bg-muted/50">
                <p className="text-lg font-semibold">{formatCurrency(financial?.totalRevenue || 0)}</p>
                <p className="text-xs text-muted-foreground">Total Revenue</p>
              </div>
              <div className="text-center p-3 rounded-lg bg-muted/50">
                <p className="text-lg font-semibold">{formatCurrency(financial?.totalCost || 0)}</p>
                <p className="text-xs text-muted-foreground">Total Cost</p>
              </div>
              <div className="text-center p-3 rounded-lg bg-muted/50">
                <p className="text-lg font-semibold text-emerald-600">{formatCurrency(financial?.totalMargin || 0)}</p>
                <p className="text-xs text-muted-foreground">Total Margin</p>
              </div>
              <div className="text-center p-3 rounded-lg bg-muted/50">
                <p className="text-lg font-semibold">{financial?.completionRate || 0}%</p>
                <p className="text-xs text-muted-foreground">Completion Rate</p>
              </div>
            </div>
            <div className="pt-2 border-t">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Invoiced</span>
                <span className="font-medium">{formatCurrency(financial?.totalInvoiced || 0)}</span>
              </div>
              <div className="flex items-center justify-between text-sm mt-1">
                <span className="text-muted-foreground">Paid</span>
                <span className="font-medium text-emerald-600">{formatCurrency(financial?.totalPaid || 0)}</span>
              </div>
              <div className="flex items-center justify-between text-sm mt-1">
                <span className="text-muted-foreground">Uninvoiced Work</span>
                <span className="font-medium text-amber-600">
                  {formatCurrency((financial?.totalRevenue || 0) - (financial?.totalInvoiced || 0))}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Trend Charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Job Volume Trend */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-medium flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-primary" />
              Job Volume Trend
            </CardTitle>
            <p className="text-xs text-muted-foreground">Monthly job creation (last 12 months)</p>
          </CardHeader>
          <CardContent className="pt-0">
            {jobVolumeTrend.isLoading ? (
              <Skeleton className="h-[200px] w-full" />
            ) : !jobVolumeTrend.data?.length ? (
              <div className="h-[200px] flex items-center justify-center text-sm text-muted-foreground">
                No trend data available yet
              </div>
            ) : (
              <ChartContainer config={{
                total: { label: "Total", color: "oklch(0.65 0.15 250)" },
                completed: { label: "Completed", color: "oklch(0.72 0.17 155)" },
                inProgress: { label: "In Progress", color: "oklch(0.75 0.15 75)" },
              }} className="h-[200px] w-full">
                <BarChart data={jobVolumeTrend.data} margin={{ top: 5, right: 5, bottom: 5, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} tickFormatter={(v: string) => {
                    const [, m] = v.split("-");
                    return ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][parseInt(m) - 1] || m;
                  }} />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="completed" stackId="a" fill="var(--color-completed)" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="inProgress" stackId="a" fill="var(--color-inProgress)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>

        {/* Status Distribution Pie */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-medium flex items-center gap-2">
              <PieChartIcon className="h-4 w-4 text-primary" />
              Status Distribution
            </CardTitle>
            <p className="text-xs text-muted-foreground">Current job status breakdown</p>
          </CardHeader>
          <CardContent className="pt-0">
            {statusDistribution.isLoading ? (
              <Skeleton className="h-[200px] w-full" />
            ) : !statusDistribution.data?.length ? (
              <div className="h-[200px] flex items-center justify-center text-sm text-muted-foreground">
                No data available
              </div>
            ) : (
              <div className="h-[200px] flex items-center">
                <ChartContainer config={{
                  scheduled: { label: "Scheduled", color: "oklch(0.65 0.15 250)" },
                  in_progress: { label: "In Progress", color: "oklch(0.75 0.15 75)" },
                  on_hold: { label: "On Hold", color: "oklch(0.70 0.15 50)" },
                  completed: { label: "Completed", color: "oklch(0.72 0.17 155)" },
                  cancelled: { label: "Cancelled", color: "oklch(0.60 0.18 25)" },
                }} className="h-[200px] w-full">
                  <PieChart>
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Pie
                      data={statusDistribution.data}
                      dataKey="count"
                      nameKey="status"
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={80}
                      paddingAngle={2}
                    >
                      {statusDistribution.data.map((entry) => {
                        const colors: Record<string, string> = {
                          scheduled: "oklch(0.65 0.15 250)",
                          in_progress: "oklch(0.75 0.15 75)",
                          on_hold: "oklch(0.70 0.15 50)",
                          completed: "oklch(0.72 0.17 155)",
                          cancelled: "oklch(0.60 0.18 25)",
                        };
                        return <Cell key={entry.status} fill={colors[entry.status] || "oklch(0.5 0 0)"} />;
                      })}
                    </Pie>
                  </PieChart>
                </ChartContainer>
                <div className="space-y-1.5 ml-2">
                  {statusDistribution.data.map((entry) => (
                    <div key={entry.status} className="flex items-center gap-2 text-xs">
                      <span className={`w-2.5 h-2.5 rounded-full ${
                        entry.status === "scheduled" ? "bg-blue-500" :
                        entry.status === "in_progress" ? "bg-amber-500" :
                        entry.status === "on_hold" ? "bg-orange-500" :
                        entry.status === "completed" ? "bg-green-500" :
                        "bg-red-500"
                      }`} />
                      <span className="text-muted-foreground capitalize">{entry.status.replace("_", " ")}</span>
                      <span className="font-medium">{entry.count}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Revenue & Cost Trend */}
        <Card className="md:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-medium flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" />
              Revenue & Cost Trend
            </CardTitle>
            <p className="text-xs text-muted-foreground">Monthly revenue, cost, and margin (last 12 months)</p>
          </CardHeader>
          <CardContent className="pt-0">
            {financialTrend.isLoading ? (
              <Skeleton className="h-[250px] w-full" />
            ) : !financialTrend.data?.length ? (
              <div className="h-[250px] flex items-center justify-center text-sm text-muted-foreground">
                No financial trend data available yet
              </div>
            ) : (
              <ChartContainer config={{
                revenue: { label: "Revenue", color: "oklch(0.65 0.15 250)" },
                cost: { label: "Cost", color: "oklch(0.60 0.18 25)" },
                margin: { label: "Margin", color: "oklch(0.72 0.17 155)" },
              }} className="h-[250px] w-full">
                <AreaChart data={financialTrend.data} margin={{ top: 5, right: 5, bottom: 5, left: 0 }}>
                  <defs>
                    <linearGradient id="gradRevenue" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--color-revenue)" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="var(--color-revenue)" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gradMargin" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--color-margin)" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="var(--color-margin)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} tickFormatter={(v: string) => {
                    const [, m] = v.split("-");
                    return ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][parseInt(m) - 1] || m;
                  }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v: number) => {
                    if (v >= 1000000) return `$${(v / 1000000).toFixed(1)}M`;
                    if (v >= 1000) return `$${(v / 1000).toFixed(0)}K`;
                    return `$${v}`;
                  }} />
                  <ChartTooltip content={<ChartTooltipContent formatter={(value) => formatCurrency(Number(value))} />} />
                  <Area type="monotone" dataKey="revenue" stroke="var(--color-revenue)" fill="url(#gradRevenue)" strokeWidth={2} />
                  <Area type="monotone" dataKey="margin" stroke="var(--color-margin)" fill="url(#gradMargin)" strokeWidth={2} />
                  <Line type="monotone" dataKey="cost" stroke="var(--color-cost)" strokeWidth={2} strokeDasharray="5 5" dot={false} />
                </AreaChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
    </PullToRefresh>
  );
}
