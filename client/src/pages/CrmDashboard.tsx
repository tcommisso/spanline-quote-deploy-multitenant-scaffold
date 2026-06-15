import { useState, useMemo, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { HelpLink } from "@/components/HelpLink";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useLocation } from "wouter";
import { Users, TrendingUp, DollarSign, FileText, Target, Clock, Building2, CalendarRange, ChevronDown, ChevronUp, UserCheck } from "lucide-react";
import { PullToRefresh } from "@/components/PullToRefresh";
import { Area, AreaChart, Bar, BarChart, PieChart, Pie, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend, CartesianGrid } from "recharts";

const STATUS_COLORS: Record<string, string> = {
  new: "bg-blue-100 text-blue-800",
  assigned: "bg-purple-100 text-purple-800",
  appointment_set: "bg-indigo-100 text-indigo-800",
  quoted: "bg-amber-100 text-amber-800",
  contract: "bg-green-100 text-green-800",
  building_authority: "bg-teal-100 text-teal-800",
  construction: "bg-orange-100 text-orange-800",
  completed: "bg-emerald-100 text-emerald-800",
  cancelled: "bg-red-100 text-red-800",
};

const STATUS_LABELS: Record<string, string> = {
  new: "New",
  assigned: "Assigned",
  appointment_set: "Appointment Set",
  quoted: "Quoted",
  contract: "Contract",
  building_authority: "Approvals",
  construction: "Construction",
  completed: "Completed",
  cancelled: "Cancelled",
};

// ─── Australian Financial Year helpers ──────────────────────────────────────
function getCurrentFY(): number {
  const now = new Date();
  const month = now.getMonth();
  const year = now.getFullYear();
  return month >= 6 ? year + 1 : year;
}

function getFYRange(fy: number): { fyStart: string; fyEnd: string } {
  return {
    fyStart: `${fy - 1}-07-01T00:00:00.000Z`,
    fyEnd: `${fy}-06-30T23:59:59.999Z`,
  };
}

function getFYOptions(): number[] {
  const current = getCurrentFY();
  const options: number[] = [];
  for (let y = current + 1; y >= current - 5; y--) {
    options.push(y);
  }
  return options;
}

const MONTH_NAMES = [
  "July", "August", "September", "October", "November", "December",
  "January", "February", "March", "April", "May", "June",
];

function getMonthRange(fy: number, monthIndex: number): { fyStart: string; fyEnd: string } {
  const year = monthIndex < 6 ? fy - 1 : fy;
  const month = monthIndex < 6 ? monthIndex + 7 : monthIndex - 5;
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 0, 23, 59, 59, 999);
  return {
    fyStart: start.toISOString(),
    fyEnd: end.toISOString(),
  };
}

