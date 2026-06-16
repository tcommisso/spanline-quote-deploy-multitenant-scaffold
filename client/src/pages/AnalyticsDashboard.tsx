import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
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
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Area,
  AreaChart,
  ResponsiveContainer,
} from "recharts";
import {
  TrendingUp,
  DollarSign,
  FileText,
  Target,
  BarChart3,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  AlertCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useMemo } from "react";
import { isAdminRole } from "@shared/const";

const STATUS_COLORS: Record<string, string> = {
  draft: "oklch(0.65 0.05 250)",
  sent: "oklch(0.65 0.15 250)",
  accepted: "oklch(0.65 0.18 155)",
  lost: "oklch(0.65 0.18 25)",
};

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  sent: "Sent",
  accepted: "Accepted",
  lost: "Lost",
};

import { formatCurrencyShort } from "@/lib/formatCurrency";
const formatCurrency = formatCurrencyShort;

function formatMonth(ym: string): string {
  const [year, month] = ym.split("-");
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${months[parseInt(month, 10) - 1]} ${year?.slice(2)}`;
}

export default function AnalyticsDashboard() {
  const { user } = useAuth();
  const { data, isLoading, error, refetch } = trpc.analytics.dashboard.useQuery();
  const isAdmin = isAdminRole(user?.role || "");

  // Compute KPI metrics
  const kpis = useMemo(() => {
    if (!data) return null;

    const totalQuotes = data.statusBreakdown.reduce((s, r) => s + r.count, 0);
    const accepted = data.statusBreakdown.find(r => r.status === "accepted")?.count || 0;
    const lost = data.statusBreakdown.find(r => r.status === "lost")?.count || 0;
    const decided = accepted + lost;
    const conversionRate = decided > 0 ? ((accepted / decided) * 100) : 0;

    const totalPipelineValue = data.pipeline.reduce((s, p) => s + p.value, 0);
    const acceptedValue = data.pipeline.find(p => p.status === "accepted")?.value || 0;

    const avgJobValue = totalQuotes > 0 ? totalPipelineValue / totalQuotes : 0;

    // Trend: compare last 2 months of volume
    const vols = data.volumeByMonth;
    let volumeTrend: "up" | "down" | "flat" = "flat";
    if (vols.length >= 2) {
      const last = vols[vols.length - 1]!.count;
      const prev = vols[vols.length - 2]!.count;
      volumeTrend = last > prev ? "up" : last < prev ? "down" : "flat";
    }

    return {
      totalQuotes,
      conversionRate,
      avgJobValue,
      totalPipelineValue,
      acceptedValue,
      volumeTrend,
    };
  }, [data]);

  if (error) {
    return (
      <div className="space-y-8">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Analytics</h1>
          <p className="text-sm text-muted-foreground mt-1">Unable to load analytics data</p>
        </div>
        <Card>
          <CardContent className="p-8 flex flex-col items-center gap-4 text-center">
            <AlertCircle className="h-10 w-10 text-muted-foreground/50" />
            <div>
              <p className="text-sm font-medium">Something went wrong</p>
              <p className="text-xs text-muted-foreground mt-1">{error.message}</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => refetch()}>Try Again</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-8">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Analytics</h1>
          <p className="text-sm text-muted-foreground mt-1">Loading dashboard...</p>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="p-5">
                <Skeleton className="h-8 w-20" />
                <Skeleton className="h-4 w-28 mt-2" />
              </CardContent>
            </Card>
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="p-6">
                <Skeleton className="h-[240px] w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (!data || !kpis) {
    return (
      <div className="space-y-8">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Analytics</h1>
          <p className="text-sm text-muted-foreground mt-1">No data available yet.</p>
        </div>
      </div>
    );
  }

  // Chart configs
  const volumeConfig: ChartConfig = {
    count: { label: "Quotes", color: "oklch(0.65 0.18 250)" },
  };

  const valueConfig: ChartConfig = {
    avgValue: { label: "Avg Value", color: "oklch(0.65 0.18 155)" },
    totalValue: { label: "Total Value", color: "oklch(0.75 0.12 155)" },
  };

  const pipelineConfig: ChartConfig = {
    draft: { label: "Draft", color: STATUS_COLORS.draft },
    sent: { label: "Sent", color: STATUS_COLORS.sent },
    accepted: { label: "Accepted", color: STATUS_COLORS.accepted },
    lost: { label: "Lost", color: STATUS_COLORS.lost },
  };

  const adviserConfig: ChartConfig = {
    count: { label: "Quotes", color: "oklch(0.65 0.15 250)" },
    value: { label: "Value", color: "oklch(0.65 0.18 155)" },
  };

  // Prepare chart data
  const volumeData = data.volumeByMonth.map(v => ({
    month: formatMonth(v.month),
    count: v.count,
  }));

  const valueData = data.avgValueByMonth.map(v => ({
    month: formatMonth(v.month),
    avgValue: v.avgValue,
    totalValue: v.totalValue,
    count: v.count,
  }));

  const pieData = data.statusBreakdown.map(s => ({
    name: STATUS_LABELS[s.status] || s.status,
    value: s.count,
    fill: STATUS_COLORS[s.status] || "#888",
  }));

  const pipelineData = data.pipeline.map(p => ({
    status: STATUS_LABELS[p.status] || p.status,
    count: p.count,
    value: p.value,
    fill: STATUS_COLORS[p.status] || "#888",
  }));

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Analytics</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {isAdmin ? "Business performance across all design advisers" : "Your quoting performance overview"}
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          title="Total Quotes"
          value={kpis.totalQuotes.toString()}
          subtitle="All time"
          icon={FileText}
          trend={kpis.volumeTrend}
        />
        <KPICard
          title="Conversion Rate"
          value={`${kpis.conversionRate.toFixed(1)}%`}
          subtitle="Accepted / (Accepted + Lost)"
          icon={Target}
          accent={kpis.conversionRate >= 50 ? "text-emerald-600" : kpis.conversionRate >= 30 ? "text-amber-600" : "text-red-500"}
        />
        <KPICard
          title="Avg Job Value"
          value={formatCurrency(kpis.avgJobValue)}
          subtitle="Across all quotes"
          icon={DollarSign}
        />
        <KPICard
          title="Pipeline Value"
          value={formatCurrency(kpis.totalPipelineValue)}
          subtitle={`${formatCurrency(kpis.acceptedValue)} accepted`}
          icon={BarChart3}
          accent="text-emerald-600"
        />
      </div>

      {/* Charts Row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Quote Volume Over Time */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-medium">Quote Volume</CardTitle>
            <CardDescription className="text-xs">Monthly quote creation trend</CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            {volumeData.length === 0 ? (
              <div className="h-[260px] flex items-center justify-center text-sm text-muted-foreground">
                No data yet
              </div>
            ) : (
              <ChartContainer config={volumeConfig} className="h-[260px] w-full">
                <BarChart data={volumeData} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="month" tickLine={false} axisLine={false} fontSize={11} />
                  <YAxis tickLine={false} axisLine={false} fontSize={11} allowDecimals={false} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="count" fill="var(--color-count)" radius={[4, 4, 0, 0]} maxBarSize={48} />
                </BarChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>

        {/* Conversion Funnel / Status Breakdown */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-medium">Status Breakdown</CardTitle>
            <CardDescription className="text-xs">Quote distribution by status</CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            {pieData.length === 0 ? (
              <div className="h-[260px] flex items-center justify-center text-sm text-muted-foreground">
                No data yet
              </div>
            ) : (
              <div className="flex items-center gap-6 h-[260px]">
                <ChartContainer config={pipelineConfig} className="h-[220px] w-[220px] shrink-0">
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={55}
                      outerRadius={90}
                      paddingAngle={3}
                      dataKey="value"
                      nameKey="name"
                      strokeWidth={0}
                    >
                      {pieData.map((entry, i) => (
                        <Cell key={i} fill={entry.fill} />
                      ))}
                    </Pie>
                    <ChartTooltip content={<ChartTooltipContent nameKey="name" />} />
                  </PieChart>
                </ChartContainer>
                <div className="flex flex-col gap-3 flex-1">
                  {pieData.map((entry) => (
                    <div key={entry.name} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div
                          className="h-2.5 w-2.5 rounded-sm shrink-0"
                          style={{ backgroundColor: entry.fill }}
                        />
                        <span className="text-sm text-muted-foreground">{entry.name}</span>
                      </div>
                      <span className="text-sm font-medium tabular-nums">{entry.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Charts Row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Average Job Value Over Time */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-medium">Average Job Value</CardTitle>
            <CardDescription className="text-xs">Monthly average and total revenue</CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            {valueData.length === 0 ? (
              <div className="h-[260px] flex items-center justify-center text-sm text-muted-foreground">
                No data yet
              </div>
            ) : (
              <ChartContainer config={valueConfig} className="h-[260px] w-full">
                <AreaChart data={valueData} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
                  <defs>
                    <linearGradient id="avgGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--color-avgValue)" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="var(--color-avgValue)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="month" tickLine={false} axisLine={false} fontSize={11} />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    fontSize={11}
                    tickFormatter={(v: number) => formatCurrency(v)}
                  />
                  <ChartTooltip
                    content={
                      <ChartTooltipContent
                        formatter={(value, name) => {
                          const v = typeof value === "number" ? value : 0;
                          return (
                            <span className="font-mono font-medium tabular-nums">
                              {formatCurrency(v)}
                            </span>
                          );
                        }}
                      />
                    }
                  />
                  <Area
                    type="monotone"
                    dataKey="avgValue"
                    stroke="var(--color-avgValue)"
                    fill="url(#avgGradient)"
                    strokeWidth={2}
                  />
                </AreaChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>

        {/* Revenue Pipeline by Status */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-medium">Revenue Pipeline</CardTitle>
            <CardDescription className="text-xs">Total value by quote status</CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            {pipelineData.length === 0 ? (
              <div className="h-[260px] flex items-center justify-center text-sm text-muted-foreground">
                No data yet
              </div>
            ) : (
              <ChartContainer config={pipelineConfig} className="h-[260px] w-full">
                <BarChart data={pipelineData} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="status" tickLine={false} axisLine={false} fontSize={11} />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    fontSize={11}
                    tickFormatter={(v: number) => formatCurrency(v)}
                  />
                  <ChartTooltip
                    content={
                      <ChartTooltipContent
                        formatter={(value, name) => {
                          const v = typeof value === "number" ? value : 0;
                          return (
                            <span className="font-mono font-medium tabular-nums">
                              {formatCurrency(v)}
                            </span>
                          );
                        }}
                      />
                    }
                  />
                  <Bar dataKey="value" radius={[4, 4, 0, 0]} maxBarSize={64}>
                    {pipelineData.map((entry, i) => (
                      <Cell key={i} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Admin-only: Top Advisers */}
      {isAdmin && data.topAdvisersByVolume.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-medium">Top Design Advisers</CardTitle>
            <CardDescription className="text-xs">Performance by quote volume and total value</CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <ChartContainer config={adviserConfig} className="h-[260px] w-full">
              <BarChart
                data={data.topAdvisersByVolume}
                layout="vertical"
                margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" tickLine={false} axisLine={false} fontSize={11} />
                <YAxis
                  type="category"
                  dataKey="name"
                  tickLine={false}
                  axisLine={false}
                  fontSize={11}
                  width={100}
                />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="count" fill="var(--color-count)" radius={[0, 4, 4, 0]} maxBarSize={28} />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>
      )}

      {/* Design Advisor Performance Report */}
      {isAdmin && data.advisorPerformance && data.advisorPerformance.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-medium">Design Advisor Performance</CardTitle>
            <CardDescription className="text-xs">Quote volume, conversion rate, and revenue by design advisor</CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="pb-2 pr-4 font-medium text-muted-foreground text-xs">Advisor</th>
                    <th className="pb-2 pr-4 font-medium text-muted-foreground text-xs text-center">Quotes</th>
                    <th className="pb-2 pr-4 font-medium text-muted-foreground text-xs text-center">Won</th>
                    <th className="pb-2 pr-4 font-medium text-muted-foreground text-xs text-center">Lost</th>
                    <th className="pb-2 pr-4 font-medium text-muted-foreground text-xs text-center">Conversion</th>
                    <th className="pb-2 pr-4 font-medium text-muted-foreground text-xs text-right">Revenue</th>
                    <th className="pb-2 font-medium text-muted-foreground text-xs text-right">Avg Job</th>
                  </tr>
                </thead>
                <tbody>
                  {data.advisorPerformance.map((advisor, i) => (
                    <tr key={i} className="border-b last:border-0">
                      <td className="py-2.5 pr-4 font-medium">{advisor.name}</td>
                      <td className="py-2.5 pr-4 text-center tabular-nums">{advisor.totalQuotes}</td>
                      <td className="py-2.5 pr-4 text-center tabular-nums text-emerald-600">{advisor.accepted}</td>
                      <td className="py-2.5 pr-4 text-center tabular-nums text-red-500">{advisor.lost}</td>
                      <td className="py-2.5 pr-4 text-center">
                        <Badge
                          variant="outline"
                          className={`text-[10px] ${
                            advisor.conversionRate >= 50 ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
                            advisor.conversionRate >= 30 ? "bg-amber-50 text-amber-700 border-amber-200" :
                            "bg-red-50 text-red-600 border-red-200"
                          }`}
                        >
                          {advisor.conversionRate}%
                        </Badge>
                      </td>
                      <td className="py-2.5 pr-4 text-right font-mono tabular-nums">{formatCurrency(advisor.totalRevenue)}</td>
                      <td className="py-2.5 text-right font-mono tabular-nums">{formatCurrency(advisor.avgJobValue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recent Activity Table */}
      {data.recentActivity.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-medium">Recent Activity</CardTitle>
            <CardDescription className="text-xs">Latest quotes with estimated values</CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="pb-2 pr-4 font-medium text-muted-foreground text-xs">Quote</th>
                    <th className="pb-2 pr-4 font-medium text-muted-foreground text-xs">Client</th>
                    <th className="pb-2 pr-4 font-medium text-muted-foreground text-xs">Status</th>
                    <th className="pb-2 pr-4 font-medium text-muted-foreground text-xs text-right">Value</th>
                    <th className="pb-2 font-medium text-muted-foreground text-xs text-right">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recentActivity.map((item, i) => (
                    <tr key={i} className="border-b last:border-0">
                      <td className="py-2.5 pr-4 font-mono text-xs">{item.quoteNumber}</td>
                      <td className="py-2.5 pr-4">{item.clientName}</td>
                      <td className="py-2.5 pr-4">
                        <Badge
                          variant="outline"
                          className="text-[10px]"
                          style={{
                            borderColor: STATUS_COLORS[item.status],
                            color: STATUS_COLORS[item.status],
                          }}
                        >
                          {STATUS_LABELS[item.status] || item.status}
                        </Badge>
                      </td>
                      <td className="py-2.5 pr-4 text-right font-mono tabular-nums">
                        {formatCurrency(item.value)}
                      </td>
                      <td className="py-2.5 text-right text-muted-foreground text-xs">
                        {new Date(item.date).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function KPICard({
  title,
  value,
  subtitle,
  icon: Icon,
  accent,
  trend,
}: {
  title: string;
  value: string;
  subtitle: string;
  icon: any;
  accent?: string;
  trend?: "up" | "down" | "flat";
}) {
  const TrendIcon = trend === "up" ? ArrowUpRight : trend === "down" ? ArrowDownRight : Minus;
  const trendColor = trend === "up" ? "text-emerald-500" : trend === "down" ? "text-red-500" : "text-muted-foreground";

  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <p className={`text-2xl font-semibold tracking-tight tabular-nums ${accent || ""}`}>
              {value}
            </p>
            <p className="text-xs text-muted-foreground">{title}</p>
          </div>
          <div className="flex flex-col items-center gap-1">
            <div className="h-9 w-9 rounded-lg bg-muted flex items-center justify-center">
              <Icon className="h-4 w-4 text-muted-foreground" />
            </div>
            {trend && (
              <TrendIcon className={`h-3.5 w-3.5 ${trendColor}`} />
            )}
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground/70 mt-2">{subtitle}</p>
      </CardContent>
    </Card>
  );
}
