import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, DollarSign, Package, AlertTriangle, ArrowRightLeft, Trash2 } from "lucide-react";
import { useEffect, useRef } from "react";
import Chart from "chart.js/auto";

function formatCurrency(value: number): string {
  if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `$${(value / 1000).toFixed(1)}k`;
  return `$${value.toFixed(0)}`;
}

export default function InventoryDashboard() {
  const { data: summary, isLoading: summaryLoading } = trpc.inventory.dashboard.summary.useQuery();
  const { data: trend, isLoading: trendLoading } = trpc.inventory.dashboard.stockValueTrend.useQuery();
  const { data: movementsByType, isLoading: movementsLoading } = trpc.inventory.dashboard.movementsByType.useQuery();
  const { data: recentActivity, isLoading: activityLoading } = trpc.inventory.dashboard.recentActivity.useQuery();

  const trendChartRef = useRef<HTMLCanvasElement>(null);
  const trendChartInstance = useRef<Chart | null>(null);
  const movementsChartRef = useRef<HTMLCanvasElement>(null);
  const movementsChartInstance = useRef<Chart | null>(null);

  // Stock Value Trend Chart
  useEffect(() => {
    if (!trend || !trendChartRef.current) return;
    if (trendChartInstance.current) trendChartInstance.current.destroy();

    trendChartInstance.current = new Chart(trendChartRef.current, {
      type: "line",
      data: {
        labels: trend.map((w: any) => w.weekStart || w.week),
        datasets: [
          {
            label: "Purchase Value",
            data: trend.map((w: any) => parseFloat(w.totalPurchaseValue || "0")),
            borderColor: "#3b82f6",
            backgroundColor: "rgba(59, 130, 246, 0.1)",
            fill: true,
            tension: 0.3,
          },
          {
            label: "Waste Value",
            data: trend.map((w: any) => parseFloat(w.totalWasteValue || "0")),
            borderColor: "#ef4444",
            backgroundColor: "rgba(239, 68, 68, 0.1)",
            fill: true,
            tension: 0.3,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: "bottom" } },
        scales: {
          y: { beginAtZero: true, ticks: { callback: (v) => formatCurrency(Number(v)) } },
        },
      },
    });

    return () => { trendChartInstance.current?.destroy(); };
  }, [trend]);

  // Movements by Type Chart
  useEffect(() => {
    if (!movementsByType || !movementsChartRef.current) return;
    if (movementsChartInstance.current) movementsChartInstance.current.destroy();

    const typeLabels: Record<string, string> = {
      purchase: "Purchase",
      allocation: "Allocation",
      manufacture_use: "Mfg Use",
      adjustment_waste: "Waste",
      transfer_in: "Transfer In",
      transfer_out: "Transfer Out",
    };
    const typeColors: Record<string, string> = {
      purchase: "#22c55e",
      allocation: "#3b82f6",
      manufacture_use: "#f59e0b",
      adjustment_waste: "#ef4444",
      transfer_in: "#8b5cf6",
      transfer_out: "#6366f1",
    };

    movementsChartInstance.current = new Chart(movementsChartRef.current, {
      type: "doughnut",
      data: {
        labels: movementsByType.map((m: any) => typeLabels[m.type] || m.type),
        datasets: [{
          data: movementsByType.map((m: any) => m.count),
          backgroundColor: movementsByType.map((m: any) => typeColors[m.type] || "#94a3b8"),
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: "bottom" } },
      },
    });

    return () => { movementsChartInstance.current?.destroy(); };
  }, [movementsByType]);

  if (summaryLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">Inventory Dashboard</h1>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 rounded-lg">
                <DollarSign className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Stock Value</p>
                <p className="text-xl font-bold">{formatCurrency(summary?.totalStockValue || 0)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Package className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Items</p>
                <p className="text-xl font-bold">{summary?.totalItems || 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-amber-100 rounded-lg">
                <AlertTriangle className="h-5 w-5 text-amber-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Below Reorder</p>
                <p className="text-xl font-bold text-amber-600">{summary?.itemsBelowReorder || 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-100 rounded-lg">
                <ArrowRightLeft className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Pending Transfers</p>
                <p className="text-xl font-bold">{summary?.pendingTransfers || 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-red-100 rounded-lg">
                <Trash2 className="h-5 w-5 text-red-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Adjustments (30d)</p>
                <p className="text-xl font-bold">{summary?.recentAdjustments || 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Stock Value Trend (12 Weeks)</CardTitle>
          </CardHeader>
          <CardContent>
            <div style={{ height: "280px" }}>
              {trendLoading ? (
                <div className="flex items-center justify-center h-full">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <canvas ref={trendChartRef} />
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Movements by Type (30d)</CardTitle>
          </CardHeader>
          <CardContent>
            <div style={{ height: "280px" }}>
              {movementsLoading ? (
                <div className="flex items-center justify-center h-full">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <canvas ref={movementsChartRef} />
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent Activity */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent Activity</CardTitle>
        </CardHeader>
        <CardContent>
          {activityLoading ? (
            <div className="flex items-center justify-center h-32">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-2">
              {recentActivity?.map((activity: any) => (
                <div key={activity.id} className="flex items-center justify-between py-2 border-b last:border-0">
                  <div className="flex items-center gap-3">
                    <Badge variant={
                      activity.movementType === "purchase" ? "default" :
                      activity.movementType === "adjustment_waste" ? "destructive" :
                      "secondary"
                    }>
                      {activity.movementType.replace(/_/g, " ")}
                    </Badge>
                    <span className="text-sm font-medium">{activity.itemName}</span>
                    <span className="text-sm text-muted-foreground">×{parseFloat(activity.quantity || "0")}</span>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground">
                      {activity.createdAt ? new Date(activity.createdAt).toLocaleDateString() : ""}
                    </p>
                    {activity.createdBy && (
                      <p className="text-xs text-muted-foreground">{activity.createdBy}</p>
                    )}
                  </div>
                </div>
              ))}
              {(!recentActivity || recentActivity.length === 0) && (
                <p className="text-sm text-muted-foreground text-center py-4">No recent activity</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
