import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Sparkles,
  Image,
  Users,
  FolderOpen,
  TrendingUp,
  Calendar,
  DollarSign,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  Line,
} from "recharts";

// ─── Helper ─────────────────────────────────────────────────────────────────
function formatAud(n: number): string {
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}k`;
  if (n >= 1) return `$${n.toFixed(2)}`;
  return `$${n.toFixed(4)}`;
}

function formatDate(d: Date | string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

// ─── Date Range Helpers ─────────────────────────────────────────────────────
function getDateRange(period: string): { startDate?: string; endDate?: string } {
  const now = new Date();
  switch (period) {
    case "this-month": {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      return { startDate: start.toISOString().split("T")[0] };
    }
    case "last-month": {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const end = new Date(now.getFullYear(), now.getMonth(), 0);
      return {
        startDate: start.toISOString().split("T")[0],
        endDate: end.toISOString().split("T")[0],
      };
    }
    case "this-quarter": {
      const qStart = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
      return { startDate: qStart.toISOString().split("T")[0] };
    }
    case "this-year": {
      const start = new Date(now.getFullYear(), 0, 1);
      return { startDate: start.toISOString().split("T")[0] };
    }
    default:
      return {};
  }
}

export default function RenderCostDashboard() {
  const [period, setPeriod] = useState("all-time");
  const dateRange = useMemo(() => getDateRange(period), [period]);

  const { data: summary, isLoading: summaryLoading } = trpc.renderCost.summary.useQuery(
    dateRange.startDate ? dateRange : undefined
  );
  const { data: byAdviser, isLoading: adviserLoading } = trpc.renderCost.byAdviser.useQuery(
    dateRange.startDate ? dateRange : undefined
  );
  const { data: byProject, isLoading: projectLoading } = trpc.renderCost.byProject.useQuery(
    dateRange.startDate ? dateRange : undefined
  );
  const { data: monthlyTrend, isLoading: trendLoading } = trpc.renderCost.monthlyTrend.useQuery();
  const { data: recentLogs, isLoading: logsLoading } = trpc.renderCost.recentLogs.useQuery();

  const budgetPercent = summary?.budgetUsedPercent || 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Sparkles className="h-6 w-6 text-purple-500" />
            AI Render Cost Tracking
          </h1>
          <p className="text-muted-foreground mt-1">
            Monitor AI render generation costs (AUD) across advisers and projects
          </p>
        </div>
        <Select value={period} onValueChange={setPeriod}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Time period" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all-time">All Time</SelectItem>
            <SelectItem value="this-month">This Month</SelectItem>
            <SelectItem value="last-month">Last Month</SelectItem>
            <SelectItem value="this-quarter">This Quarter</SelectItem>
            <SelectItem value="this-year">This Year</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Pricing Info Bar */}
      {summary?.pricing && (
        <Card className="bg-muted/50">
          <CardContent className="py-3 px-4">
            <div className="flex flex-wrap items-center gap-4 text-sm">
              <span className="font-medium text-muted-foreground">Current Rates:</span>
              <Badge variant="outline" className="gap-1">
                <DollarSign className="h-3 w-3" />
                Full: ${summary.pricing.fullRenderCostAud.toFixed(2)}
              </Badge>
              <Badge variant="outline" className="gap-1">
                <DollarSign className="h-3 w-3" />
                Quick: ${summary.pricing.quickRenderCostAud.toFixed(2)}
              </Badge>
              <Badge variant="outline" className="gap-1">
                <DollarSign className="h-3 w-3" />
                Batch: ${summary.pricing.batchRenderCostAud.toFixed(2)}
              </Badge>
              <span className="text-muted-foreground ml-auto text-xs">
                Edit rates in Company Settings → AI Render Pricing
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Cost (AUD)</CardTitle>
            <DollarSign className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            {summaryLoading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <>
                <div className="text-2xl font-bold">{formatAud(summary?.totalCostAud || 0)}</div>
                <p className="text-xs text-muted-foreground">
                  {summary?.totalRenders || 0} renders generated
                </p>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Monthly Budget</CardTitle>
            <TrendingUp className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            {summaryLoading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <>
                <div className="text-2xl font-bold">
                  {formatAud(summary?.monthlyCostAud || 0)} / {formatAud(summary?.monthlyBudgetAud || 10)}
                </div>
                <Progress
                  value={Math.min(budgetPercent, 100)}
                  className={`mt-2 ${budgetPercent > 80 ? "[&>div]:bg-red-500" : budgetPercent > 60 ? "[&>div]:bg-amber-500" : ""}`}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  {budgetPercent.toFixed(0)}% of monthly budget used
                </p>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Advisers</CardTitle>
            <Users className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            {summaryLoading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <>
                <div className="text-2xl font-bold">{summary?.uniqueAdvisers || 0}</div>
                <p className="text-xs text-muted-foreground">
                  Avg {summary && summary.uniqueAdvisers > 0
                    ? formatAud(summary.totalCostAud / summary.uniqueAdvisers)
                    : "$0.00"}/adviser
                </p>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Render Breakdown</CardTitle>
            <Image className="h-4 w-4 text-orange-500" />
          </CardHeader>
          <CardContent>
            {summaryLoading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <>
                <div className="text-2xl font-bold">{summary?.totalRenders || 0}</div>
                <div className="flex gap-2 mt-1 flex-wrap">
                  <Badge variant="secondary" className="text-xs">
                    Full: {summary?.totalFullRenders || 0}
                  </Badge>
                  <Badge variant="secondary" className="text-xs">
                    Quick: {summary?.totalQuickRenders || 0}
                  </Badge>
                  <Badge variant="secondary" className="text-xs">
                    Batch: {summary?.totalBatchRenders || 0}
                  </Badge>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Monthly Trend Chart */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Monthly Cost Trend (AUD)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {trendLoading ? (
            <Skeleton className="h-[300px] w-full" />
          ) : monthlyTrend && monthlyTrend.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={monthlyTrend}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis
                  dataKey="month"
                  className="text-xs"
                  tickFormatter={(v) => {
                    const [y, m] = v.split("-");
                    return `${["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][parseInt(m)-1]} ${y.slice(2)}`;
                  }}
                />
                <YAxis className="text-xs" tickFormatter={(v) => `$${v}`} />
                <Tooltip
                  contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}
                  labelFormatter={(v) => {
                    const [y, m] = v.split("-");
                    return `${["January","February","March","April","May","June","July","August","September","October","November","December"][parseInt(m)-1]} ${y}`;
                  }}
                  formatter={(value: number, name: string) => {
                    if (name === "Cost (AUD)") return [`$${value.toFixed(4)}`, name];
                    return [value, name];
                  }}
                />
                <Legend />
                <Bar dataKey="fullRenders" name="Full" fill="hsl(270, 70%, 60%)" stackId="a" />
                <Bar dataKey="quickRenders" name="Quick" fill="hsl(200, 70%, 60%)" stackId="a" />
                <Bar dataKey="batchRenders" name="Batch" fill="hsl(30, 70%, 60%)" stackId="a" />
                <Line
                  type="monotone"
                  dataKey="totalCostAud"
                  name="Cost (AUD)"
                  stroke="hsl(140, 70%, 40%)"
                  strokeWidth={2}
                  dot={false}
                  yAxisId={0}
                />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-[300px] text-muted-foreground">
              <p>No render data yet. Costs will appear here once renders are generated.</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Breakdown Tables */}
      <Tabs defaultValue="advisers" className="space-y-4">
        <TabsList>
          <TabsTrigger value="advisers" className="gap-1">
            <Users className="h-4 w-4" /> By Adviser
          </TabsTrigger>
          <TabsTrigger value="projects" className="gap-1">
            <FolderOpen className="h-4 w-4" /> By Project
          </TabsTrigger>
          <TabsTrigger value="logs" className="gap-1">
            <Calendar className="h-4 w-4" /> Recent Logs
          </TabsTrigger>
        </TabsList>

        {/* By Adviser */}
        <TabsContent value="advisers">
          <Card>
            <CardHeader>
              <CardTitle>Cost by Adviser</CardTitle>
            </CardHeader>
            <CardContent>
              {adviserLoading ? (
                <div className="space-y-2">
                  {[1,2,3].map(i => <Skeleton key={i} className="h-12 w-full" />)}
                </div>
              ) : byAdviser && byAdviser.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Adviser</TableHead>
                      <TableHead className="text-right">Total Cost (AUD)</TableHead>
                      <TableHead className="text-right">Renders</TableHead>
                      <TableHead className="text-right">Full</TableHead>
                      <TableHead className="text-right">Quick</TableHead>
                      <TableHead className="text-right">Batch</TableHead>
                      <TableHead className="text-right">Avg/Render</TableHead>
                      <TableHead className="text-right">Last Render</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {byAdviser.map((row) => (
                      <TableRow key={row.userId}>
                        <TableCell className="font-medium">{row.userName}</TableCell>
                        <TableCell className="text-right font-semibold text-green-600">
                          {formatAud(row.totalCostAud)}
                        </TableCell>
                        <TableCell className="text-right">{row.totalRenders}</TableCell>
                        <TableCell className="text-right">{row.fullRenders}</TableCell>
                        <TableCell className="text-right">{row.quickRenders}</TableCell>
                        <TableCell className="text-right">{row.batchRenders}</TableCell>
                        <TableCell className="text-right">
                          {formatAud(row.avgCostPerRender)}
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground text-sm">
                          {formatDate(row.lastRenderAt)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <p className="text-center text-muted-foreground py-8">
                  No render cost data available for this period.
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* By Project */}
        <TabsContent value="projects">
          <Card>
            <CardHeader>
              <CardTitle>Cost by Project</CardTitle>
            </CardHeader>
            <CardContent>
              {projectLoading ? (
                <div className="space-y-2">
                  {[1,2,3].map(i => <Skeleton key={i} className="h-12 w-full" />)}
                </div>
              ) : byProject && byProject.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Project</TableHead>
                      <TableHead className="text-right">Total Cost (AUD)</TableHead>
                      <TableHead className="text-right">Renders</TableHead>
                      <TableHead className="text-right">Last Render</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {byProject.map((row) => (
                      <TableRow key={row.projectId}>
                        <TableCell className="font-medium">{row.projectName}</TableCell>
                        <TableCell className="text-right font-semibold text-green-600">
                          {formatAud(row.totalCostAud)}
                        </TableCell>
                        <TableCell className="text-right">{row.totalRenders}</TableCell>
                        <TableCell className="text-right text-muted-foreground text-sm">
                          {formatDate(row.lastRenderAt)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <p className="text-center text-muted-foreground py-8">
                  No render cost data available for this period.
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Recent Logs */}
        <TabsContent value="logs">
          <Card>
            <CardHeader>
              <CardTitle>Recent Render Logs</CardTitle>
            </CardHeader>
            <CardContent>
              {logsLoading ? (
                <div className="space-y-2">
                  {[1,2,3,4,5].map(i => <Skeleton key={i} className="h-10 w-full" />)}
                </div>
              ) : recentLogs && recentLogs.logs.length > 0 ? (
                <>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Adviser</TableHead>
                        <TableHead>Project</TableHead>
                        <TableHead>Mode</TableHead>
                        <TableHead>Preset</TableHead>
                        <TableHead className="text-right">Renders</TableHead>
                        <TableHead className="text-right">Cost (AUD)</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {recentLogs.logs.map((log) => (
                        <TableRow key={log.id}>
                          <TableCell className="text-sm text-muted-foreground">
                            {formatDate(log.createdAt)}
                          </TableCell>
                          <TableCell>{log.userName}</TableCell>
                          <TableCell className="text-sm">{log.projectName}</TableCell>
                          <TableCell>
                            <Badge
                              variant={
                                log.renderMode === "full"
                                  ? "default"
                                  : log.renderMode === "batch"
                                  ? "secondary"
                                  : "outline"
                              }
                              className="text-xs"
                            >
                              {log.renderMode}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {log.stylePreset || "—"}
                          </TableCell>
                          <TableCell className="text-right">{log.renderCount}</TableCell>
                          <TableCell className="text-right font-medium text-green-600">
                            {formatAud(log.costAud)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  <p className="text-xs text-muted-foreground mt-3 text-right">
                    Showing {recentLogs.logs.length} of {recentLogs.total} total logs
                  </p>
                </>
              ) : (
                <p className="text-center text-muted-foreground py-8">
                  No render logs recorded yet.
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