// ─── Mini Sparkline component ───────────────────────────────────────────────
function Sparkline({ data, dataKey, color, height = 32 }: { data: any[]; dataKey: string; color: string; height?: number }) {
  if (!data || data.length === 0) return null;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id={`spark-${dataKey}-${color.replace('#','')}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.3} />
            <stop offset="100%" stopColor={color} stopOpacity={0.05} />
          </linearGradient>
        </defs>
        <Tooltip
          contentStyle={{ fontSize: 11, padding: '4px 8px', borderRadius: 6, background: 'hsl(var(--popover))', color: 'hsl(var(--popover-foreground))', border: '1px solid hsl(var(--border))' }}
          labelStyle={{ fontSize: 10, fontWeight: 600 }}
          formatter={(value: number) => {
            if (dataKey === 'revenue') return [`$${Math.round(value / 1000).toLocaleString()}k`, 'Revenue'];
            if (dataKey === 'conversion') return [`${value}%`, 'Conversion'];
            return [value.toLocaleString(), dataKey.charAt(0).toUpperCase() + dataKey.slice(1)];
          }}
          labelFormatter={(label) => label}
        />
        <Area
          type="monotone"
          dataKey={dataKey}
          stroke={color}
          strokeWidth={1.5}
          fill={`url(#spark-${dataKey}-${color.replace('#','')})`}
          dot={false}
          activeDot={{ r: 2, strokeWidth: 0 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export default function CrmDashboard() {
  const [, navigate] = useLocation();
  const [selectedFY, setSelectedFY] = useState<number>(getCurrentFY);
  const [selectedMonth, setSelectedMonth] = useState<string>("all");
  const [selectedDA, setSelectedDA] = useState<string>("all");
  const [selectedBranch, setSelectedBranch] = useState<string>("all");
  const [showAllContracts, setShowAllContracts] = useState(false);

  const { data: designAdvisors } = trpc.designAdvisors.list.useQuery({});
  const { data: branchesList } = trpc.branches.list.useQuery();

  const fyRange = useMemo(() => {
    if (selectedMonth !== "all") {
      return getMonthRange(selectedFY, Number(selectedMonth));
    }
    return getFYRange(selectedFY);
  }, [selectedFY, selectedMonth]);

  const prevFyRange = useMemo(() => {
    if (selectedMonth !== "all") {
      return getMonthRange(selectedFY - 1, Number(selectedMonth));
    }
    return getFYRange(selectedFY - 1);
  }, [selectedFY, selectedMonth]);

  const fyInput = useMemo(() => ({
    fyStart: fyRange.fyStart,
    fyEnd: fyRange.fyEnd,
    designAdvisor: selectedDA !== "all" ? selectedDA : undefined,
    branchId: selectedBranch !== "all" ? Number(selectedBranch) : undefined,
  }), [fyRange, selectedDA, selectedBranch]);

  const prevFyInput = useMemo(() => ({
    fyStart: prevFyRange.fyStart,
    fyEnd: prevFyRange.fyEnd,
    designAdvisor: selectedDA !== "all" ? selectedDA : undefined,
    branchId: selectedBranch !== "all" ? Number(selectedBranch) : undefined,
  }), [prevFyRange, selectedDA, selectedBranch]);

  const { data: kpis, isLoading: kpisLoading } = trpc.crm.dashboard.kpis.useQuery(fyInput);
  const { data: prevKpis } = trpc.crm.dashboard.kpis.useQuery(prevFyInput);
  const { data: recentLeads, isLoading: leadsLoading } = trpc.crm.dashboard.recentLeads.useQuery(fyInput);
  const contractedSalesInput = useMemo(() => ({
    ...fyInput,
    limit: showAllContracts ? 9999 : 50,
  }), [fyInput, showAllContracts]);
  const { data: contractedSales, isLoading: contractedSalesLoading } = trpc.crm.dashboard.contractedSales.useQuery(contractedSalesInput);
  const { data: branchPerf } = trpc.crm.dashboard.branchPerformance.useQuery(fyInput);

  // New queries for adviser performance and monthly trends
  const adviserPerfInput = useMemo(() => ({
    fyStart: fyRange.fyStart,
    fyEnd: fyRange.fyEnd,
    branchId: selectedBranch !== "all" ? Number(selectedBranch) : undefined,
  }), [fyRange, selectedBranch]);
  const { data: adviserPerf } = trpc.crm.dashboard.adviserPerformance.useQuery(adviserPerfInput);
  const { data: adviserTimeToClose } = trpc.crm.dashboard.adviserTimeToClose.useQuery(adviserPerfInput);
  const { data: leadSourceBreakdown } = trpc.crm.dashboard.leadSourceBreakdown.useQuery(fyInput);
  const { data: outcomeBreakdown } = trpc.crm.dashboard.outcomeBreakdown.useQuery(fyInput);

  const monthlyTrendsInput = useMemo(() => ({
    fy: selectedFY,
    designAdvisor: selectedDA !== "all" ? selectedDA : undefined,
    branchId: selectedBranch !== "all" ? Number(selectedBranch) : undefined,
  }), [selectedFY, selectedDA, selectedBranch]);
  const { data: monthlyTrends } = trpc.crm.dashboard.monthlyTrends.useQuery(monthlyTrendsInput);

  const utils = trpc.useUtils();
  const handleRefresh = useCallback(async () => {
    await Promise.all([
      utils.crm.dashboard.kpis.invalidate(),
      utils.crm.dashboard.recentLeads.invalidate(),
      utils.crm.dashboard.contractedSales.invalidate(),
      utils.crm.dashboard.branchPerformance.invalidate(),
      utils.crm.dashboard.adviserPerformance.invalidate(),
      utils.crm.dashboard.adviserTimeToClose.invalidate(),
      utils.crm.dashboard.leadSourceBreakdown.invalidate(),
      utils.crm.dashboard.monthlyTrends.invalidate(),
    ]);
  }, [utils]);

  // Sparkline data mapped per KPI
  const sparklineData = useMemo(() => monthlyTrends?.months || [], [monthlyTrends]);

  return (
    <PullToRefresh onRefresh={handleRefresh}>
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold">CRM Dashboard</h1>
            <HelpLink section="crm-leads" tooltip="Help: CRM & Leads" />
          </div>
          <p className="text-muted-foreground text-sm">
            Lead management and sales pipeline overview
            {selectedMonth !== "all" && ` · ${MONTH_NAMES[Number(selectedMonth)]}`}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5">
            <CalendarRange className="h-4 w-4 text-muted-foreground hidden sm:block" />
            <Select
              value={String(selectedFY)}
              onValueChange={(v) => { setSelectedFY(Number(v)); setSelectedMonth("all"); }}
            >
              <SelectTrigger className="w-[120px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {getFYOptions().map((fy) => (
                  <SelectItem key={fy} value={String(fy)}>
                    FY {fy - 1}-{String(fy).slice(-2)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Select value={selectedMonth} onValueChange={setSelectedMonth}>
            <SelectTrigger className="w-[120px]">
              <SelectValue placeholder="All Months" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Months</SelectItem>
              {MONTH_NAMES.map((name, idx) => (
                <SelectItem key={idx} value={String(idx)}>{name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={selectedBranch} onValueChange={setSelectedBranch}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="All Branches" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Branches</SelectItem>
              {branchesList?.map((b: any) => (
                <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={selectedDA} onValueChange={setSelectedDA}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="All Advisers" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Advisers</SelectItem>
              {designAdvisors?.map((da) => (
                <SelectItem key={da.id} value={da.name}>{da.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" variant="brand" onClick={() => navigate("/crm/leads/new")} className="whitespace-nowrap">
            + New Lead
          </Button>
        </div>
      </div>

      {/* KPI Cards with Sparklines */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-7 gap-4">
        {[
          { icon: <Users className="h-4 w-4 text-blue-500" />, label: "Total Leads", value: kpis?.totalLeads || 0, sparkKey: "totalLeads", color: "#3b82f6" },
          { icon: <Clock className="h-4 w-4 text-amber-500" />, label: "Active", value: kpis?.activeLeads || 0, sparkKey: "activeLeads", color: "#f59e0b" },
          { icon: <Target className="h-4 w-4 text-green-500" />, label: "Completed", value: kpis?.completedLeads || 0, sparkKey: "completedLeads", color: "#22c55e" },
          { icon: <TrendingUp className="h-4 w-4 text-purple-500" />, label: "Conversion", value: `${kpis?.conversionRate || 0}%`, sparkKey: "conversion", color: "#a855f7" },
          { icon: <FileText className="h-4 w-4 text-teal-500" />, label: "Contracts (FY)", value: kpis?.contractsThisMonth || 0, sparkKey: "contracts", color: "#14b8a6" },
          { icon: <DollarSign className="h-4 w-4 text-emerald-500" />, label: "Contracted Revenue", value: `$${Math.round(Number(kpis?.pipelineValue || 0) / 1000).toLocaleString()}k`, sparkKey: "revenue", color: "#10b981" },
          { icon: <Users className="h-4 w-4 text-orange-500" />, label: "Supply Jobs", value: kpis?.uncontractedLeads || 0, sparkKey: "supplyJobs", color: "#f97316" },
        ].map((kpi) => (
          <Card key={kpi.label} className="cursor-pointer hover:shadow-md hover:-translate-y-0.5 transition-all" onClick={() => {
            const routes: Record<string, string> = {
              "Total Leads": "/crm/leads",
              "Active": "/crm/leads?status=assigned",
              "Completed": "/crm/leads?status=completed",
              "Conversion": "/crm/leads",
              "Contracts (FY)": "/crm/leads?status=contract",
              "Contracted Revenue": "/crm/leads?status=contract",
              "Supply Jobs": "/crm/leads?status=construction",
            };
            navigate(routes[kpi.label] || "/crm/leads");
          }}>
            <CardContent className="pt-4 pb-2 px-4">
              <div className="flex items-center gap-2 mb-1">
                {kpi.icon}
                <span className="text-xs text-muted-foreground">{kpi.label}</span>
              </div>
              <p className="text-2xl font-bold">{kpisLoading ? "..." : kpi.value}</p>
              {selectedMonth === "all" && sparklineData.length > 0 && (
                <div className="mt-1 -mx-1">
                  <Sparkline data={sparklineData} dataKey={kpi.sparkKey} color={kpi.color} height={28} />
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* YoY Comparison Row */}
      {prevKpis && kpis && !kpisLoading && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-7 gap-4 -mt-2">
          {[
            { label: "Total Leads", current: kpis.totalLeads, prev: prevKpis.totalLeads },
            { label: "Active", current: kpis.activeLeads, prev: prevKpis.activeLeads },
            { label: "Completed", current: kpis.completedLeads, prev: prevKpis.completedLeads },
            { label: "Conversion", current: kpis.conversionRate, prev: prevKpis.conversionRate },
            { label: "Contracts", current: kpis.contractsThisMonth, prev: prevKpis.contractsThisMonth },
            { label: "Revenue", current: Math.round(Number(kpis.pipelineValue) / 1000), prev: Math.round(Number(prevKpis.pipelineValue) / 1000) },
            { label: "Supply", current: kpis.uncontractedLeads || 0, prev: prevKpis.uncontractedLeads || 0 },
          ].map((item) => {
            const diff = item.prev > 0 ? Math.round(((item.current - item.prev) / item.prev) * 100) : (item.current > 0 ? 100 : 0);
            const isUp = diff > 0;
            const isDown = diff < 0;
            return (
              <div key={item.label} className="flex items-center justify-center gap-1 text-xs">
                {diff !== 0 ? (
                  <span className={`font-medium ${isUp ? "text-green-600" : isDown ? "text-red-600" : "text-muted-foreground"}`}>
                    {isUp ? "↑" : "↓"} {Math.abs(diff)}% vs prev FY
                  </span>
                ) : (
                  <span className="text-muted-foreground">— vs prev FY</span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Adviser Performance */}
      {adviserPerf && adviserPerf.advisers.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <UserCheck className="h-5 w-5 text-violet-500" />
              Design Adviser Performance
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 px-3 font-medium">Adviser</th>
                    <th className="text-right py-2 px-3 font-medium">Total</th>
                    <th className="text-right py-2 px-3 font-medium">Active</th>
                    <th className="text-right py-2 px-3 font-medium">Won</th>
                    <th className="text-right py-2 px-3 font-medium">Conversion</th>
                    <th className="text-right py-2 px-3 font-medium">Revenue</th>
                    <th className="text-right py-2 px-3 font-medium">Avg Days</th>
                    <th className="py-2 px-3 font-medium w-[120px]"></th>
                  </tr>
                </thead>
                <tbody>
                  {adviserPerf.advisers.map((adv) => {
                    const convColor = adv.conversionRate >= 25 ? "text-green-600" : adv.conversionRate >= 10 ? "text-amber-600" : "text-red-600";
                    return (
                      <tr
                        key={adv.name}
                        className="border-b hover:bg-muted/50 cursor-pointer"
                        onClick={() => setSelectedDA(selectedDA === adv.name ? "all" : adv.name)}
                      >
                        <td className="py-2.5 px-3 font-medium">
                          <div className="flex items-center gap-2">
                            {adv.name}
                            {selectedDA === adv.name && (
                              <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Active Filter</Badge>
                            )}
                          </div>
                        </td>
                        <td className="py-2.5 px-3 text-right">{adv.total}</td>
                        <td className="py-2.5 px-3 text-right text-amber-600">{adv.active}</td>
                        <td className="py-2.5 px-3 text-right text-green-600">{adv.won}</td>
                        <td className={`py-2.5 px-3 text-right font-semibold ${convColor}`}>{adv.conversionRate}%</td>
                        <td className="py-2.5 px-3 text-right font-semibold">${Math.round(adv.revenue / 1000).toLocaleString()}k</td>
                        <td className="py-2.5 px-3 text-right">
                          {adviserTimeToClose?.[adv.name]
                            ? <span className="text-muted-foreground">{adviserTimeToClose[adv.name].avgDays}<span className="text-xs ml-0.5">d</span></span>
                            : <span className="text-muted-foreground">—</span>
                          }
                        </td>
                        <td className="py-2.5 px-3">
                          <div className="h-2 bg-muted rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${adv.conversionRate >= 25 ? 'bg-green-500' : adv.conversionRate >= 10 ? 'bg-amber-500' : 'bg-red-400'}`}
                              style={{ width: `${Math.min(adv.conversionRate, 100)}%` }}
                            />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 bg-muted/30">
                    <td className="py-2.5 px-3 font-semibold text-sm">
                      Total ({adviserPerf.advisers.length} advisers)
                    </td>
                    <td className="py-2.5 px-3 text-right font-bold">
                      {adviserPerf.advisers.reduce((s, a) => s + a.total, 0)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-bold text-amber-600">
                      {adviserPerf.advisers.reduce((s, a) => s + a.active, 0)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-bold text-green-600">
                      {adviserPerf.advisers.reduce((s, a) => s + a.won, 0)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-bold">
                      {(() => {
                        const totalAll = adviserPerf.advisers.reduce((s, a) => s + a.total, 0);
                        const wonAll = adviserPerf.advisers.reduce((s, a) => s + a.won, 0);
                        return totalAll > 0 ? `${Math.round((wonAll / totalAll) * 100)}%` : '0%';
                      })()}
                    </td>
                    <td className="py-2.5 px-3 text-right font-bold">
                      ${Math.round(adviserPerf.advisers.reduce((s, a) => s + a.revenue, 0) / 1000).toLocaleString()}k
                    </td>
                    <td className="py-2.5 px-3 text-right font-bold text-muted-foreground">
                      {adviserTimeToClose ? (() => {
                        const vals = Object.values(adviserTimeToClose).filter(v => v.sampleSize > 0);
                        if (vals.length === 0) return '—';
                        const totalDays = vals.reduce((s, v) => s + v.avgDays * v.sampleSize, 0);
                        const totalSamples = vals.reduce((s, v) => s + v.sampleSize, 0);
                        return `${Math.round(totalDays / totalSamples)}d`;
                      })() : '—'}
                    </td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Contracted Sales */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-emerald-500" />
              Contracted Sales
            </CardTitle>
            <div className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground">
                {showAllContracts ? `${contractedSales?.length || 0}` : `${Math.min(contractedSales?.length || 0, 50)} of ${kpis?.completedLeads || 0}`} contracts
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowAllContracts(!showAllContracts)}
                className="text-xs"
              >
                {showAllContracts ? (
                  <><ChevronUp className="h-3 w-3 mr-1" /> Show Less</>
                ) : (
                  <><ChevronDown className="h-3 w-3 mr-1" /> View All</>
                )}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {contractedSalesLoading ? (
            <p className="text-muted-foreground text-sm">Loading...</p>
          ) : !contractedSales || contractedSales.length === 0 ? (
            <p className="text-muted-foreground text-sm">No contracted sales in this period.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 px-2 font-medium">Lead #</th>
                    <th className="text-left py-2 px-2 font-medium">Contact</th>
                    <th className="text-left py-2 px-2 font-medium">Location</th>
                    <th className="text-left py-2 px-2 font-medium">Product</th>
                    <th className="text-left py-2 px-2 font-medium">Adviser</th>
                    <th className="text-left py-2 px-2 font-medium">Contract Date</th>
                    <th className="text-right py-2 px-2 font-medium">Contract Value</th>
                    <th className="text-left py-2 px-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {contractedSales.map((sale: any) => (
                    <tr
                      key={sale.id}
                      className="border-b hover:bg-muted/50 cursor-pointer"
                      onClick={() => navigate(`/crm/leads/${sale.id}`)}
                    >
                      <td className="py-2 px-2 font-mono text-xs">{sale.leadNumber}</td>
                      <td className="py-2 px-2">
                        {sale.contactFirstName} {sale.contactLastName}
                      </td>
                      <td className="py-2 px-2 text-xs">{[sale.suburb, sale.state].filter(Boolean).join(", ")}</td>
                      <td className="py-2 px-2">{sale.productType || "\u2014"}</td>
                      <td className="py-2 px-2">{sale.designAdvisor || "\u2014"}</td>
                      <td className="py-2 px-2 text-xs text-muted-foreground">
                        {sale.contractDate ? new Date(sale.contractDate).toLocaleDateString("en-AU") : "\u2014"}
                      </td>
                      <td className="py-2 px-2 text-right font-semibold">
                        {sale.contractValue ? `$${Number(sale.contractValue).toLocaleString()}` : "\u2014"}
                      </td>
                      <td className="py-2 px-2">
                        <Badge className={`text-xs ${STATUS_COLORS[sale.status] || ""}`}>
                          {STATUS_LABELS[sale.status] || sale.status}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 bg-muted/30">
                    <td colSpan={6} className="py-2.5 px-2 font-semibold text-sm">
                      Total ({contractedSales.length} contracts)
                    </td>
                    <td className="py-2.5 px-2 text-right font-bold text-sm">
                      ${contractedSales.reduce((sum: number, s: any) => sum + (Number(s.contractValue) || 0), 0).toLocaleString()}
                    </td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Branch Performance */}
      {branchPerf && branchPerf.branches.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg flex items-center gap-2">
                <Building2 className="h-5 w-5 text-indigo-500" />
                Branch Performance
              </CardTitle>
              {branchPerf.unassignedLeads > 0 && (
                <span className="text-xs text-muted-foreground">
                  {branchPerf.unassignedLeads} unassigned lead{branchPerf.unassignedLeads !== 1 ? "s" : ""}
                </span>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {branchPerf.branches.map((branch) => (
                <div
                  key={branch.branchId}
                  className={`border rounded-lg p-4 hover:bg-muted/30 transition-colors cursor-pointer ${selectedBranch === String(branch.branchId) ? 'ring-2 ring-primary bg-muted/40' : ''}`}
                  onClick={() => setSelectedBranch(selectedBranch === String(branch.branchId) ? "all" : String(branch.branchId))}
                >
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-semibold text-sm">{branch.branchName}</h3>
                    <Badge variant="outline" className="text-xs">
                      {branch.conversionRate}% conversion
                    </Badge>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div>
                      <p className="text-lg font-bold">{branch.totalLeads}</p>
                      <p className="text-xs text-muted-foreground">Total</p>
                    </div>
                    <div>
                      <p className="text-lg font-bold text-amber-600">{branch.activeLeads}</p>
                      <p className="text-xs text-muted-foreground">Active</p>
                    </div>
                    <div>
                      <p className="text-lg font-bold text-green-600">{branch.wonLeads}</p>
                      <p className="text-xs text-muted-foreground">Won</p>
                    </div>
                  </div>
                  <div className="mt-3">
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-green-500 rounded-full transition-all"
                        style={{ width: `${branch.conversionRate}%` }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Lead Source Breakdown */}
      {leadSourceBreakdown && leadSourceBreakdown.sources.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Target className="h-5 w-5 text-blue-500" />
              Lead Source Breakdown
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 px-3 font-medium">Source</th>
                    <th className="text-right py-2 px-3 font-medium">Total</th>
                    <th className="text-right py-2 px-3 font-medium">Active</th>
                    <th className="text-right py-2 px-3 font-medium">Won</th>
                    <th className="text-right py-2 px-3 font-medium">Conversion</th>
                    <th className="text-right py-2 px-3 font-medium">Revenue</th>
                    <th className="py-2 px-3 font-medium w-[140px]">Share</th>
                  </tr>
                </thead>
                <tbody>
                  {leadSourceBreakdown.sources.map((src) => {
                    const maxTotal = Math.max(...leadSourceBreakdown.sources.map(s => s.totalLeads));
                    const barWidth = maxTotal > 0 ? (src.totalLeads / maxTotal) * 100 : 0;
                    const convColor = src.conversionRate >= 25 ? "text-green-600" : src.conversionRate >= 10 ? "text-amber-600" : "text-red-600";
                    return (
                      <tr key={src.source} className="border-b hover:bg-muted/50">
                        <td className="py-2.5 px-3 font-medium">{src.source}</td>
                        <td className="py-2.5 px-3 text-right">{src.totalLeads}</td>
                        <td className="py-2.5 px-3 text-right text-amber-600">{src.activeLeads}</td>
                        <td className="py-2.5 px-3 text-right text-green-600">{src.wonLeads}</td>
                        <td className={`py-2.5 px-3 text-right font-semibold ${convColor}`}>{src.conversionRate}%</td>
                        <td className="py-2.5 px-3 text-right font-semibold">${Math.round(src.revenue / 1000).toLocaleString()}k</td>
                        <td className="py-2.5 px-3">
                          <div className="h-2 bg-muted rounded-full overflow-hidden">
                            <div
                              className="h-full bg-blue-500 rounded-full transition-all"
                              style={{ width: `${barWidth}%` }}
                            />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 bg-muted/30">
                    <td className="py-2.5 px-3 font-semibold">Total ({leadSourceBreakdown.sources.length} sources)</td>
                    <td className="py-2.5 px-3 text-right font-bold">{leadSourceBreakdown.sources.reduce((s, a) => s + a.totalLeads, 0)}</td>
                    <td className="py-2.5 px-3 text-right font-bold text-amber-600">{leadSourceBreakdown.sources.reduce((s, a) => s + a.activeLeads, 0)}</td>
                    <td className="py-2.5 px-3 text-right font-bold text-green-600">{leadSourceBreakdown.sources.reduce((s, a) => s + a.wonLeads, 0)}</td>
                    <td className="py-2.5 px-3 text-right font-bold">
                      {(() => {
                        const t = leadSourceBreakdown.sources.reduce((s, a) => s + a.totalLeads, 0);
                        const w = leadSourceBreakdown.sources.reduce((s, a) => s + a.wonLeads, 0);
                        return t > 0 ? `${Math.round((w / t) * 100)}%` : '0%';
                      })()}
                    </td>
                    <td className="py-2.5 px-3 text-right font-bold">${Math.round(leadSourceBreakdown.sources.reduce((s, a) => s + a.revenue, 0) / 1000).toLocaleString()}k</td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Lead-to-Quote Conversion Funnel by Source */}
      {leadSourceBreakdown && leadSourceBreakdown.sources.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-purple-500" />
              Conversion Funnel by Source
            </CardTitle>
            <p className="text-xs text-muted-foreground">Lead → Quoted → Contracted → Won (by lead source)</p>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={leadSourceBreakdown.sources.filter(s => s.totalLeads >= 5).slice(0, 8).map(s => ({
                    source: s.source.length > 12 ? s.source.slice(0, 12) + '…' : s.source,
                    Leads: s.totalLeads,
                    Quoted: s.quotedLeads || 0,
                    Contracted: s.contractedLeads || 0,
                    Won: s.wonLeads,
                  }))}
                  margin={{ top: 10, right: 10, left: 0, bottom: 20 }}
                >
                  <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                  <XAxis dataKey="source" tick={{ fontSize: 11 }} angle={-20} textAnchor="end" height={50} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="Leads" fill="#93c5fd" radius={[2, 2, 0, 0]} />
                  <Bar dataKey="Quoted" fill="#fbbf24" radius={[2, 2, 0, 0]} />
                  <Bar dataKey="Contracted" fill="#34d399" radius={[2, 2, 0, 0]} />
                  <Bar dataKey="Won" fill="#10b981" radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <p className="text-[10px] text-muted-foreground mt-2 text-right">Sources with ≥5 leads shown. Funnel stages: Lead → Quoted → Contracted → Won/Completed</p>
          </CardContent>
        </Card>
      )}

      {/* Win/Loss Reason Breakdown */}
      {outcomeBreakdown && outcomeBreakdown.length > 0 && (() => {
        const wonReasons = outcomeBreakdown.filter(r => r.status === 'accepted');
        const lostReasons = outcomeBreakdown.filter(r => r.status === 'lost');
        const COLORS_WON = ['#10b981', '#34d399', '#6ee7b7', '#a7f3d0', '#d1fae5', '#059669'];
        const COLORS_LOST = ['#ef4444', '#f87171', '#fca5a5', '#fecaca', '#fee2e2', '#dc2626', '#b91c1c'];
        return (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {wonReasons.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Target className="h-5 w-5 text-green-500" />
                    Won Reasons
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-[220px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={wonReasons.map(r => ({ name: r.outcomeReason, value: Number(r.count) }))}
                          cx="50%" cy="50%" outerRadius={80}
                          dataKey="value" label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                          labelLine={false}
                        >
                          {wonReasons.map((_, i) => <Cell key={i} fill={COLORS_WON[i % COLORS_WON.length]} />)}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            )}
            {lostReasons.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Target className="h-5 w-5 text-red-500" />
                    Lost Reasons
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-[220px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={lostReasons.map(r => ({ name: r.outcomeReason, value: Number(r.count) }))}
                          cx="50%" cy="50%" outerRadius={80}
                          dataKey="value" label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                          labelLine={false}
                        >
                          {lostReasons.map((_, i) => <Cell key={i} fill={COLORS_LOST[i % COLORS_LOST.length]} />)}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        );
      })()}

      {/* Recent Leads Table */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">Recent Leads</CardTitle>
            <Button variant="outline" size="sm" onClick={() => navigate("/crm/leads")}>
              View All
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {leadsLoading ? (
            <p className="text-muted-foreground text-sm">Loading...</p>
          ) : !recentLeads || recentLeads.length === 0 ? (
            <p className="text-muted-foreground text-sm">No leads with contracts in this period.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 px-2 font-medium">Lead #</th>
                    <th className="text-left py-2 px-2 font-medium">Contact</th>
                    <th className="text-left py-2 px-2 font-medium">Product</th>
                    <th className="text-left py-2 px-2 font-medium">Source</th>
                    <th className="text-left py-2 px-2 font-medium">Status</th>
                    <th className="text-left py-2 px-2 font-medium">Advisor</th>
                    <th className="text-left py-2 px-2 font-medium">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {recentLeads.map((lead) => (
                    <tr
                      key={lead.id}
                      className="border-b hover:bg-muted/50 cursor-pointer"
                      onClick={() => navigate(`/crm/leads/${lead.id}`)}
                    >
                      <td className="py-2 px-2 font-mono text-xs">{lead.leadNumber}</td>
                      <td className="py-2 px-2">
                        {lead.contactFirstName} {lead.contactLastName}
                      </td>
                      <td className="py-2 px-2">{lead.productType || "—"}</td>
                      <td className="py-2 px-2">{lead.leadSource || "—"}</td>
                      <td className="py-2 px-2">
                        <Badge className={`text-xs ${STATUS_COLORS[lead.status] || ""}`}>
                          {STATUS_LABELS[lead.status] || lead.status}
                        </Badge>
                      </td>
                      <td className="py-2 px-2">{lead.designAdvisor || "—"}</td>
                      <td className="py-2 px-2 text-xs text-muted-foreground">
                        {lead.createdAt ? new Date(lead.createdAt).toLocaleDateString("en-AU") : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
    </PullToRefresh>
  );
}
