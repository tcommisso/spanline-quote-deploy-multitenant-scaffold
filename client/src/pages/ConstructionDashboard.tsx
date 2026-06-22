import { useState, useMemo, useCallback, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  HardHat, Plus, Calendar, CalendarDays, Users, CheckCircle2, Clock,
  AlertTriangle, Pause, X, ChevronRight, Trash2, UserPlus, MessageSquare,
  ChevronLeft, Activity, DollarSign, TrendingUp, ClipboardList, Wrench,
  ArrowUpRight, ArrowRight, Bell, BarChart3, PieChartIcon, Link2, Loader2, Download, FileText,
} from "lucide-react";
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
} from "recharts";
import { toast } from "sonner";
import { useLocation } from "wouter";
import { OnboardingTour, TourHelpButton } from "@/components/OnboardingTour";
import { HelpLink } from "@/components/HelpLink";
import { constructionDashboardTour, TOUR_IDS } from "@/lib/tours";
import { PullToRefresh } from "@/components/PullToRefresh";

// ─── Status helpers ─────────────────────────────────────────────────────────
const statusColors: Record<string, string> = {
  scheduled: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  in_progress: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  on_hold: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
  completed: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  cancelled: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
};

const priorityColors: Record<string, string> = {
  low: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  normal: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  high: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300",
  urgent: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
};

const stageStatusIcons: Record<string, React.ReactNode> = {
  pending: <Clock className="h-4 w-4 text-muted-foreground" />,
  in_progress: <AlertTriangle className="h-4 w-4 text-amber-500" />,
  completed: <CheckCircle2 className="h-4 w-4 text-green-500" />,
  skipped: <X className="h-4 w-4 text-muted-foreground" />,
};

import { formatCurrencyShort } from "@/lib/formatCurrency";
const formatCurrency = formatCurrencyShort;

