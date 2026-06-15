import { useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { BarChart3, TrendingUp, Clock, AlertTriangle, Factory } from "lucide-react";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from "chart.js";
import { Bar, Line, Doughnut } from "react-chartjs-2";

ChartJS.register(CategoryScale, LinearScale, BarElement, LineElement, PointElement, ArcElement, Title, Tooltip, Legend, Filler);

export default function ManufacturingKPI() {
  const { data: summary } = trpc.manufacturingDispatch.kpi.summary.useQuery();
  const { data: throughputTrend } = trpc.manufacturingDispatch.kpi.throughputTrend.useQuery({});
  const { data: leadTimeDist } = trpc.manufacturingDispatch.kpi.leadTimeDistribution.useQuery();
  const { data: branchUtil } = trpc.manufacturingDispatch.kpi.branchUtilisation.useQuery();
  const { data: ordersByStatus } = trpc.manufacturingDispatch.kpi.ordersByStatus.useQuery();

  // Throughput chart data
  const throughputChartData = useMemo(() => {
    if (!throughputTrend?.length) return null;
    return {
      labels: throughputTrend.map(d => {
        const date = new Date(d.date);
        return date.toLocaleDateString("en-AU", { day: "numeric", month: "short" });
      }),
      datasets: [{
        label: "Tasks Completed",
        data: throughputTrend.map(d => d.count),
        borderColor: "rgb(59, 130, 246)",
        backgroundColor: "rgba(59, 130, 246, 0.1)",
        fill: true,
        tension: 0.3,
      }],
    };
  }, [throughputTrend]);

  // Lead time distribution chart
  const leadTimeChartData = useMemo(() => {
    if (!leadTimeDist?.length) return null;
    return {
      labels: leadTimeDist.map(d => `${d.days}d`),
      datasets: [{
        label: "Orders",
        data: leadTimeDist.map(d => d.count),
        backgroundColor: "rgba(16, 185, 129, 0.7)",
        borderColor: "rgb(16, 185, 129)",
        borderWidth: 1,
      }],
    };
  }, [leadTimeDist]);

  // Branch utilisation chart
  const branchChartData = useMemo(() => {
    if (!branchUtil?.length) return null;
    return {
      labels: branchUtil.map(b => b.branchName),
      datasets: [
        {
          label: "Active Tasks",
          data: branchUtil.map(b => b.active),
          backgroundColor: "rgba(59, 130, 246, 0.7)",
        },
        {
          label: "Completed Tasks",
          data: branchUtil.map(b => b.completed),
          backgroundColor: "rgba(16, 185, 129, 0.7)",
        },
      ],
    };
  }, [branchUtil]);

  // Orders by status doughnut
  const statusChartData = useMemo(() => {
    if (!ordersByStatus?.length) return null;
    const colors: Record<string, string> = {
      received: "#6b7280",
      in_production: "#3b82f6",
      partially_complete: "#f59e0b",
      completed: "#10b981",
      ready_for_dispatch: "#8b5cf6",
      dispatched: "#06b6d4",
      on_hold: "#ef4444",
      cancelled: "#d1d5db",
    };
    return {
      labels: ordersByStatus.map(s => s.status.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase())),
      datasets: [{
        data: ordersByStatus.map(s => s.count),
        backgroundColor: ordersByStatus.map(s => colors[s.status] || "#9ca3af"),
      }],
    };
  }, [ordersByStatus]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <BarChart3 className="h-6 w-6" /> Manufacturing KPIs
        </h1>
        <p className="text-muted-foreground text-sm mt-1">Production performance metrics and analytics</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPICard
          icon={TrendingUp}
          label="Throughput (7d)"
          value={summary?.throughputRate ?? "-"}
          suffix="tasks"
          color="text-blue-500"
        />
        <KPICard
          icon={Clock}
          label="Avg Lead Time"
          value={summary?.avgLeadTime ?? "-"}
          suffix="days"
          color="text-green-500"
        />
        <KPICard
          icon={AlertTriangle}
          label="Overdue"
          value={summary?.overdueCount ?? 0}
          suffix={`(${summary?.overduePercent ?? 0}%)`}
          color="text-amber-500"
        />
        <KPICard
          icon={Factory}
          label="Active Orders"
          value={summary?.totalActive ?? 0}
          suffix=""
          color="text-purple-500"
        />
      </div>

      {/* Charts Grid */}
      <div className="grid md:grid-cols-2 gap-4">
        {/* Throughput Trend */}
        <div className="border rounded-lg p-4">
          <h3 className="text-sm font-semibold mb-3">Throughput Trend (30 days)</h3>
          {throughputChartData ? (
            <div style={{ height: "220px" }}>
              <Line data={throughputChartData} options={{
                responsive: true,
                maintainAspectRatio: false,
                scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } },
                plugins: { legend: { display: false } },
              }} />
            </div>
          ) : (
            <div className="h-[220px] flex items-center justify-center text-muted-foreground text-sm">No data available</div>
          )}
        </div>

        {/* Lead Time Distribution */}
        <div className="border rounded-lg p-4">
          <h3 className="text-sm font-semibold mb-3">Lead Time Distribution (days)</h3>
          {leadTimeChartData ? (
            <div style={{ height: "220px" }}>
              <Bar data={leadTimeChartData} options={{
                responsive: true,
                maintainAspectRatio: false,
                scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } },
                plugins: { legend: { display: false } },
              }} />
            </div>
          ) : (
            <div className="h-[220px] flex items-center justify-center text-muted-foreground text-sm">No completed orders yet</div>
          )}
        </div>

        {/* Branch Utilisation */}
        <div className="border rounded-lg p-4">
          <h3 className="text-sm font-semibold mb-3">Branch Utilisation</h3>
          {branchChartData ? (
            <div style={{ height: "220px" }}>
              <Bar data={branchChartData} options={{
                responsive: true,
                maintainAspectRatio: false,
                scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } },
                plugins: { legend: { position: "bottom" } },
              }} />
            </div>
          ) : (
            <div className="h-[220px] flex items-center justify-center text-muted-foreground text-sm">No branch data</div>
          )}
        </div>

        {/* Orders by Status */}
        <div className="border rounded-lg p-4">
          <h3 className="text-sm font-semibold mb-3">Orders by Status</h3>
          {statusChartData ? (
            <div style={{ height: "220px" }} className="flex items-center justify-center">
              <Doughnut data={statusChartData} options={{
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { position: "right", labels: { boxWidth: 10, font: { size: 10 } } } },
              }} />
            </div>
          ) : (
            <div className="h-[220px] flex items-center justify-center text-muted-foreground text-sm">No orders yet</div>
          )}
        </div>
      </div>
    </div>
  );
}

function KPICard({ icon: Icon, label, value, suffix, color }: { icon: any; label: string; value: number | string; suffix: string; color: string }) {
  return (
    <div className="border rounded-lg p-3">
      <div className="flex items-center gap-2 mb-1">
        <Icon className={`h-4 w-4 ${color}`} />
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
      <div className="flex items-baseline gap-1">
        <span className="text-2xl font-bold">{value}</span>
        {suffix && <span className="text-xs text-muted-foreground">{suffix}</span>}
      </div>
    </div>
  );
}