export default function ConstructionDashboard() {
  const [, navigate] = useLocation();

  const [statusFilter, setStatusFilter] = useState<string>("not_completed");
  const [selectedJobId, setSelectedJobId] = useState<number | null>(null);
  const [showCreateJob, setShowCreateJob] = useState(false);

  // Open create dialog if navigated with ?action=new
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("action") === "new") {
      setShowCreateJob(true);
      // Clean up URL
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  const [tourActive, setTourActive] = useState(false);

  // ─── FY Filter ──────────────────────────────────────────────────────────────
  const fysQuery = trpc.constructionClients.availableFYs.useQuery();
  const currentFy = fysQuery.data?.currentFy;
  // Default to null (All Years) — show all non-complete jobs regardless of year
  const [fyFilter, setFyFilter] = useState<number | null>(null);
  const activeFy = fyFilter;
  const fyOptions = fysQuery.data?.years || [];

  // FY date range for financial queries (ISO strings)
  const fyStart = activeFy != null ? `${activeFy}-07-01` : undefined;
  const fyEnd = activeFy != null ? `${activeFy + 1}-06-30` : undefined;

  // ─── Queries ────────────────────────────────────────────────────────────────
  const statsQuery = trpc.construction.jobs.stats.useQuery(
    { fyStartYear: activeFy ?? undefined },
    { enabled: true }
  );
  const jobsQuery = trpc.construction.jobs.list.useQuery(
    {
      status: (statusFilter !== "all" && statusFilter !== "all_incl_completed") ? statusFilter as any : undefined,
      fyStartYear: activeFy ?? undefined,
      excludeCompleted: statusFilter === "all_incl_completed" ? false : undefined,
    },
    { enabled: true }
  );
  const installersQuery = trpc.construction.installers.list.useQuery();
  const jobDetailQuery = trpc.construction.jobs.get.useQuery(
    { id: selectedJobId! },
    { enabled: !!selectedJobId }
  );
  const financialSummary = trpc.constructionFinancial.summary.useQuery(
    { fyStart, fyEnd },
    { enabled: true }
  );
  const healthSummary = trpc.constructionFinancial.healthSummary.useQuery();

  // ─── New Dashboard Cards ────────────────────────────────────────────────────
  const milestonesQuery = trpc.construction.dashboardAnalytics.upcomingMilestones.useQuery();
  const adviserBreakdownQuery = trpc.construction.dashboardAnalytics.adviserBreakdown.useQuery(
    { fyStartYear: activeFy ?? undefined },
    { enabled: true }
  );
  const tradePerformanceQuery = trpc.construction.dashboardAnalytics.tradePerformance.useQuery(
    { fyStartYear: activeFy ?? undefined },
    { enabled: true }
  );
  const [selectedTradeId, setSelectedTradeId] = useState<number | null>(null);
  const tradeDetailQuery = trpc.construction.dashboardAnalytics.tradeDetail.useQuery(
    { installerId: selectedTradeId! },
    { enabled: !!selectedTradeId }
  );

  // Overdue plans (awaiting client approval 7+ days)
  const overduePlansQuery = trpc.plans.overdueCount.useQuery();

  // Approvals status counts
  const baCountsQuery = trpc.crm.buildingAuthority.statusCounts.useQuery();

  // Get upcoming schedule events (next 7 days)
  const [upcomingStart] = useState(() => new Date().toISOString());
  const [upcomingEnd] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return d.toISOString();
  });
  const upcomingEvents = trpc.constructionSchedule.list.useQuery({
    startDate: upcomingStart,
    endDate: upcomingEnd,
  });

  // ─── Mutations ──────────────────────────────────────────────────────────────
  const seedFromTemplate = trpc.projectPlanTemplates.seedFromTemplate.useMutation({
    onSuccess: (data) => {
      toast.success(`Template "${data.templateName}" applied: ${data.stagesCreated} stages, ${data.tasksCreated} tasks created`);
    },
    onError: (err: any) => toast.error(`Template seed failed: ${err.message}`),
  });

  const createJob = trpc.construction.jobs.create.useMutation({
    onSuccess: (data, variables) => {
      jobsQuery.refetch();
      statsQuery.refetch();
      setShowCreateJob(false);
      toast.success("Job created successfully");
      // Auto-seed from template if selected
      if ((variables as any).templateId && data?.id) {
        seedFromTemplate.mutate({ jobId: data.id, templateId: (variables as any).templateId });
      }
    },
  });

  const updateJob = trpc.construction.jobs.update.useMutation({
    onSuccess: () => {
      jobsQuery.refetch();
      jobDetailQuery.refetch();
      statsQuery.refetch();
      toast.success("Job updated");
    },
  });

  const deleteJob = trpc.construction.jobs.delete.useMutation({
    onSuccess: () => {
      jobsQuery.refetch();
      statsQuery.refetch();
      setSelectedJobId(null);
      toast.success("Job deleted");
    },
  });


  const assignInstaller = trpc.construction.assignments.assign.useMutation({
    onSuccess: () => {
      jobDetailQuery.refetch();
      toast.success("Installer assigned & SMS notification sent");
    },
  });

  const unassignInstaller = trpc.construction.assignments.unassign.useMutation({
    onSuccess: () => {
      jobDetailQuery.refetch();
      toast.success("Installer unassigned");
    },
  });

  const updateProgress = trpc.construction.progress.updateStage.useMutation({
    onSuccess: () => {
      jobDetailQuery.refetch();
      toast.success("Progress updated");
    },
  });

  // ─── Derived KPIs ──────────────────────────────────────────────────────────
  const stats = statsQuery.data;
  const financial = financialSummary.data;
  const jobs = jobsQuery.data || [];
  const events = upcomingEvents.data || [];

  // Overdue jobs: in_progress with scheduledEnd in the past
  const overdueJobs = useMemo(() => {
    const now = new Date();
    return jobs.filter(j =>
      j.status === "in_progress" && j.scheduledEnd && new Date(j.scheduledEnd) < now
    );
  }, [jobs]);

  // Upcoming events count
  const upcomingCount = events.length;

  // Activity feed: combine recent job updates and upcoming events
  const activityFeed = useMemo(() => {
    const items: Array<{
      id: string;
      type: "job_created" | "job_updated" | "event_upcoming" | "event_today";
      title: string;
      subtitle: string;
      time: Date;
      icon: "job" | "event" | "alert" | "complete" | "payment";
      status?: string;
    }> = [];

    // Recent jobs (sorted by updatedAt)
    const recentJobs = [...jobs]
      .sort((a, b) => new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime())
      .slice(0, 8);

    for (const job of recentJobs) {
      const jobIcon = job.status === "completed" ? "complete" as const : "job" as const;
      items.push({
        id: `job-${job.id}`,
        type: "job_updated",
        title: job.clientName,
        subtitle: `${job.status.replace("_", " ")} — ${job.siteAddress || "No address"}`,
        time: new Date(job.updatedAt || job.createdAt),
        icon: jobIcon,
        status: job.status,
      });
    }

    // Upcoming events
    for (const event of events.slice(0, 6)) {
      const eventDate = new Date(event.startTime);
      const isToday = eventDate.toDateString() === new Date().toDateString();
      items.push({
        id: `event-${event.id}`,
        type: isToday ? "event_today" : "event_upcoming",
        title: event.title,
        subtitle: `${event.jobClientName} — ${eventDate.toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" })}`,
        time: eventDate,
        icon: isToday ? "alert" : "event",
      });
    }

    return items.sort((a, b) => b.time.getTime() - a.time.getTime()).slice(0, 12);
  }, [jobs, events]);

  const utils = trpc.useUtils();
  const handleRefresh = useCallback(async () => {
    await Promise.all([
      utils.construction.jobs.stats.invalidate(),
      utils.construction.jobs.list.invalidate(),
      utils.constructionClients.statusCounts.invalidate(),
      utils.construction.dashboardAnalytics.upcomingMilestones.invalidate(),
      utils.construction.dashboardAnalytics.adviserBreakdown.invalidate(),
      utils.construction.dashboardAnalytics.tradePerformance.invalidate(),
    ]);
  }, [utils]);

  return (
    <PullToRefresh onRefresh={handleRefresh}>
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Onboarding Tours */}
      <OnboardingTour
        tourId={TOUR_IDS.constructionDashboard}
        steps={constructionDashboardTour}
        active={tourActive}
        onComplete={() => setTourActive(false)}
      />


      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <HardHat className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight truncate">Construction Dashboard</h1>
            <p className="text-sm text-muted-foreground truncate">Manage jobs, teams, and project progress{activeFy != null ? ` · FY ${activeFy}-${String(activeFy + 1).slice(-2)}` : ""}</p>
          </div>
          <div className="hidden sm:flex items-center gap-1">
            <HelpLink section="construction-dashboard" tooltip="Help: Construction" />
            <TourHelpButton onClick={() => setTourActive(true)} label="Tour" />
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
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
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const jobs = jobsQuery.data || [];
              if (jobs.length === 0) { toast.info("No jobs to export"); return; }
              const fyLabel = activeFy != null ? `FY${activeFy}-${String(activeFy + 1).slice(-2)}` : "All";
              const headers = ["Job Number", "Client", "Status", "Address", "Contract Value", "Created", "Updated"];
              const rows = jobs.map((j: any) => [
                j.jobNumber || j.quoteNumber || "",
                j.clientName || "",
                j.status || "",
                j.siteAddress || "",
                j.contractValue != null ? j.contractValue : "",
                j.createdAt ? new Date(j.createdAt).toLocaleDateString("en-AU") : "",
                j.updatedAt ? new Date(j.updatedAt).toLocaleDateString("en-AU") : "",
              ]);
              const csv = [headers, ...rows].map(r => r.map((c: any) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
              const blob = new Blob([csv], { type: "text/csv" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url; a.download = `construction-jobs-${fyLabel}.csv`; a.click();
              URL.revokeObjectURL(url);
              toast.success(`Exported ${jobs.length} jobs to CSV`);
            }}
          >
            <Download className="h-4 w-4 sm:mr-1" />
            <span className="hidden sm:inline">Export CSV</span>
          </Button>
        <Dialog open={showCreateJob} onOpenChange={setShowCreateJob}>
          <DialogTrigger asChild>
            <Button size="sm" variant="brand"><Plus className="h-4 w-4 sm:mr-2" /><span className="hidden sm:inline">New Job</span></Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Construction Job</DialogTitle>
            </DialogHeader>
            <CreateJobForm
              onSubmit={(data) => createJob.mutate(data)}
              loading={createJob.isPending}
            />
          </DialogContent>
        </Dialog>
        </div>
      </div>

      {/* ═══ KPI Cards ═══ */}
      <div data-tour="overview-kpis" className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          title="Active Jobs"
          value={String((stats?.inProgress || 0) + (stats?.scheduled || 0))}
          subtitle={`${stats?.inProgress || 0} in progress, ${stats?.scheduled || 0} scheduled`}
          icon={Wrench}
          accent={stats?.inProgress ? "text-amber-600" : undefined}
          onClick={() => navigate("/construction/jobs?status=in_progress")}
        />
        <KPICard
          title="Completed"
          value={String(stats?.completed || 0)}
          subtitle={`of ${stats?.total || 0} total jobs`}
          icon={CheckCircle2}
          accent="text-emerald-600"
          onClick={() => navigate("/construction/jobs?status=completed")}
        />
        <KPICard
          title="Revenue"
          value={formatCurrency(financial?.totalRevenue || 0)}
          subtitle={`${financial?.avgMarginPercent || 0}% avg margin`}
          icon={DollarSign}
          onClick={() => navigate("/construction/jobs")}
        />
        <KPICard
          title="This Week"
          value={String(upcomingCount)}
          subtitle={`upcoming events${overdueJobs.length > 0 ? ` · ${overdueJobs.length} overdue` : ""}`}
          icon={Calendar}
          accent={overdueJobs.length > 0 ? "text-red-500" : undefined}
          onClick={() => navigate("/construction/schedule")}
        />
      </div>

      {/* ═══ Project Health Summary ═══ */}
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

      {/* ═══ Overdue Plans Alert ═══ */}
      {overduePlansQuery.data && overduePlansQuery.data.count > 0 && (
        <Card className="border-amber-300 dark:border-amber-700 bg-amber-50/50 dark:bg-amber-950/20">
          <CardContent className="py-3 px-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-full bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center">
                  <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
                    {overduePlansQuery.data.count} Plan{overduePlansQuery.data.count > 1 ? "s" : ""} Awaiting Client Approval (7+ days)
                  </p>
                  <p className="text-xs text-amber-700 dark:text-amber-400">
                    {overduePlansQuery.data.plans.slice(0, 3).map(p => p.title).join(", ")}
                    {overduePlansQuery.data.count > 3 ? ` and ${overduePlansQuery.data.count - 3} more` : ""}
                  </p>
                </div>
              </div>
              <Button variant="outline" size="sm" className="border-amber-300 text-amber-800 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/30" onClick={() => navigate("/construction/clients")}>
                View Plans <ArrowRight className="h-3.5 w-3.5 ml-1" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ═══ Approvals Status Summary ═══ */}
      {baCountsQuery.data && (baCountsQuery.data.pending + baCountsQuery.data.lodged + baCountsQuery.data.overdue) > 0 && (
        <Card className="border-none shadow-sm bg-muted/30">
          <CardContent className="py-3 px-4">
            <div className="flex items-center gap-4 flex-wrap">
              <span className="text-sm font-medium text-muted-foreground">Approvals</span>
              <div className="flex items-center gap-3">
                {baCountsQuery.data.approved > 0 && (
                  <div className="flex items-center gap-1.5">
                    <span className="h-3 w-3 rounded-full bg-emerald-500 inline-block" />
                    <span className="text-sm font-semibold">{baCountsQuery.data.approved}</span>
                    <span className="text-xs text-muted-foreground">Approved</span>
                  </div>
                )}
                {baCountsQuery.data.pending > 0 && (
                  <div className="flex items-center gap-1.5">
                    <span className="h-3 w-3 rounded-full bg-amber-500 inline-block" />
                    <span className="text-sm font-semibold">{baCountsQuery.data.pending}</span>
                    <span className="text-xs text-muted-foreground">Pending</span>
                  </div>
                )}
                {baCountsQuery.data.lodged > 0 && (
                  <div className="flex items-center gap-1.5">
                    <span className="h-3 w-3 rounded-full bg-blue-500 inline-block" />
                    <span className="text-sm font-semibold">{baCountsQuery.data.lodged}</span>
                    <span className="text-xs text-muted-foreground">Lodged</span>
                  </div>
                )}
                {baCountsQuery.data.overdue > 0 && (
                  <div className="flex items-center gap-1.5">
                    <span className="h-3 w-3 rounded-full bg-red-500 inline-block" />
                    <span className="text-sm font-semibold">{baCountsQuery.data.overdue}</span>
                    <span className="text-xs text-muted-foreground">Overdue</span>
                  </div>
                )}
                {baCountsQuery.data.exempt > 0 && (
                  <div className="flex items-center gap-1.5">
                    <span className="h-3 w-3 rounded-full bg-gray-400 inline-block" />
                    <span className="text-sm font-semibold">{baCountsQuery.data.exempt}</span>
                    <span className="text-xs text-muted-foreground">Exempt</span>
                  </div>
                )}
              </div>
              <Button variant="ghost" size="sm" className="ml-auto text-xs" onClick={() => navigate("/construction/clients")}>
                View All <ArrowRight className="h-3 w-3 ml-1" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ═══ Quick Actions Row ═══ */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <QuickActionCard
          icon={CalendarDays}
          label="Work Schedule"
          onClick={() => navigate("/construction/schedule")}
        />
        <QuickActionCard
          icon={ClipboardList}
          label="Project Plan"
          onClick={() => navigate("/construction/project-plan")}
        />
        <QuickActionCard
          icon={Users}
          label="Clients"
          onClick={() => navigate("/construction/clients")}
        />
        <QuickActionCard
          icon={TrendingUp}
          label="Financial Overview"
          onClick={() => navigate("/construction/financial")}
        />
      </div>

      {/* ═══ Activity Feed + Upcoming Events ═══ */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Activity Feed */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base font-medium flex items-center gap-2">
                  <Activity className="h-4 w-4 text-primary" />
                  Recent Activity
                </CardTitle>
                <CardDescription className="text-xs">Latest job updates and events</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            {activityFeed.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                <Activity className="h-8 w-8 mx-auto mb-2 opacity-30" />
                No recent activity
              </div>
            ) : (
              <div className="space-y-1">
                {activityFeed.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-start gap-3 py-2.5 px-2 rounded-lg hover:bg-muted/50 transition-colors group"
                  >
                    <div className={`mt-0.5 h-7 w-7 rounded-full flex items-center justify-center shrink-0 ${
                      item.icon === "alert"
                        ? "bg-amber-100 text-amber-600 dark:bg-amber-900/30"
                        : item.icon === "event"
                        ? "bg-blue-100 text-blue-600 dark:bg-blue-900/30"
                        : item.icon === "complete"
                        ? "bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30"
                        : item.icon === "payment"
                        ? "bg-green-100 text-green-600 dark:bg-green-900/30"
                        : "bg-muted text-muted-foreground"
                    }`}>
                      {item.icon === "alert" ? (
                        <Bell className="h-3.5 w-3.5" />
                      ) : item.icon === "event" ? (
                        <Calendar className="h-3.5 w-3.5" />
                      ) : item.icon === "complete" ? (
                        <CheckCircle2 className="h-3.5 w-3.5" />
                      ) : item.icon === "payment" ? (
                        <DollarSign className="h-3.5 w-3.5" />
                      ) : (
                        <HardHat className="h-3.5 w-3.5" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium truncate">{item.title}</p>
                        {item.status && (
                          <Badge variant="secondary" className={`text-[10px] px-1.5 py-0 ${statusColors[item.status] || ""}`}>
                            {item.status.replace("_", " ")}
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground truncate">{item.subtitle}</p>
                    </div>
                    <span className="text-[10px] text-muted-foreground/60 shrink-0 mt-0.5">
                      {formatTimeAgo(item.time)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Upcoming Events Sidebar */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-medium flex items-center gap-2">
              <CalendarDays className="h-4 w-4 text-primary" />
              Upcoming Events
            </CardTitle>
            <CardDescription className="text-xs">Next 7 days</CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            {events.length === 0 ? (
              <div className="py-6 text-center text-sm text-muted-foreground">
                <CalendarDays className="h-8 w-8 mx-auto mb-2 opacity-30" />
                No upcoming events
              </div>
            ) : (
              <div className="space-y-2">
                {events.slice(0, 6).map((event) => {
                  const eventDate = new Date(event.startTime);
                  const isToday = eventDate.toDateString() === new Date().toDateString();
                  return (
                    <div
                      key={event.id}
                      className={`p-2.5 rounded-lg border text-sm ${
                        isToday ? "border-amber-200 bg-amber-50/50 dark:border-amber-800 dark:bg-amber-900/10" : "border-border"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        {isToday && <span className="text-[10px] font-semibold text-amber-600 uppercase">Today</span>}
                        <span className="text-xs text-muted-foreground">
                          {eventDate.toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" })}
                        </span>
                      </div>
                      <p className="font-medium text-sm mt-0.5 truncate">{event.title}</p>
                      <p className="text-xs text-muted-foreground truncate">{event.jobClientName}</p>
                      {event.installerName && (
                        <p className="text-xs text-muted-foreground/70 mt-0.5">
                          <Users className="h-3 w-3 inline mr-1" />{event.installerName}
                        </p>
                      )}
                    </div>
                  );
                })}
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full text-xs text-muted-foreground"
                  onClick={() => navigate("/construction/schedule")}
                >
                  View Full Schedule <ArrowRight className="h-3 w-3 ml-1" />
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ═══ Overdue Alert ═══ */}
      {overdueJobs.length > 0 && (
        <Card className="border-red-200 bg-red-50/50 dark:border-red-800 dark:bg-red-900/10">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                <AlertTriangle className="h-4 w-4 text-red-600" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-red-800 dark:text-red-300">
                  {overdueJobs.length} Overdue Job{overdueJobs.length > 1 ? "s" : ""}
                </p>
                <p className="text-xs text-red-600/70 dark:text-red-400/70">
                  {overdueJobs.map(j => j.clientName).join(", ")}
                </p>
              </div>
              <Button variant="outline" size="sm" className="text-red-700 border-red-200" onClick={() => {
                setStatusFilter("in_progress");
              }}>
                View
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ═══ Upcoming Milestones ═══ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-medium flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-primary" />
              Upcoming Payment Milestones
            </CardTitle>
            <CardDescription className="text-xs">Pending PO milestones on active jobs</CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            {milestonesQuery.isLoading ? (
              <Skeleton className="h-32 w-full" />
            ) : !milestonesQuery.data?.milestones?.length ? (
              <div className="py-6 text-center text-sm text-muted-foreground">
                <CheckCircle2 className="h-8 w-8 mx-auto mb-2 opacity-30" />
                No pending milestones
              </div>
            ) : (
              <div className="space-y-1 max-h-[300px] overflow-y-auto">
                {milestonesQuery.data.milestones.map((m: any) => (
                  <div
                    key={m.id}
                    className="flex items-center justify-between py-2 px-2 rounded-lg hover:bg-muted/50 transition-colors cursor-pointer"
                    onClick={() => navigate(`/construction/clients/${m.jobId}`)}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{m.clientName}</p>
                      <p className="text-xs text-muted-foreground truncate">{m.stage} — {m.description || 'Milestone'}</p>
                    </div>
                    <div className="text-right shrink-0 ml-3">
                      <p className="text-sm font-semibold">{formatCurrency(Number(m.amount) || 0)}</p>
                      <Badge variant="secondary" className="text-[10px] px-1.5">{m.status}</Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-medium flex items-center gap-2">
              <Calendar className="h-4 w-4 text-primary" />
              Upcoming Job Starts
            </CardTitle>
            <CardDescription className="text-xs">Scheduled starts in the next 30 days</CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            {milestonesQuery.isLoading ? (
              <Skeleton className="h-32 w-full" />
            ) : !milestonesQuery.data?.upcomingStarts?.length ? (
              <div className="py-6 text-center text-sm text-muted-foreground">
                <Calendar className="h-8 w-8 mx-auto mb-2 opacity-30" />
                No upcoming starts
              </div>
            ) : (
              <div className="space-y-1 max-h-[300px] overflow-y-auto">
                {milestonesQuery.data.upcomingStarts.map((j: any) => (
                  <div
                    key={j.id}
                    className="flex items-center justify-between py-2 px-2 rounded-lg hover:bg-muted/50 transition-colors cursor-pointer"
                    onClick={() => navigate(`/construction/clients/${j.id}`)}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{j.clientName}</p>
                      <p className="text-xs text-muted-foreground truncate">{j.siteAddress || 'No address'}</p>
                    </div>
                    <div className="text-right shrink-0 ml-3">
                      <p className="text-sm font-medium">
                        {j.scheduledStart ? new Date(j.scheduledStart).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
                      </p>
                      <Badge variant="secondary" className={`text-[10px] px-1.5 ${j.priority === 'urgent' ? 'bg-red-100 text-red-700' : j.priority === 'high' ? 'bg-orange-100 text-orange-700' : ''}`}>
                        {j.priority || 'normal'}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ═══ Adviser / Branch Breakdown ═══ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-medium flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" />
              Design Adviser Breakdown
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {adviserBreakdownQuery.isLoading ? (
              <Skeleton className="h-32 w-full" />
            ) : !adviserBreakdownQuery.data?.byAdviser?.length ? (
              <p className="text-sm text-muted-foreground text-center py-6">No data</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-xs text-muted-foreground">
                      <th className="text-left py-2 font-medium">Adviser</th>
                      <th className="text-center py-2 font-medium">Total</th>
                      <th className="text-center py-2 font-medium">Active</th>
                      <th className="text-center py-2 font-medium">Done</th>
                      <th className="text-center py-2 font-medium">Hold</th>
                    </tr>
                  </thead>
                  <tbody>
                    {adviserBreakdownQuery.data.byAdviser.map((a: any) => (
                      <tr key={a.adviserName || 'unknown'} className="border-b last:border-0 hover:bg-muted/30">
                        <td className="py-2 font-medium truncate max-w-[140px]">{a.adviserName || 'Unassigned'}</td>
                        <td className="text-center py-2 tabular-nums">{Number(a.total)}</td>
                        <td className="text-center py-2 tabular-nums text-amber-600">{Number(a.inProgress) + Number(a.scheduled)}</td>
                        <td className="text-center py-2 tabular-nums text-green-600">{Number(a.completed)}</td>
                        <td className="text-center py-2 tabular-nums text-orange-600">{Number(a.onHold)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-medium flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-primary" />
              Branch Breakdown
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {adviserBreakdownQuery.isLoading ? (
              <Skeleton className="h-32 w-full" />
            ) : !adviserBreakdownQuery.data?.byBranch?.length ? (
              <p className="text-sm text-muted-foreground text-center py-6">No data</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-xs text-muted-foreground">
                      <th className="text-left py-2 font-medium">Branch</th>
                      <th className="text-center py-2 font-medium">Jobs</th>
                      <th className="text-right py-2 font-medium">Contract Value</th>
                      <th className="text-right py-2 font-medium">Invoiced</th>
                    </tr>
                  </thead>
                  <tbody>
                    {adviserBreakdownQuery.data.byBranch.map((b: any) => (
                      <tr key={b.branch || 'unknown'} className="border-b last:border-0 hover:bg-muted/30">
                        <td className="py-2 font-medium">{b.branch || 'Unknown'}</td>
                        <td className="text-center py-2 tabular-nums">{Number(b.total)}</td>
                        <td className="text-right py-2 tabular-nums">{formatCurrency(Number(b.totalContractValue) || 0)}</td>
                        <td className="text-right py-2 tabular-nums">{formatCurrency(Number(b.totalInvoiced) || 0)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ═══ Trade Performance ═══ */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base font-medium flex items-center gap-2">
                <Wrench className="h-4 w-4 text-primary" />
                Trade Performance
              </CardTitle>
              <CardDescription className="text-xs">Click a trade to see their activity</CardDescription>
            </div>
            {selectedTradeId && (
              <Button variant="ghost" size="sm" onClick={() => setSelectedTradeId(null)}>
                <X className="h-4 w-4 mr-1" /> Close Detail
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {tradePerformanceQuery.isLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : !tradePerformanceQuery.data?.length ? (
            <div className="py-6 text-center text-sm text-muted-foreground">
              <Users className="h-8 w-8 mx-auto mb-2 opacity-30" />
              No active trades
            </div>
          ) : (
            <div className={`grid ${selectedTradeId ? 'grid-cols-1 lg:grid-cols-2' : 'grid-cols-1'} gap-4`}>
              {/* Trade Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-xs text-muted-foreground">
                      <th className="text-left py-2 font-medium">Trade</th>
                      <th className="text-left py-2 font-medium">Type</th>
                      <th className="text-center py-2 font-medium">Jobs</th>
                      <th className="text-right py-2 font-medium">Invoiced</th>
                      <th className="text-right py-2 font-medium">Paid</th>
                      <th className="text-right py-2 font-medium">Outstanding</th>
                      <th className="text-center py-2 font-medium">Pending</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tradePerformanceQuery.data.map((t: any) => (
                      <tr
                        key={t.id}
                        className={`border-b last:border-0 cursor-pointer transition-colors ${
                          selectedTradeId === t.id ? 'bg-primary/5 border-primary/20' : 'hover:bg-muted/30'
                        }`}
                        onClick={() => setSelectedTradeId(selectedTradeId === t.id ? null : t.id)}
                      >
                        <td className="py-2 font-medium truncate max-w-[140px]">{t.name}</td>
                        <td className="py-2 text-muted-foreground text-xs">{t.tradeType || t.speciality || '—'}</td>
                        <td className="text-center py-2 tabular-nums">{t.jobsAssigned}</td>
                        <td className="text-right py-2 tabular-nums">{formatCurrency(t.totalInvoiced)}</td>
                        <td className="text-right py-2 tabular-nums text-green-600">{formatCurrency(t.totalPaid)}</td>
                        <td className="text-right py-2 tabular-nums text-amber-600">{formatCurrency(t.outstanding)}</td>
                        <td className="text-center py-2">
                          {t.pendingInvoices > 0 && (
                            <Badge variant="secondary" className="text-[10px] bg-amber-100 text-amber-700">{t.pendingInvoices}</Badge>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 font-semibold text-xs">
                      <td className="py-2">Total</td>
                      <td></td>
                      <td className="text-center py-2 tabular-nums">
                        {tradePerformanceQuery.data.reduce((s: number, t: any) => s + t.jobsAssigned, 0)}
                      </td>
                      <td className="text-right py-2 tabular-nums">
                        {formatCurrency(tradePerformanceQuery.data.reduce((s: number, t: any) => s + t.totalInvoiced, 0))}
                      </td>
                      <td className="text-right py-2 tabular-nums text-green-600">
                        {formatCurrency(tradePerformanceQuery.data.reduce((s: number, t: any) => s + t.totalPaid, 0))}
                      </td>
                      <td className="text-right py-2 tabular-nums text-amber-600">
                        {formatCurrency(tradePerformanceQuery.data.reduce((s: number, t: any) => s + t.outstanding, 0))}
                      </td>
                      <td className="text-center py-2 tabular-nums">
                        {tradePerformanceQuery.data.reduce((s: number, t: any) => s + t.pendingInvoices, 0)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* Trade Detail Drill-down */}
              {selectedTradeId && (
                <div className="border-l pl-4 space-y-4">
                  {tradeDetailQuery.isLoading ? (
                    <Skeleton className="h-40 w-full" />
                  ) : tradeDetailQuery.data?.installer ? (
                    <>
                      <div>
                        <h4 className="font-semibold text-sm">{tradeDetailQuery.data.installer.name}</h4>
                        <div className="flex gap-3 text-xs text-muted-foreground mt-1">
                          {tradeDetailQuery.data.installer.phone && <span>{tradeDetailQuery.data.installer.phone}</span>}
                          {tradeDetailQuery.data.installer.email && <span>{tradeDetailQuery.data.installer.email}</span>}
                        </div>
                      </div>

                      {/* Jobs */}
                      <div>
                        <h5 className="text-xs font-medium text-muted-foreground mb-2">Assigned Jobs ({tradeDetailQuery.data.jobs.length})</h5>
                        {tradeDetailQuery.data.jobs.length === 0 ? (
                          <p className="text-xs text-muted-foreground italic">No jobs assigned</p>
                        ) : (
                          <div className="space-y-1 max-h-[200px] overflow-y-auto">
                            {tradeDetailQuery.data.jobs.map((j: any) => (
                              <div
                                key={j.jobId}
                                className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-muted/50 cursor-pointer text-xs"
                                onClick={() => navigate(`/construction/clients/${j.jobId}`)}
                              >
                                <div className="min-w-0 flex-1">
                                  <span className="font-medium">{j.clientName}</span>
                                  {j.role && <span className="text-muted-foreground ml-1">({j.role})</span>}
                                </div>
                                <Badge variant="secondary" className={`text-[10px] px-1.5 ${statusColors[j.jobStatus] || ''}`}>
                                  {j.jobStatus?.replace('_', ' ')}
                                </Badge>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Invoices */}
                      <div>
                        <h5 className="text-xs font-medium text-muted-foreground mb-2">Invoices ({tradeDetailQuery.data.invoices.length})</h5>
                        {tradeDetailQuery.data.invoices.length === 0 ? (
                          <p className="text-xs text-muted-foreground italic">No invoices</p>
                        ) : (
                          <div className="space-y-1 max-h-[200px] overflow-y-auto">
                            {tradeDetailQuery.data.invoices.map((inv: any) => (
                              <div key={inv.id} className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-muted/50 text-xs">
                                <div className="min-w-0 flex-1">
                                  <span className="font-medium font-mono">{inv.invoiceNumber || `INV-${inv.id}`}</span>
                                  <span className="text-muted-foreground ml-2">{inv.clientName}</span>
                                  {inv.invoiceDate && (
                                    <span className="text-muted-foreground ml-2">
                                      {new Date(inv.invoiceDate).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}
                                    </span>
                                  )}
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                  <span className="font-semibold tabular-nums">
                                    {formatCurrency(Number(inv.totalWithGst || inv.amount) || 0)}
                                  </span>
                                  <Badge variant="secondary" className={`text-[10px] px-1.5 ${
                                    inv.status === 'paid' ? 'bg-green-100 text-green-700' :
                                    inv.status === 'approved' ? 'bg-blue-100 text-blue-700' :
                                    'bg-amber-100 text-amber-700'
                                  }`}>
                                    {inv.status}
                                  </Badge>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground">Trade not found</p>
                  )}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
    </PullToRefresh>
  );
}

// ─── KPI Card ────────────────────────────────────────────────────────────────
function KPICard({
  title,
  value,
  subtitle,
  icon: Icon,
  accent,
  onClick,
}: {
  title: string;
  value: string;
  subtitle: string;
  icon: any;
  accent?: string;
  onClick?: () => void;
}) {
  return (
    <Card className={onClick ? "cursor-pointer hover:shadow-md hover:-translate-y-0.5 transition-all" : ""} onClick={onClick}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <p className={`text-2xl font-semibold tracking-tight tabular-nums ${accent || ""}`}>
              {value}
            </p>
            <p className="text-xs text-muted-foreground">{title}</p>
          </div>
          <div className="h-9 w-9 rounded-lg bg-muted flex items-center justify-center">
            <Icon className="h-4 w-4 text-muted-foreground" />
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground/70 mt-2">{subtitle}</p>
      </CardContent>
    </Card>
  );
}

// ─── Quick Action Card ──────────────────────────────────────────────────────
function QuickActionCard({ icon: Icon, label, onClick }: { icon: any; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-3 p-3 rounded-xl border border-border bg-card hover:bg-accent/50 transition-colors text-left group"
    >
      <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
        <Icon className="h-4 w-4 text-primary" />
      </div>
      <div>
        <p className="text-sm font-medium">{label}</p>
      </div>
      <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground/50 ml-auto" />
    </button>
  );
}

// ─── Time Ago Helper ────────────────────────────────────────────────────────
function formatTimeAgo(date: Date): string {
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString("en-AU", { day: "numeric", month: "short" });
}

// ─── Create Job Form ────────────────────────────────────────────────────────
function CreateJobForm({ onSubmit, loading }: { onSubmit: (data: any) => void; loading: boolean }) {
  const [clientName, setClientName] = useState("");
  const [siteAddress, setSiteAddress] = useState("");
  const [scheduledStart, setScheduledStart] = useState("");
  const [priority, setPriority] = useState("normal");
  const [notes, setNotes] = useState("");
  const [templateId, setTemplateId] = useState<string>("none");

  const templatesQuery = trpc.projectPlanTemplates.listActive.useQuery();

  return (
    <div className="space-y-4">
      <div>
        <Label>Client Name *</Label>
        <Input value={clientName} onChange={(e) => setClientName(e.target.value)} placeholder="e.g. John Smith" />
      </div>
      <div>
        <Label>Site Address</Label>
        <Input value={siteAddress} onChange={(e) => setSiteAddress(e.target.value)} placeholder="e.g. 123 Main St, Brisbane" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Scheduled Start</Label>
          <div className="flex gap-1 items-center">
            <Input type="date" value={scheduledStart} onChange={(e) => setScheduledStart(e.target.value)} className="flex-1" />
            {scheduledStart && <Button type="button" variant="ghost" size="sm" className="h-8 px-2 text-muted-foreground hover:text-destructive" onClick={() => setScheduledStart("")} title="Clear date">&times;</Button>}
          </div>
        </div>
        <div>
          <Label>Priority</Label>
          <Select value={priority} onValueChange={setPriority}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="low">Low</SelectItem>
              <SelectItem value="normal">Normal</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="urgent">Urgent</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div>
        <Label>Seed from Template</Label>
        <Select value={templateId} onValueChange={setTemplateId}>
          <SelectTrigger><SelectValue placeholder="No template" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">No template</SelectItem>
            {templatesQuery.data?.map((tpl) => (
              <SelectItem key={tpl.id} value={String(tpl.id)}>
                {tpl.name}{tpl.isDefault ? " (Default)" : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground mt-1">Auto-creates progress stages and kanban tasks from the template</p>
      </div>
      <div>
        <Label>Notes</Label>
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
      </div>
      <Button
        className="w-full"
        disabled={!clientName || loading}
        onClick={() => onSubmit({
          clientName,
          siteAddress: siteAddress || undefined,
          scheduledStart: scheduledStart || undefined,
          priority,
          notes: notes || undefined,
          templateId: templateId !== "none" ? Number(templateId) : undefined,
        })}
      >
        {loading ? "Creating..." : "Create Job"}
      </Button>
    </div>
  );
}



// ─── Job Detail Panel ───────────────────────────────────────────────────────
function JobDetailPanel({
  job,
  installers,
  onUpdateStatus,
  onUpdatePriority,
  onUpdateProgress,
  onAssign,
  onUnassign,
  onDelete,
  onClose,
}: {
  job: any;
  installers: any[];
  onUpdateStatus: (status: string) => void;
  onUpdatePriority: (priority: string) => void;
  onUpdateProgress: (id: number, status: string) => void;
  onAssign: (installerId: number, role: string) => void;
  onUnassign: (id: number) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const [assignInstallerId, setAssignInstallerId] = useState("");

  const totalStages = job.progress?.length || 0;
  const completedStages = job.progress?.filter((s: any) => s.status === "completed").length || 0;
  const progressPercent = totalStages > 0 ? Math.round((completedStages / totalStages) * 100) : 0;

  return (
    <Card>
      <CardContent className="p-5 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
              <h3 className="font-semibold text-lg">{job.clientName}</h3>
            {((job as any).jobNumber || job.quoteNumber) && <p className="text-xs text-muted-foreground font-mono">{(job as any).jobNumber || job.quoteNumber}</p>}
          </div>
          <div className="flex gap-1">
            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => {
              if (confirm("Delete this job?")) onDelete();
            }}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        {job.siteAddress && <p className="text-sm text-muted-foreground">{job.siteAddress}</p>}

        {/* Status & Priority */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">Status</Label>
            <Select value={job.status} onValueChange={onUpdateStatus}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="scheduled">Scheduled</SelectItem>
                <SelectItem value="in_progress">In Progress</SelectItem>
                <SelectItem value="on_hold">On Hold</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Priority</Label>
            <Select value={job.priority} onValueChange={onUpdatePriority}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="low">Low</SelectItem>
                <SelectItem value="normal">Normal</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="urgent">Urgent</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Progress Bar */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <Label className="text-xs">Progress</Label>
            <span className="text-xs text-muted-foreground">{completedStages}/{totalStages} stages ({progressPercent}%)</span>
          </div>
          <div className="w-full bg-muted rounded-full h-2">
            <div className="bg-primary rounded-full h-2 transition-all" style={{ width: `${progressPercent}%` }} />
          </div>
        </div>

        {/* Progress Stages */}
        <div>
          <Label className="text-xs mb-2 block">Construction Stages</Label>
          <div className="space-y-1.5 max-h-48 overflow-y-auto">
            {job.progress?.map((stage: any) => (
              <div key={stage.id} className="flex items-center gap-2 text-sm">
                <button
                  className="flex-shrink-0"
                  onClick={() => {
                    const nextStatus = stage.status === "pending" ? "in_progress" : stage.status === "in_progress" ? "completed" : "pending";
                    onUpdateProgress(stage.id, nextStatus);
                  }}
                >
                  {stageStatusIcons[stage.status]}
                </button>
                <span className={stage.status === "completed" ? "line-through text-muted-foreground" : ""}>
                  {stage.stage}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Assigned Installers */}
        <div>
          <Label className="text-xs mb-2 block">Assigned Installers</Label>
          {job.assignments?.length > 0 ? (
            <div className="space-y-2">
              {job.assignments.map((a: any) => (
                <div key={a.id} className="flex items-center justify-between text-sm bg-muted/50 rounded px-2 py-1.5">
                  <div>
                    <span className="font-medium">{a.installerName}</span>
                    {a.installerSpeciality && <span className="text-xs text-muted-foreground ml-1">({a.installerSpeciality})</span>}
                  </div>
                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => onUnassign(a.id)}>
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">No installers assigned</p>
          )}

          {/* Assign new installer */}
          <div className="flex gap-2 mt-2">
            <Select value={assignInstallerId} onValueChange={setAssignInstallerId}>
              <SelectTrigger className="flex-1">
                <SelectValue placeholder="Select installer..." />
              </SelectTrigger>
              <SelectContent>
                {installers
                  .filter((i) => !job.assignments?.some((a: any) => a.installerId === i.id))
                  .map((i) => (
                    <SelectItem key={i.id} value={String(i.id)}>{i.name}</SelectItem>
                  ))}
              </SelectContent>
            </Select>
            <Button
              size="sm"
              variant="outline"
              disabled={!assignInstallerId}
              onClick={() => {
                onAssign(Number(assignInstallerId), "installer");
                setAssignInstallerId("");
              }}
            >
              <UserPlus className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Notes */}
        {job.notes && (
          <div>
            <Label className="text-xs">Notes</Label>
            <p className="text-sm text-muted-foreground mt-1">{job.notes}</p>
          </div>
        )}

        {/* Job Financial Summary */}
        <JobFinancialSummary jobId={job.id} />

        {/* SMS Delivery Log */}
        <SmsDeliverySection jobId={job.id} />

        {/* Quick Portal Link */}
        <PortalLinkButton jobId={job.id} clientName={job.clientName} />

        {/* Subcontracts */}
        <SubcontractSection jobId={job.id} />
      </CardContent>
    </Card>
  );
}

// ─── Job Financial Summary ─────────────────────────────────────────────────
function JobFinancialSummary({ jobId }: { jobId: number }) {
  const { data: fin, isLoading } = trpc.xeroProjects.getJobFinancialSummary.useQuery(
    { jobId },
    { enabled: !!jobId }
  );

  if (isLoading) return <Skeleton className="h-32 w-full" />;
  if (!fin) return null;

  const fmt = (v: number) => "$" + v.toLocaleString("en-AU", { minimumFractionDigits: 0, maximumFractionDigits: 0 });

  return (
    <div className="space-y-3 pt-3 border-t">
      <Label className="text-xs font-semibold flex items-center gap-1">
        <DollarSign className="h-3 w-3" /> Financial Summary
      </Label>

      {/* Client Side */}
      {fin.clientSide.xeroProjectLinked && (
        <div className="bg-blue-50 rounded-lg p-3 space-y-1">
          <p className="text-[11px] font-medium text-blue-800 uppercase tracking-wide">Client Side</p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
            <span className="text-muted-foreground">Contract</span>
            <span className="text-right font-medium">{fmt(fin.clientSide.contractValue)}</span>
            <span className="text-muted-foreground">Invoiced</span>
            <span className="text-right font-medium">{fmt(fin.clientSide.invoiced)}</span>
          </div>
        </div>
      )}

      {/* Trade Side */}
      <div className="bg-amber-50 rounded-lg p-3 space-y-1">
        <p className="text-[11px] font-medium text-amber-800 uppercase tracking-wide">Trade Side</p>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
          <span className="text-muted-foreground">PO Total ({fin.tradeSide.poCount} milestones)</span>
          <span className="text-right font-medium">{fmt(fin.tradeSide.poTotal)}</span>
          <span className="text-muted-foreground">Invoiced ({fin.tradeSide.invoiceCount})</span>
          <span className="text-right font-medium">{fmt(fin.tradeSide.invoiced)}</span>
          <span className="text-muted-foreground">Paid</span>
          <span className="text-right font-medium text-green-700">{fmt(fin.tradeSide.paid)}</span>
          <span className="text-muted-foreground">Retention Held</span>
          <span className="text-right font-medium text-amber-700">{fmt(fin.tradeSide.retentionHeld)}</span>
          <span className="text-muted-foreground">Remaining</span>
          <span className="text-right font-medium">{fmt(fin.tradeSide.remaining)}</span>
        </div>
      </div>

      {/* Margin */}
      {fin.margin !== 0 && (
        <div className="flex items-center justify-between text-xs px-1">
          <span className="text-muted-foreground">Estimated Margin</span>
          <span className={`font-semibold ${fin.margin >= 0 ? "text-green-700" : "text-red-600"}`}>
            {fmt(fin.margin)}
          </span>
        </div>
      )}
    </div>
  );
}

// ─── Portal Link Button ────────────────────────────────────────────────────
function PortalLinkButton({ jobId, clientName }: { jobId: number; clientName: string }) {
  const getOrCreate = trpc.adminPortal.getOrCreatePortalAccess.useMutation({
    onSuccess: (data) => {
      const portalUrl = `${window.location.origin}/portal/login?token=${data.token}`;
      navigator.clipboard.writeText(portalUrl).then(() => {
        toast.success(
          data.created
            ? `Portal access created for ${clientName}. Link copied!`
            : "Portal link copied to clipboard!"
        );
      }).catch(() => {
        toast.info(`Portal link: ${portalUrl}`);
      });
    },
    onError: (err) => {
      toast.error(err.message || "Failed to get portal link");
    },
  });

  return (
    <div className="pt-2 border-t">
      <Button
        variant="outline"
        size="sm"
        className="w-full gap-2"
        disabled={getOrCreate.isPending}
        onClick={() => getOrCreate.mutate({ constructionJobId: jobId, clientName })}
      >
        {getOrCreate.isPending ? (
          <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Getting link...</>
        ) : (
          <><Link2 className="h-3.5 w-3.5" /> Copy Portal Link</>
        )}
      </Button>
    </div>
  );
}

// ─── SMS Delivery Log Section ─────────────────────────────────────────────────
function SmsDeliverySection({ jobId }: { jobId: number }) {
  const { data: smsLogs, isLoading } = trpc.construction.smsLogs.useQuery({ jobId });

  if (isLoading) return null;
  if (!smsLogs || smsLogs.length === 0) return null;

  return (
    <div>
      <Label className="text-xs mb-2 flex items-center gap-1.5">
        <MessageSquare className="h-3.5 w-3.5" />
        SMS Notifications ({smsLogs.length})
      </Label>
      <div className="space-y-1.5 max-h-36 overflow-y-auto">
        {smsLogs.map((log: any) => (
          <div key={log.id} className="text-xs bg-muted/50 rounded px-2 py-1.5 space-y-0.5">
            <div className="flex items-center justify-between">
              <span className="font-medium">{log.recipient}</span>
              <Badge variant={log.status === "sent" ? "default" : "destructive"} className="text-[10px] px-1.5 py-0">
                {log.status}
              </Badge>
            </div>
            <p className="text-muted-foreground truncate">{log.body}</p>
            {log.errorMessage && <p className="text-destructive text-[10px]">{log.errorMessage}</p>}
            <p className="text-muted-foreground text-[10px]">
              {new Date(log.sentAt).toLocaleString("en-AU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Job Calendar View ──────────────────────────────────────────────────────
function JobCalendarView({ jobs, onSelectJob }: { jobs: any[]; onSelectJob: (id: number) => void }) {
  const [viewMode, setViewMode] = useState<"week" | "month">("month");
  const [currentDate, setCurrentDate] = useState(() => new Date());

  const navigatePrev = () => {
    const d = new Date(currentDate);
    if (viewMode === "month") d.setMonth(d.getMonth() - 1);
    else d.setDate(d.getDate() - 7);
    setCurrentDate(d);
  };
  const navigateNext = () => {
    const d = new Date(currentDate);
    if (viewMode === "month") d.setMonth(d.getMonth() + 1);
    else d.setDate(d.getDate() + 7);
    setCurrentDate(d);
  };
  const navigateToday = () => setCurrentDate(new Date());

  // Generate days for the calendar grid
  const calendarDays = useMemo(() => {
    if (viewMode === "month") {
      const year = currentDate.getFullYear();
      const month = currentDate.getMonth();
      const firstDay = new Date(year, month, 1);
      const lastDay = new Date(year, month + 1, 0);
      const startOffset = firstDay.getDay(); // 0=Sun
      const days: Date[] = [];
      for (let i = startOffset - 1; i >= 0; i--) {
        const d = new Date(year, month, -i);
        days.push(d);
      }
      for (let i = 1; i <= lastDay.getDate(); i++) {
        days.push(new Date(year, month, i));
      }
      while (days.length < 42) {
        const d = new Date(year, month + 1, days.length - startOffset - lastDay.getDate() + 1);
        days.push(d);
      }
      return days;
    } else {
      const d = new Date(currentDate);
      const dayOfWeek = d.getDay();
      const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
      const monday = new Date(d);
      monday.setDate(d.getDate() + mondayOffset);
      const days: Date[] = [];
      for (let i = 0; i < 7; i++) {
        const day = new Date(monday);
        day.setDate(monday.getDate() + i);
        days.push(day);
      }
      return days;
    }
  }, [currentDate, viewMode]);

  // Map jobs to days
  const jobsByDate = useMemo(() => {
    const map: Record<string, any[]> = {};
    for (const job of jobs) {
      if (job.scheduledStart) {
        const dateKey = new Date(job.scheduledStart).toISOString().slice(0, 10);
        if (!map[dateKey]) map[dateKey] = [];
        map[dateKey].push(job);
      }
    }
    return map;
  }, [jobs]);

  const headerLabel = viewMode === "month"
    ? currentDate.toLocaleDateString("en-AU", { month: "long", year: "numeric" })
    : `Week of ${calendarDays[0]?.toLocaleDateString("en-AU", { day: "numeric", month: "short" })} – ${calendarDays[6]?.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}`;

  const today = new Date().toISOString().slice(0, 10);
  const currentMonth = currentDate.getMonth();

  return (
    <div className="space-y-3">
      {/* Calendar Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={navigatePrev}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={navigateToday}>Today</Button>
          <Button variant="outline" size="sm" onClick={navigateNext}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <h3 className="text-lg font-semibold ml-2">{headerLabel}</h3>
        </div>
        <div className="flex gap-1">
          <Button variant={viewMode === "week" ? "default" : "outline"} size="sm" onClick={() => setViewMode("week")}>Week</Button>
          <Button variant={viewMode === "month" ? "default" : "outline"} size="sm" onClick={() => setViewMode("month")}>Month</Button>
        </div>
      </div>

      {/* Day Headers */}
      <div className="grid grid-cols-7 gap-px bg-border rounded-t-lg overflow-hidden">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
          <div key={day} className="bg-muted px-2 py-1.5 text-center text-xs font-medium text-muted-foreground">
            {day}
          </div>
        ))}
      </div>

      {/* Calendar Grid */}
      <div className="grid grid-cols-7 gap-px bg-border rounded-b-lg overflow-hidden">
        {calendarDays.map((day, idx) => {
          const dateKey = day.toISOString().slice(0, 10);
          const dayJobs = jobsByDate[dateKey] || [];
          const isToday = dateKey === today;
          const isCurrentMonth = day.getMonth() === currentMonth;
          const minHeight = viewMode === "week" ? "min-h-[200px]" : "min-h-[100px]";

          return (
            <div
              key={idx}
              className={`${minHeight} bg-background p-1 ${!isCurrentMonth && viewMode === "month" ? "opacity-40" : ""}`}
            >
              <div className={`text-xs font-medium mb-0.5 px-1 ${isToday ? "bg-primary text-primary-foreground rounded-full w-5 h-5 flex items-center justify-center" : "text-muted-foreground"}`}>
                {day.getDate()}
              </div>
              <div className="space-y-0.5 overflow-y-auto max-h-[80px]">
                {dayJobs.map((job: any) => (
                  <button
                    key={job.id}
                    onClick={() => onSelectJob(job.id)}
                    className={`w-full text-left text-[10px] leading-tight px-1 py-0.5 rounded truncate ${statusColors[job.status] || "bg-muted text-muted-foreground"}`}
                  >
                    {job.clientName}
                    {job.assignments?.length > 0 && (
                      <span className="ml-0.5 opacity-70">• {job.assignments[0].installerName}</span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 text-xs">
        {Object.entries(statusColors).map(([status, cls]) => (
          <div key={status} className="flex items-center gap-1">
            <span className={`inline-block w-3 h-3 rounded ${cls}`} />
            <span className="capitalize">{status.replace("_", " ")}</span>
          </div>
        ))}
      </div>
    </div>
  );
}


// ─── Subcontract Section ─────────────────────────────────────────────────
function SubcontractSection({ jobId }: { jobId: number }) {
  const [, navigate] = useLocation();
  const { data: subcontracts, isLoading } = trpc.subcontract.listByJob.useQuery({ jobId });
  const createMutation = trpc.subcontract.create.useMutation();
  const utils = trpc.useUtils();

  const handleCreate = async () => {
    try {
      const result = await createMutation.mutateAsync({ jobId });
      utils.subcontract.listByJob.invalidate({ jobId });
      navigate(`/subcontracts/${result.id}`);
    } catch (err: any) {
      toast.error(err.message || "Failed to create subcontract");
    }
  };

  const statusBadge = (status: string) => {
    const colors: Record<string, string> = {
      draft: "bg-gray-100 text-gray-700",
      sent: "bg-blue-100 text-blue-700",
      signed: "bg-green-100 text-green-700",
      cancelled: "bg-red-100 text-red-700",
    };
    return <Badge className={`text-[10px] ${colors[status] || ""}`}>{status}</Badge>;
  };

  if (isLoading) return <Skeleton className="h-16 w-full" />;

  return (
    <div className="space-y-2 pt-3 border-t">
      <div className="flex items-center justify-between">
        <Label className="text-xs font-semibold flex items-center gap-1">
          <FileText className="h-3 w-3" /> Subcontracts
        </Label>
        <Button
          variant="outline"
          size="sm"
          className="h-6 text-[10px]"
          onClick={handleCreate}
          disabled={createMutation.isPending}
        >
          <Plus className="h-3 w-3 mr-1" /> New
        </Button>
      </div>

      {subcontracts && subcontracts.length > 0 ? (
        <div className="space-y-1">
          {subcontracts.map((sc: any) => (
            <button
              key={sc.id}
              onClick={() => navigate(`/subcontracts/${sc.id}`)}
              className="w-full flex items-center justify-between text-xs bg-muted/50 rounded px-2 py-1.5 hover:bg-muted transition-colors text-left"
            >
              <div className="flex items-center gap-2">
                <FileText className="h-3 w-3 text-muted-foreground" />
                <span>{sc.subcontractorName || "Unnamed"}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">${sc.subcontractSum || "0.00"}</span>
                {statusBadge(sc.status)}
              </div>
            </button>
          ))}
        </div>
      ) : (
        <p className="text-[10px] text-muted-foreground">No subcontracts yet</p>
      )}
    </div>
  );
}
