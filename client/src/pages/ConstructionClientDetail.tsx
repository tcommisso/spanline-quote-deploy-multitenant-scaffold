import { useState, useMemo, useCallback, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useSwipeTabs } from "@/hooks/useSwipeTabs";
import { useLocation, useParams } from "wouter";
import ContactsSection from "@/components/construction/ContactsSection";
import EmailSmsSection from "@/components/construction/EmailSmsSection";
import ProcurementSection from "@/components/construction/ProcurementSection";

import SharedFilesSection from "@/components/construction/SharedFilesSection";
import { PlanAnnotation } from "@/components/PlanAnnotation";
import { PdfThumbnail } from "@/components/PdfThumbnail";
import { PlanComparison } from "@/components/PlanComparison";
import {
  ArrowLeft, MapPin, Phone, Mail, Calendar, CalendarDays, DollarSign,
  HardHat, CheckCircle2, Clock, AlertTriangle, Ban, User,
  FileText, Wrench, BarChart3, ClipboardList, ExternalLink,
  CircleDot, MessageSquare, Loader2, Plus, Shield, FileCheck,
  ClipboardCheck, Send, Trash2, Eye, RefreshCw, ChevronDown, Menu,
  Users, Package, FolderOpen, PenTool, Download, X, ArrowLeftRight,
  KanbanSquare, GripVertical, Ruler, Clipboard, Printer,
  Cloud, Sun, CloudRain, CloudSun, CloudSnow, CloudDrizzle, CloudLightning, CloudFog, Thermometer,
  Building, Save,
} from "lucide-react";
import { useIsMobile } from "@/hooks/useMobile";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import CouncilSelect from "@/components/CouncilSelect";
import LeadSectionNotes from "@/components/LeadSectionNotes";
import { useBuildingAuthorityOptions, useCouncilLetterTypeOptions } from "@/hooks/useCrmDropdowns";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import {
  DndContext, closestCorners, PointerSensor, KeyboardSensor, useSensor, useSensors,
  DragOverlay, type DragStartEvent, type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { useDroppable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import XeroJobPanel from "@/components/XeroJobPanel";
import ProgressInvoicesCard from "@/components/ProgressInvoicesCard";
import ClientActivityTab from "@/components/ClientActivityTab";
import SitePlanDiagram from "@/components/SitePlanDiagram";
import SitePlanPrintPage from "@/components/SitePlanPrintPage";
import ProjectTeamFields, { type ProjectTeamPayload } from "@/components/construction/ProjectTeamFields";

const STATUS_CONFIG: Record<string, { color: string; icon: any; label: string }> = {
  scheduled: { color: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300", icon: Clock, label: "Scheduled" },
  in_progress: { color: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300", icon: HardHat, label: "In Progress" },
  on_hold: { color: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300", icon: AlertTriangle, label: "On Hold" },
  completed: { color: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300", icon: CheckCircle2, label: "Completed" },
  cancelled: { color: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300", icon: Ban, label: "Cancelled" },
};

const PROGRESS_STATUS_COLORS: Record<string, string> = {
  pending: "bg-slate-200 dark:bg-slate-700",
  in_progress: "bg-amber-400",
  completed: "bg-green-500",
  skipped: "bg-slate-400",
};

/** Traffic light health indicator based on margin % */
function HealthIndicator({ marginPercent }: { marginPercent: number }) {
  let color: string;
  let label: string;
  if (marginPercent >= 45) {
    color = "text-green-500";
    label = "Healthy";
  } else if (marginPercent >= 35) {
    color = "text-amber-500";
    label = "Watch";
  } else {
    color = "text-red-500";
    label = "At Risk";
  }
  return (
    <div className="flex items-center gap-1.5" title={`${label} (${marginPercent.toFixed(1)}% margin)`}>
      <CircleDot className={`h-5 w-5 ${color}`} />
      <span className={`text-xs font-medium ${color}`}>{label}</span>
    </div>
  );
}

// ─── Weather helpers ─────────────────────────────────────────────────────────
function getWeatherIconForCode(code: number) {
  if (code === 0 || code === 1) return Sun;
  if (code === 2) return CloudSun;
  if (code === 3) return Cloud;
  if (code >= 45 && code <= 48) return CloudFog;
  if (code >= 51 && code <= 57) return CloudDrizzle;
  if (code >= 61 && code <= 67) return CloudRain;
  if (code >= 71 && code <= 86) return CloudSnow;
  if (code >= 95) return CloudLightning;
  return Cloud;
}

function getWeatherLabel(code: number): string {
  if (code === 0) return "Clear";
  if (code === 1) return "Mostly Clear";
  if (code === 2) return "Partly Cloudy";
  if (code === 3) return "Overcast";
  if (code >= 45 && code <= 48) return "Foggy";
  if (code >= 51 && code <= 57) return "Drizzle";
  if (code >= 61 && code <= 67) return "Rain";
  if (code >= 71 && code <= 86) return "Snow";
  if (code >= 80 && code <= 82) return "Showers";
  if (code >= 95) return "Thunderstorm";
  return "";
}

function ClientWeatherCard({ suburb }: { suburb: string }) {
  const { data, isLoading } = trpc.weather.getClientForecast.useQuery(
    { suburb },
    { staleTime: 30 * 60 * 1000, refetchOnWindowFocus: false, enabled: !!suburb }
  );

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-2 animate-pulse">
            <div className="h-5 w-5 bg-muted rounded" />
            <div className="h-4 w-32 bg-muted rounded" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!data?.daily?.length) return null;

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <Cloud className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">7-Day Forecast</span>
          <span className="text-xs text-muted-foreground ml-auto">{data.locationName || suburb}</span>
        </div>
        <div className="grid grid-cols-7 gap-1">
          {data.daily.slice(0, 7).map((day: any) => {
            const DayIcon = getWeatherIconForCode(day.weatherCode);
            const dayName = new Date(day.date + "T00:00:00").toLocaleDateString("en-AU", { weekday: "short" });
            return (
              <div key={day.date} className="flex flex-col items-center gap-1 py-2 px-1 rounded-md hover:bg-muted/30">
                <span className="text-[10px] text-muted-foreground">{dayName}</span>
                <DayIcon className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs font-medium">{day.tempMax}°</span>
                <span className="text-[10px] text-muted-foreground">{day.tempMin}°</span>
                {day.precipitation > 0 && (
                  <span className="text-[9px] text-blue-500">{day.precipitation}mm</span>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

export default function ConstructionClientDetail() {
  const params = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const jobId = Number(params.id);

  const TAB_VALUES = ["overview", "check-measure", "site-plan", "building-authority", "progress", "financials", "tasks", "project-plan", "schedule", "activity", "contacts", "email-sms", "subcontracts", "inductions", "variations", "procurement", "plans", "plan-history", "shared-files", "completion"] as const;
  const [activeTab, setActiveTab] = useState<string>("overview");
  const isMobile = useIsMobile();

  const TAB_CONFIG: { value: string; label: string; icon: any }[] = [
    { value: "overview", label: "Overview", icon: ClipboardList },
    { value: "check-measure", label: "Check Measure", icon: Clipboard },
    { value: "site-plan", label: "Site Plan", icon: Ruler },
    { value: "building-authority", label: "Approvals Activity", icon: Building },
    { value: "progress", label: "Progress Invoices", icon: HardHat },
    { value: "financials", label: "Financials", icon: DollarSign },
    { value: "tasks", label: "Tasks", icon: Wrench },
    { value: "project-plan", label: "Project Plan", icon: KanbanSquare },
    { value: "schedule", label: "Schedule", icon: CalendarDays },
    { value: "activity", label: "Activity", icon: MessageSquare },
    { value: "contacts", label: "Contacts", icon: Users },
    { value: "email-sms", label: "Email & SMS", icon: Mail },
    { value: "subcontracts", label: "Subcontracts", icon: FileText },
    { value: "inductions", label: "Inductions", icon: ClipboardCheck },
    { value: "variations", label: "Variations", icon: Shield },
    { value: "procurement", label: "Procurement", icon: Package },

    { value: "plans", label: "Plans", icon: PenTool },
    { value: "plan-history", label: "Plan History", icon: Clock },
    { value: "shared-files", label: "Shared Files", icon: FolderOpen },
    { value: "completion", label: "Completion", icon: FileCheck },
  ];
  const swipeRef = useSwipeTabs({
    tabs: TAB_VALUES as unknown as string[],
    activeTab,
    onTabChange: setActiveTab,
  });

  const detailQuery = trpc.constructionClients.detail.useQuery({ jobId }, { enabled: !!jobId });
  const updateFinancials = trpc.constructionClients.updateFinancials.useMutation({
    onSuccess: () => {
      detailQuery.refetch();
      toast.success("Financials updated");
    },
  });
  const updateProjectTeam = trpc.constructionClients.updateProjectTeam.useMutation({
    onSuccess: () => {
      detailQuery.refetch();
      toast.success("Project team updated");
    },
    onError: (err) => toast.error(err.message || "Failed to update project team"),
  });

  if (detailQuery.isLoading) {
    return (
      <div className="p-6 max-w-6xl mx-auto">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-muted rounded w-48" />
          <div className="h-32 bg-muted rounded" />
          <div className="h-64 bg-muted rounded" />
        </div>
      </div>
    );
  }

  if (!detailQuery.data) {
    return (
      <div className="p-6 max-w-6xl mx-auto text-center">
        <p className="text-muted-foreground">Job not found</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate("/construction/clients")}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Back to Clients
        </Button>
      </div>
    );
  }

  const { job, progress, assignments, financials, xeroAccountingSummary, kanbanTasks, quoteData, leadData, completedStages, totalStages, progressPercent, progressSource } = detailQuery.data;
  const statusCfg = STATUS_CONFIG[job.status] || STATUS_CONFIG.scheduled;
  const StatusIcon = statusCfg.icon;
  const activeTabConfig = TAB_CONFIG.find(tab => tab.value === activeTab) || TAB_CONFIG[0];
  const ActiveTabIcon = activeTabConfig.icon;

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      {/* Back Button & Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/construction/clients")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">{job.clientName}</h1>
            <Badge className={statusCfg.color} variant="secondary">
              <StatusIcon className="h-3.5 w-3.5 mr-1" />
              {statusCfg.label}
            </Badge>
            {job.priority === "high" && <Badge variant="destructive">High Priority</Badge>}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground mt-1">
            {job.quoteNumber && <span>Quote #{job.quoteNumber}</span>}
            {job.siteAddress && (
              <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" /> {job.siteAddress}</span>
            )}
            {quoteData?.clientPhone && (
              <span className="flex items-center gap-1"><Phone className="h-3.5 w-3.5" /> {quoteData.clientPhone}</span>
            )}
            {quoteData?.clientEmail && (
              <span className="flex items-center gap-1"><Mail className="h-3.5 w-3.5" /> {quoteData.clientEmail}</span>
            )}
          </div>
        </div>
      </div>

      {/* Progress Summary */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">Overall Progress</span>
                <span className="text-sm text-muted-foreground">
                  {progressPercent > 0
                    ? `${progressPercent}% paid of contract value`
                    : totalStages > 0
                    ? `${completedStages}/${totalStages} stages complete`
                    : "No payment data yet"
                  }
                </span>
              </div>
              <Progress value={progressPercent > 0 ? progressPercent : (totalStages > 0 ? Math.round((completedStages / totalStages) * 100) : 0)} className="h-3" />
            </div>
            <div className="text-3xl font-bold text-primary">{progressPercent > 0 ? `${progressPercent}%` : totalStages > 0 ? `${Math.round((completedStages / totalStages) * 100)}%` : "—"}</div>
          </div>
          {progressSource && progressSource !== "none" && (
            <p className="text-[10px] text-muted-foreground mt-2">Source: {progressSource === "xero" ? "Xero payment data" : "Manual stages"}</p>
          )}
        </CardContent>
      </Card>

      {/* Tabs */}
      <div ref={swipeRef}>
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button className="mb-4 h-auto min-h-14 w-full justify-between rounded-md border border-primary/30 bg-primary px-4 py-3 text-primary-foreground shadow-sm hover:bg-primary/90">
              <span className="flex items-center gap-3 text-left">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary-foreground/15">
                  <ActiveTabIcon className="h-5 w-5" />
                </span>
                <span className="flex flex-col leading-tight">
                  <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-primary-foreground/75">Section</span>
                  <span className="text-base font-semibold">
                    {activeTabConfig.label}
                    {activeTab === "tasks" ? ` (${kanbanTasks.length})` : ""}
                  </span>
                </span>
              </span>
              <ChevronDown className="h-5 w-5 shrink-0 opacity-90" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-[var(--radix-dropdown-menu-trigger-width)] p-2">
            {TAB_CONFIG.map(tab => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.value;
              return (
                <DropdownMenuItem
                  key={tab.value}
                  onClick={() => setActiveTab(tab.value)}
                  className={`mb-1 cursor-pointer rounded-md px-3 py-2.5 text-sm font-medium last:mb-0 ${
                    isActive
                      ? "bg-primary text-primary-foreground focus:bg-primary focus:text-primary-foreground"
                      : "hover:bg-muted focus:bg-muted"
                  }`}
                >
                  <Icon className="h-4 w-4 mr-2" />
                  {tab.label}{tab.value === "tasks" ? ` (${kanbanTasks.length})` : ""}
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-4">
          {/* Client Weather Forecast (active jobs only) */}
          {job.status !== "completed" && job.status !== "cancelled" && quoteData?.suburb && (
            <ClientWeatherCard suburb={quoteData.suburb} />
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Job Details */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Job Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Design Adviser</span>
                  <span className="font-medium">{job.designAdviserName || "—"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Construction Manager</span>
                  <span className="font-medium">{financials?.constructionManagerName || job.supervisorName || "—"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Technical Designer</span>
                  <span className="font-medium">{financials?.technicalDesignerName || "—"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Scheduled Start</span>
                  <span className="font-medium">{job.scheduledStart ? new Date(job.scheduledStart).toLocaleDateString("en-AU") : "—"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Scheduled End</span>
                  <span className="font-medium">{job.scheduledEnd ? new Date(job.scheduledEnd).toLocaleDateString("en-AU") : "—"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Actual Start</span>
                  <span className="font-medium">{job.actualStart ? new Date(job.actualStart).toLocaleDateString("en-AU") : "—"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Actual End</span>
                  <span className="font-medium">{job.actualEnd ? new Date(job.actualEnd).toLocaleDateString("en-AU") : "—"}</span>
                </div>
                {job.notes && (
                  <div className="pt-2 border-t">
                    <span className="text-muted-foreground">Notes</span>
                    <p className="mt-1 text-sm">{job.notes}</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Assignments */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Assignments ({assignments.length})</CardTitle>
              </CardHeader>
              <CardContent>
                {assignments.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">No assignments yet</p>
                ) : (
                  <div className="space-y-2">
                    {assignments.map((a: any) => (
                      <div key={a.id} className="flex items-center gap-3 p-2 rounded-lg bg-muted/30 border">
                        <User className="h-4 w-4 text-muted-foreground" />
                        <div className="flex-1">
                          <p className="text-sm font-medium">{a.installer?.name || `Installer #${a.installerId}`}</p>
                          <p className="text-xs text-muted-foreground">{a.role}</p>
                        </div>
                        {a.installer?.phone && (
                          <span className="text-xs text-muted-foreground">{a.installer.phone}</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Quote & Lead Info */}
          {(quoteData || leadData) && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Linked Records</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                {quoteData && (
                  <div className="flex items-center justify-between p-2 bg-muted/30 rounded-lg border">
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="font-medium">Quote #{quoteData.quoteNumber}</p>
                        <p className="text-xs text-muted-foreground">{quoteData.clientName} — {quoteData.siteAddress}</p>
                      </div>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => navigate(`/quotes/${quoteData.id}`)}>
                      <ExternalLink className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                )}
                {leadData && (
                  <div className="flex items-center justify-between p-2 bg-muted/30 rounded-lg border">
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="font-medium">{leadData.firstName} {leadData.lastName}</p>
                        <p className="text-xs text-muted-foreground">{leadData.email} — {leadData.phone}</p>
                      </div>
                    </div>
                    <Badge variant="outline">{leadData.status}</Badge>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Check Measure Tab */}
        <TabsContent value="check-measure" className="space-y-4">
          <CheckMeasureTab jobId={jobId} quoteId={job.quoteId} />
        </TabsContent>

        {/* Site Plan Tab */}
        <TabsContent value="site-plan" className="space-y-4">
          <SitePlanTab jobId={jobId} quoteId={job.quoteId} />
        </TabsContent>

        {/* Approvals Tab */}
        <TabsContent value="building-authority" className="space-y-4">
          {job.leadId ? (
            <BuildingAuthorityReadOnly leadId={job.leadId} />
          ) : (
            <Card><CardContent className="p-6 text-center text-muted-foreground">No linked lead — Approvals tracking requires a lead association.</CardContent></Card>
          )}
        </TabsContent>

        {/* Progress Tab */}
        <TabsContent value="progress" className="space-y-4">
          {/* Progress Invoices at the top — naturally leads to invoicing next stage */}
          <ProgressInvoicesCard jobId={jobId} />

          <Card>
            <CardContent className="p-4">
              {progress.length > 0 && (
                <div className="space-y-2 mb-4">
                  <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Manual Stages</h4>
                  {progress.map((p: any) => (
                    <div key={p.id} className="flex items-center gap-3 p-2 rounded-lg border">
                      <div className={`w-3 h-3 rounded-full ${PROGRESS_STATUS_COLORS[p.status] || "bg-slate-300"}`} />
                      <div className="flex-1">
                        <p className="text-sm font-medium">{p.stageName}</p>
                        {p.completedAt && (
                          <p className="text-xs text-muted-foreground">
                            Completed {new Date(p.completedAt).toLocaleDateString("en-AU")}
                          </p>
                        )}
                      </div>
                      <Badge variant="outline" className="text-[10px]">
                        {p.status.replace("_", " ")}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
              <XeroProgressClaims jobId={jobId} />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Financials Tab */}
        <TabsContent value="financials" className="space-y-6">
          <FinancialsTab
            jobId={jobId}
            financials={financials}
            xeroAccountingSummary={xeroAccountingSummary}
            onSave={(data) => updateFinancials.mutate({ jobId, ...data })}
            loading={updateFinancials.isPending}
            onProjectTeamSave={(data) => updateProjectTeam.mutate({ jobId, ...data })}
            projectTeamLoading={updateProjectTeam.isPending}
          />
          {/* Xero Integration Panel */}
          <XeroJobPanel jobId={jobId} clientName={job.clientName || "Unknown"} financials={financials} />
        </TabsContent>

        {/* Tasks Tab */}
        <TabsContent value="tasks">
          <Card>
            <CardContent className="p-4">
              {kanbanTasks.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-muted-foreground">No tasks yet</p>
                  <Button variant="outline" size="sm" className="mt-2" onClick={() => setActiveTab("project-plan")}>
                    <Wrench className="h-4 w-4 mr-1" /> Go to Project Plan
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  {kanbanTasks.map((task: any) => (
                    <div key={task.id} className="flex items-center gap-3 p-2 rounded-lg bg-muted/30 border">
                      <div className={`w-2 h-2 rounded-full ${
                        task.column === "done" ? "bg-green-500" :
                        task.column === "in_progress" ? "bg-amber-400" :
                        task.column === "review" ? "bg-purple-400" :
                        "bg-slate-300"
                      }`} />
                      <div className="flex-1">
                        <p className="text-sm font-medium">{task.title}</p>
                        {task.description && <p className="text-xs text-muted-foreground line-clamp-1">{task.description}</p>}
                      </div>
                      <Badge variant="outline" className="text-[10px]">
                        {task.column.replace("_", " ")}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Project Plan Tab - Embedded Kanban */}
        <TabsContent value="project-plan">
          <ProjectPlanTab jobId={jobId} />
        </TabsContent>

        {/* Schedule Tab */}
        <TabsContent value="schedule">
          <ScheduleTab jobId={jobId} />
        </TabsContent>

        {/* Activity / Communications Tab */}
        <TabsContent value="activity">
          <Card>
            <CardContent className="p-4">
              <ClientActivityTab jobId={jobId} leadId={leadData?.id} clientName={job.clientName} clientPhone={quoteData?.clientPhone || undefined} clientEmail={quoteData?.clientEmail || undefined} />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Contacts Tab */}
        <TabsContent value="contacts" className="space-y-4">
          <ContactsSection
            jobId={jobId}
            assignments={assignments}
            clientName={job.clientName}
            clientPhone={leadData?.phone || quoteData?.clientPhone}
            clientEmail={leadData?.email || quoteData?.clientEmail}
            siteAddress={job.siteAddress}
            onRefetch={() => detailQuery.refetch()}
          />
        </TabsContent>

        {/* Email & SMS Tab */}
        <TabsContent value="email-sms" className="space-y-4">
          <EmailSmsSection jobId={jobId} assignments={assignments} clientName={job.clientName} clientEmail={leadData?.email || quoteData?.clientEmail} clientPhone={leadData?.phone || quoteData?.clientPhone} siteAddress={job.siteAddress} quoteNumber={job.quoteNumber} />
        </TabsContent>

        {/* Subcontracts Tab */}
        <TabsContent value="subcontracts" className="space-y-4">
          <SubcontractsSection jobId={jobId} />
        </TabsContent>

        {/* Inductions Tab */}
        <TabsContent value="inductions" className="space-y-4">
          <InductionsSection jobId={jobId} />
        </TabsContent>

        {/* Variations Tab */}
        <TabsContent value="variations" className="space-y-4">
          <VariationsSection jobId={jobId} clientName={job.clientName} clientEmail={quoteData?.clientEmail} siteAddress={job.siteAddress} quoteNumber={job.quoteNumber} />
        </TabsContent>

        {/* Procurement Tab */}
        <TabsContent value="procurement" className="space-y-4">
          <ProcurementSection jobId={jobId} clientName={job.clientName} quoteNumber={job.quoteNumber} siteAddress={job.siteAddress} />
        </TabsContent>



        {/* Shared Files Tab */}
        <TabsContent value="shared-files" className="space-y-4">
          <SharedFilesSection jobId={jobId} />
        </TabsContent>

        {/* Plans Tab */}
        <TabsContent value="plans" className="space-y-4">
          <PlansSection jobId={jobId} />
        </TabsContent>

        {/* Plan History Tab */}
        <TabsContent value="plan-history" className="space-y-4">
          <PlanHistorySection jobId={jobId} />
        </TabsContent>

        {/* Completion Tab */}
        <TabsContent value="completion" className="space-y-4">
          <CompletionSection jobId={jobId} clientName={job.clientName} clientEmail={quoteData?.clientEmail} siteAddress={job.siteAddress} quoteNumber={job.quoteNumber} />
        </TabsContent>
      </Tabs>
      </div>
    </div>
  );
}

// ─── Subcontracts Section ────────────────────────────────────────────────────
function SubcontractsSection({ jobId }: { jobId: number }) {
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

  const statusColors: Record<string, string> = {
    draft: "bg-gray-100 text-gray-700",
    sent: "bg-blue-100 text-blue-700",
    signed: "bg-green-100 text-green-700",
    cancelled: "bg-red-100 text-red-700",
  };

  if (isLoading) return <div className="space-y-3">{[...Array(3)].map((_, i) => <div key={i} className="h-16 bg-muted/50 rounded-lg animate-pulse" />)}</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-base">Subcontracts</h3>
          <p className="text-xs text-muted-foreground">{subcontracts?.length || 0} subcontract(s) for this job</p>
        </div>
        <Button size="sm" onClick={handleCreate} disabled={createMutation.isPending} className="gap-1.5">
          {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          New Subcontract
        </Button>
      </div>

      {!subcontracts?.length ? (
        <Card>
          <CardContent className="py-10 text-center">
            <FileText className="h-10 w-10 mx-auto mb-3 text-muted-foreground opacity-40" />
            <p className="text-muted-foreground">No subcontracts yet</p>
            <p className="text-xs text-muted-foreground mt-1">Create a subcontract to define payment milestones and scope for a subcontractor</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {subcontracts.map((sc: any) => (
            <SubcontractCard key={sc.id} sc={sc} statusColors={statusColors} navigate={navigate} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Subcontract Card with Milestone Summary ────────────────────────────────
function SubcontractCard({ sc, statusColors, navigate }: { sc: any; statusColors: Record<string, string>; navigate: (path: string) => void }) {
  const utils = trpc.useUtils();
  const { data: claimStatus } = trpc.subcontract.getClaimStatus.useQuery(
    { subcontractId: sc.id },
    { enabled: !!sc.id }
  );

  const milestones = (sc.paymentSchedule || []) as any[];
  const totalMilestones = milestones.length;
  const claimedCount = claimStatus ? new Set(claimStatus.map((c: any) => c.subcontractMilestoneIndex)).size : 0;
  const paidCount = claimStatus ? new Set(claimStatus.filter((c: any) => c.approvalStatus === "paid" || c.approvalStatus === "approved").map((c: any) => c.subcontractMilestoneIndex)).size : 0;

  return (
    <Card className="hover:shadow-sm transition-shadow cursor-pointer" onClick={() => navigate(`/subcontracts/${sc.id}`)}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
            <div className="min-w-0">
              <p className="font-medium text-sm truncate">{sc.subcontractorName || "Unnamed Subcontractor"}</p>
              <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                {sc.constructionManager && <span>CM: {sc.constructionManager}</span>}
                {sc.estimatedCommencement && <span>• Start: {new Date(sc.estimatedCommencement).toLocaleDateString("en-AU", { day: "numeric", month: "short" })}</span>}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              title="Preview"
              onClick={async (e) => {
                e.stopPropagation();
                const previewWin = window.open("", "_blank");
                if (!previewWin) return;
                previewWin.document.write("<html><body><p>Loading...</p></body></html>");
                try {
                  const result = await utils.subcontract.previewHtml.fetch({ id: sc.id });
                  previewWin.document.open();
                  previewWin.document.write(result.html);
                  previewWin.document.close();
                } catch {
                  previewWin.document.open();
                  previewWin.document.write("<html><body><p>Failed to load preview.</p></body></html>");
                  previewWin.document.close();
                }
              }}
            >
              <Printer className="h-3.5 w-3.5" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              title="Download PDF"
              onClick={async (e) => {
                e.stopPropagation();
                try {
                  const result = await utils.subcontract.previewHtml.fetch({ id: sc.id });
                  const printWin = window.open("", "_blank");
                  if (printWin) {
                    printWin.document.open();
                    printWin.document.write(result.html);
                    printWin.document.close();
                    setTimeout(() => printWin.print(), 600);
                  }
                } catch {
                  // silently fail
                }
              }}
            >
              <Download className="h-3.5 w-3.5" />
            </Button>
            <span className="text-sm font-semibold">${sc.subcontractSum || "0.00"}</span>
            <Badge className={`text-[10px] ${statusColors[sc.status] || ""}`}>{sc.status}</Badge>
          </div>
        </div>
        {/* Milestone Payment Summary */}
        {totalMilestones > 0 && (
          <div className="mt-2 pt-2 border-t flex items-center gap-3">
            <div className="flex-1">
              <Progress value={totalMilestones > 0 ? (paidCount / totalMilestones) * 100 : 0} className="h-1.5" />
            </div>
            <span className="text-[10px] text-muted-foreground shrink-0">
              {paidCount}/{totalMilestones} paid
              {claimedCount > paidCount && ` • ${claimedCount - paidCount} pending`}
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Financials Tab ──────────────────────────────────────────────────────────
const BUDGET_CATEGORY_LABELS: Record<string, string> = {
  authorities_councils_certifiers: "Authorities, Councils & Certifiers",
  builders_fees: "Builder's Fees",
  da_commissions: "DA Commissions",
  sub_contractors_others: "Sub Contractors - Others",
  stock_building_costs: "Stock & Building Costs",
  other: "Other",
};

function FinancialsTab({
  jobId, financials, xeroAccountingSummary, onSave, loading, onProjectTeamSave, projectTeamLoading,
}: {
  jobId: number;
  financials: any;
  xeroAccountingSummary?: any;
  onSave: (data: any) => void;
  loading: boolean;
  onProjectTeamSave: (data: ProjectTeamPayload) => void;
  projectTeamLoading: boolean;
}) {
  const [form, setForm] = useState({
    contractValue: financials?.contractValue || "0",
  });

  // Fetch budget categories from imported data
  const budgetQuery = trpc.xeroBudgetImport.getJobBudget.useQuery({ jobId });
  const budgetData = budgetQuery.data;
  const budgetTotalCost = budgetData?.total || 0;

  const budgetContractValue = parseFloat(form.contractValue || "0");
  const budgetMargin = budgetContractValue - budgetTotalCost;
  const budgetMarginPercent = budgetContractValue > 0 ? (budgetMargin / budgetContractValue) * 100 : 0;

  // Prefer matched Xero Accounting API rows when real positive invoice/cost rows exist.
  // Imported financials remain the fallback until the API sync has useful matches for this job.
  const apiRowCount = Number(xeroAccountingSummary?.rowCount || 0);
  const apiCost = Number(xeroAccountingSummary?.positiveCostTotal || 0);
  const apiRevenue = Number(xeroAccountingSummary?.positiveRevenueTotal || 0);
  const apiPaid = Number(xeroAccountingSummary?.positivePaidTotal || 0);
  const hasPositiveApiActuals = apiCost > 0 || apiRevenue > 0 || apiPaid > 0;
  const hasPartialApiRows = apiRowCount > 0 && !hasPositiveApiActuals;

  const storedXeroTotalCost = parseFloat(financials?.xeroTotalCost || "0");
  const storedXeroInvoiced = parseFloat(financials?.xeroInvoicedAmount || "0");
  const storedXeroPaid = parseFloat(financials?.xeroPaidAmount || "0");
  const xeroTotalCost = hasPositiveApiActuals && apiCost > 0 ? apiCost : storedXeroTotalCost;
  const xeroContract = parseFloat(financials?.xeroContractValue || financials?.contractValue || "0");
  const xeroInvoiced = hasPositiveApiActuals && apiRevenue > 0 ? apiRevenue : storedXeroInvoiced;
  const xeroPaid = hasPositiveApiActuals && apiPaid > 0 ? apiPaid : storedXeroPaid;
  const xeroSourceBadge = hasPositiveApiActuals
    ? "From Xero API"
    : hasPartialApiRows
      ? "Partial Xero API"
      : "Imported fallback";
  const xeroSourceText = hasPositiveApiActuals
    ? "These values are rolled up from matched Xero Accounting API transactions."
    : hasPartialApiRows
      ? "Xero transaction rows exist for this job, but the current matched rows are credits or adjustments only. Showing stored/imported totals where available."
      : "No matched positive Xero API actuals yet. Showing stored/imported Xero totals where available.";
  const xeroMargin = xeroInvoiced - xeroTotalCost;
  const xeroMarginPercent = xeroInvoiced > 0 ? (xeroMargin / xeroInvoiced) * 100 : 0;
  const xeroOutstanding = xeroInvoiced - xeroPaid;
  const hasXeroData = xeroContract > 0 || xeroTotalCost > 0 || xeroInvoiced > 0;

  // Use actual Xero margin for health indicator (primary), fall back to budget if no Xero data
  const effectiveMarginPercent = hasXeroData ? xeroMarginPercent : budgetMarginPercent;

  const fmtCurrency = (v: number) => "$" + v.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div className="space-y-4">
      <ProjectTeamFields
        value={financials}
        onSave={onProjectTeamSave}
        saving={projectTeamLoading}
        description="Assign who owns construction delivery and technical specification for this project."
      />

      {/* Health Indicator + Summary Cards */}
      <div className="flex items-center gap-3 mb-1">
        <h3 className="text-lg font-semibold">Project Health</h3>
        <HealthIndicator marginPercent={effectiveMarginPercent} />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">Invoiced to Date</p>
            <p className="text-xl font-bold text-primary">{fmtCurrency(xeroInvoiced)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">Actual Costs</p>
            <p className="text-xl font-bold">{fmtCurrency(xeroTotalCost)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">Actual Margin</p>
            <p className={`text-xl font-bold ${xeroMargin >= 0 ? "text-green-600" : "text-red-600"}`}>
              {fmtCurrency(xeroMargin)} ({xeroMarginPercent.toFixed(1)}%)
            </p>
          </CardContent>
        </Card>
      </div>



      {/* Budget Categories (from imported Xero budget report) */}
      <Card className="border-emerald-200 dark:border-emerald-800">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-emerald-600" />
            Budget Estimate
            <Badge variant="outline" className="text-[10px] ml-1 border-emerald-300 text-emerald-600">From Imported Budget Report</Badge>
          </CardTitle>
          <p className="text-xs text-muted-foreground">Budget categories imported from Xero Project Financials report. Updated via weekly upload.</p>
        </CardHeader>
        <CardContent>
          {budgetQuery.isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading budget data...
            </div>
          ) : !budgetData?.categories?.length ? (
            <p className="text-sm text-muted-foreground py-2">No budget data imported for this job yet.</p>
          ) : (
            <div className="space-y-3">
              <div className="space-y-2">
                {["authorities_councils_certifiers", "builders_fees", "da_commissions", "sub_contractors_others", "stock_building_costs", "other"].map((cat) => {
                  const found = budgetData.categories.find((c: any) => c.category === cat);
                  if (!found && cat === "other") return null;
                  const amount = found?.totalIncGst || 0;
                  const pct = budgetTotalCost > 0 ? (amount / budgetTotalCost) * 100 : 0;
                  return (
                    <div key={cat} className="flex items-center justify-between py-1.5 border-b border-dashed last:border-0">
                      <span className="text-sm">{BUDGET_CATEGORY_LABELS[cat]}</span>
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-muted-foreground">{pct.toFixed(1)}%</span>
                        <span className="text-sm font-mono font-medium w-28 text-right">{fmtCurrency(amount)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="flex items-center justify-between pt-2 border-t font-semibold">
                <span className="text-sm">Total Budget</span>
                <span className="text-sm font-mono">{fmtCurrency(budgetTotalCost)}</span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Xero Actuals (Read-only) */}
      <Card className="border-blue-200 dark:border-blue-800">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <ExternalLink className="h-4 w-4 text-blue-600" />
              Xero Actuals
              <Badge variant="outline" className="text-[10px] ml-1 border-blue-300 text-blue-600">{xeroSourceBadge}</Badge>
            </CardTitle>
          </div>
          <p className="text-xs text-muted-foreground">{xeroSourceText}</p>
        </CardHeader>
          <CardContent>
            {hasPartialApiRows && (
              <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                  <span>
                    {apiRowCount} Xero API row{apiRowCount === 1 ? "" : "s"} matched, but none are positive invoice/cost transactions yet. Run the financial sync after the Xero connection is healthy to refresh invoice, bill, and spend-money rows.
                  </span>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Estimated Value</p>
                <p className="text-lg font-semibold">{fmtCurrency(xeroContract)}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Actual Costs</p>
                <p className="text-lg font-semibold">{fmtCurrency(xeroTotalCost)}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Invoiced</p>
                <p className="text-lg font-semibold">{fmtCurrency(xeroInvoiced)}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Paid</p>
                <p className="text-lg font-semibold">{fmtCurrency(xeroPaid)}</p>
              </div>
            </div>

            {/* Actual costs sourced from imported Xero cost report */}

            {/* Xero Margin & Outstanding */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mt-4 pt-4 border-t">
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Xero Margin</p>
                <p className={`text-lg font-semibold ${xeroMargin >= 0 ? "text-green-600" : "text-red-600"}`}>
                  {fmtCurrency(xeroMargin)} ({xeroMarginPercent.toFixed(1)}%)
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Xero Outstanding</p>
                <p className={`text-lg font-semibold ${xeroOutstanding > 0 ? "text-amber-600" : "text-green-600"}`}>
                  {fmtCurrency(xeroOutstanding)}
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Xero Health</p>
                <HealthIndicator marginPercent={xeroMarginPercent} />
              </div>
            </div>


          </CardContent>
        </Card>
    </div>
  );
}



/** Shows Xero payment milestones (tasks) and invoices when no manual progress stages exist */
function XeroProgressClaims({ jobId }: { jobId: number }) {
  const { data, isLoading } = trpc.xeroProjects.getProjectPaymentSchedule.useQuery(
    { jobId },
    { enabled: !!jobId }
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8 text-muted-foreground">
        <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Loading progress claims...
      </div>
    );
  }

  if (!data?.project || (data.milestones.length === 0 && data.invoices.length === 0)) {
    return <p className="text-center text-muted-foreground py-8">No progress stages defined yet</p>;
  }

  const { milestones, invoices } = data;

  return (
    <div className="space-y-4">
      {/* Payment Milestones (Tasks) */}
      {milestones.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Payment Milestones</h4>
          {milestones.map((m: any) => {
            const isInvoiced = m.isFullyInvoiced || m.status === "INVOICED";
            const milestoneIncGst = m.amount * 1.1;
            const isPaid = invoices.some((inv: any) =>
              inv.status === "PAID" && Math.abs(inv.total - milestoneIncGst) < 0.02
            );
            return (
              <div key={m.taskId} className="flex items-center gap-3 p-2 rounded-lg border">
                <div className={`w-3 h-3 rounded-full ${
                  isPaid ? "bg-green-500" :
                  isInvoiced ? "bg-amber-500" :
                  "bg-slate-200 dark:bg-slate-700"
                }`} />
                <div className="flex-1">
                  <p className="text-sm font-medium">{m.name}</p>
                  <p className="text-xs text-muted-foreground">
                    ${(m.amount * 1.1).toLocaleString("en-AU", { minimumFractionDigits: 2 })} inc GST
                  </p>
                </div>
                <Badge variant="outline" className={`text-[10px] ${
                  isPaid ? "border-green-300 text-green-600" :
                  isInvoiced ? "border-amber-300 text-amber-600" :
                  ""
                }`}>
                  {isPaid ? "Paid" : isInvoiced ? "Outstanding" : "Pending"}
                </Badge>
              </div>
            );
          })}
        </div>
      )}

      {/* Invoices */}
      {invoices.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Invoices</h4>
          {invoices.map((inv: any) => (
            <div key={inv.invoiceId} className="flex items-center gap-3 p-2 rounded-lg border">
              <div className={`w-3 h-3 rounded-full ${
                inv.status === "PAID" ? "bg-green-500" :
                inv.status === "AUTHORISED" ? "bg-amber-500" :
                "bg-slate-200 dark:bg-slate-700"
              }`} />
              <div className="flex-1">
                <p className="text-sm font-medium">{inv.invoiceNumber}</p>
                <p className="text-xs text-muted-foreground">
                  {inv.date ? new Date(inv.date).toLocaleDateString("en-AU") : ""} — ${inv.total.toLocaleString("en-AU", { minimumFractionDigits: 2 })}
                </p>
              </div>
              <Badge variant="outline" className={`text-[10px] ${
                inv.status === "PAID" ? "border-green-300 text-green-600" :
                inv.status === "AUTHORISED" ? "border-amber-300 text-amber-600" :
                ""
              }`}>
                {inv.status === "PAID" ? "Paid" : inv.status === "AUTHORISED" ? "Outstanding" : inv.status}
              </Badge>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}


// ─── Completion (NPC) Section ──────────────────────────────────────────────
function CompletionSection({ jobId, clientName, clientEmail, siteAddress, quoteNumber }: {
  jobId: number; clientName: string; clientEmail?: string | null; siteAddress?: string | null; quoteNumber?: string | null;
}) {
  const { data: npcs, isLoading } = trpc.constructionDocs.listNpc.useQuery({ jobId });
  const utils = trpc.useUtils();
  const [showForm, setShowForm] = useState(false);
  const [defects, setDefects] = useState<{ description: string; id: string }[]>([]);
  const [newDefect, setNewDefect] = useState("");
  const [ownerName, setOwnerName] = useState(clientName || "");
  const [ownerAddress, setOwnerAddress] = useState(siteAddress || "");
  const [signatoryTitle, setSignatoryTitle] = useState("Construction Manager");
  const [sendDialogNpcId, setSendDialogNpcId] = useState<number | null>(null);
  const [sendEmail, setSendEmail] = useState(clientEmail || "");
  const [sendMessage, setSendMessage] = useState("");

  const createMutation = trpc.constructionDocs.createNpc.useMutation({
    onSuccess: (data) => {
      toast.success(`NPC created with ${data.defectTaskIds.length} defect task(s) added to project plan`);
      utils.constructionDocs.listNpc.invalidate({ jobId });
      setShowForm(false);
      setDefects([]);
    },
    onError: (e) => toast.error(e.message),
  });

  const sendMutation = trpc.constructionDocs.sendNpc.useMutation({
    onSuccess: () => {
      toast.success("NPC sent successfully");
      utils.constructionDocs.listNpc.invalidate({ jobId });
      setSendDialogNpcId(null);
    },
    onError: (e) => toast.error(e.message),
  });

  // SignWell signature flow
  const [signDialogNpcId, setSignDialogNpcId] = useState<number | null>(null);
  const [builderName, setBuilderName] = useState("");
  const [builderEmail, setBuilderEmail] = useState("");
  const [signClientName, setSignClientName] = useState(clientName || "");
  const [signClientEmail, setSignClientEmail] = useState(clientEmail || "");

  const signMutation = trpc.constructionDocs.sendNpcForSignature.useMutation({
    onSuccess: () => {
      toast.success("NPC sent for signature (builder signs first, then client)");
      utils.constructionDocs.listNpc.invalidate({ jobId });
      setSignDialogNpcId(null);
    },
    onError: (e) => toast.error(e.message),
  });

  const downloadSignedMutation = trpc.constructionDocs.downloadSignedNpc.useMutation({
    onSuccess: (data) => {
      window.open(data.url, "_blank");
      toast.success("Signed NPC PDF opened");
    },
    onError: (e) => toast.error(e.message),
  });

  const addDefect = () => {
    if (!newDefect.trim()) return;
    setDefects(prev => [...prev, { description: newDefect.trim(), id: crypto.randomUUID() }]);
    setNewDefect("");
  };

  const removeDefect = (id: string) => {
    setDefects(prev => prev.filter(d => d.id !== id));
  };

  const handleCreate = () => {
    createMutation.mutate({
      jobId,
      ownerName,
      ownerAddress,
      jobNumber: quoteNumber || undefined,
      defects,
      signatoryTitle,
    });
  };

  if (isLoading) return <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Notice of Practical Completion</h3>
        {!showForm && (
          <Button variant="brand" onClick={() => setShowForm(true)} size="sm">
            <Plus className="h-4 w-4 mr-1.5" /> New NPC
          </Button>
        )}
      </div>

      {showForm && (
        <Card>
          <CardHeader><CardTitle className="text-base">Create Notice of Practical Completion</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>Owner / Client Name</Label>
                <Input value={ownerName} onChange={e => setOwnerName(e.target.value)} placeholder="Property owner name" />
              </div>
              <div>
                <Label>Site Address</Label>
                <Input value={ownerAddress} onChange={e => setOwnerAddress(e.target.value)} placeholder="Site address" />
              </div>
              <div>
                <Label>Signatory Title</Label>
                <Input value={signatoryTitle} onChange={e => setSignatoryTitle(e.target.value)} placeholder="e.g. Construction Manager" />
              </div>
              <div>
                <Label>Job / Quote Number</Label>
                <Input value={quoteNumber || ""} disabled className="bg-muted" />
              </div>
            </div>

            {/* Defects List */}
            <div>
              <Label className="mb-2 block">Defects (will be added as tasks in project plan)</Label>
              <div className="flex gap-2 mb-2">
                <Input
                  value={newDefect}
                  onChange={e => setNewDefect(e.target.value)}
                  placeholder="Describe defect..."
                  onKeyDown={e => e.key === "Enter" && addDefect()}
                />
                <Button type="button" variant="outline" onClick={addDefect} size="sm">Add</Button>
              </div>
              {defects.length > 0 && (
                <div className="space-y-1">
                  {defects.map((d, i) => (
                    <div key={d.id} className="flex items-center gap-2 bg-muted/50 rounded px-3 py-1.5 text-sm">
                      <span className="text-muted-foreground">{i + 1}.</span>
                      <span className="flex-1">{d.description}</span>
                      <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-destructive" onClick={() => removeDefect(d.id)}>×</Button>
                    </div>
                  ))}
                </div>
              )}
              {defects.length === 0 && (
                <p className="text-xs text-muted-foreground">No defects listed — this indicates the works have reached Practical Completion without defects.</p>
              )}
            </div>

            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => { setShowForm(false); setDefects([]); }}>Cancel</Button>
              <Button onClick={handleCreate} disabled={!ownerName || createMutation.isPending}>
                {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : null}
                Create NPC
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Existing NPCs */}
      {npcs && npcs.length > 0 ? (
        <div className="space-y-3">
          {npcs.map((npc: any) => (
            <Card key={npc.id}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">{npc.ownerName}</p>
                    <p className="text-sm text-muted-foreground">
                      {new Date(npc.noticeDate).toLocaleDateString("en-AU")} · {(npc.defects as any[])?.length || 0} defect(s)
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={npc.status === "sent" ? "default" : npc.status === "acknowledged" ? "secondary" : "outline"}>
                      {npc.status}
                    </Badge>
                    {npc.pdfUrl && (
                      <Button variant="outline" size="sm" onClick={() => window.open(npc.pdfUrl, "_blank")}>
                        <FileText className="h-4 w-4 mr-1" /> View PDF
                      </Button>
                    )}
                    {npc.status === "draft" && (
                      <>
                        <Button size="sm" variant="outline" onClick={() => { setSendDialogNpcId(npc.id); setSendEmail(clientEmail || ""); }}>
                          <Mail className="h-4 w-4 mr-1" /> Email
                        </Button>
                        <Button size="sm" onClick={() => { setSignDialogNpcId(npc.id); setSignClientName(clientName || npc.ownerName); setSignClientEmail(clientEmail || ""); }}>
                          <PenTool className="h-4 w-4 mr-1" /> Sign
                        </Button>
                      </>
                    )}
                    {(npc.status === "builder_signing" || npc.status === "sent_to_client") && (
                      <Badge variant="default" className="text-xs">
                        {npc.status === "builder_signing" ? "Awaiting Builder" : "Awaiting Client"}
                      </Badge>
                    )}
                    {npc.status === "completed" && (
                      <Button size="sm" variant="outline" onClick={() => downloadSignedMutation.mutate({ npcId: npc.id })}>
                        <Download className="h-4 w-4 mr-1" /> Signed PDF
                      </Button>
                    )}
                  </div>
                </div>
                {npc.sentTo && (
                  <p className="text-xs text-muted-foreground mt-1">Sent to {npc.sentTo} on {npc.sentAt ? new Date(npc.sentAt).toLocaleDateString("en-AU") : "—"}</p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      ) : !showForm ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            <FileCheck className="h-10 w-10 mx-auto mb-2 opacity-50" />
            <p>No notices of practical completion yet</p>
            <p className="text-xs mt-1">Create one when the project reaches practical completion</p>
          </CardContent>
        </Card>
      ) : null}

      {/* Send Dialog */}
      {sendDialogNpcId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setSendDialogNpcId(null)}>
          <Card className="w-full max-w-md mx-4" onClick={e => e.stopPropagation()}>
            <CardHeader><CardTitle>Send NPC via Email</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Recipient Email</Label>
                <Input value={sendEmail} onChange={e => setSendEmail(e.target.value)} placeholder="client@example.com" type="email" />
              </div>
              <div>
                <Label>Message (optional)</Label>
                <textarea
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[80px]"
                  value={sendMessage}
                  onChange={e => setSendMessage(e.target.value)}
                  placeholder="Additional message to include in the email..."
                />
              </div>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => setSendDialogNpcId(null)}>Cancel</Button>
                <Button onClick={() => sendMutation.mutate({ npcId: sendDialogNpcId, recipientEmail: sendEmail, message: sendMessage || undefined })} disabled={!sendEmail || sendMutation.isPending}>
                  {sendMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Mail className="h-4 w-4 mr-1.5" />}
                  Send Email
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* SignWell Signature Dialog */}
      {signDialogNpcId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setSignDialogNpcId(null)}>
          <Card className="w-full max-w-lg mx-4" onClick={e => e.stopPropagation()}>
            <CardHeader>
              <CardTitle>Send NPC for Signature</CardTitle>
              <p className="text-sm text-muted-foreground">Builder signs first, then auto-forwards to client. CC: accounts@commisso.com.au</p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                <p className="text-sm font-medium">1. Builder (signs first)</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Builder Name</Label>
                    <Input value={builderName} onChange={e => setBuilderName(e.target.value)} placeholder="Builder representative" />
                  </div>
                  <div>
                    <Label>Builder Email</Label>
                    <Input value={builderEmail} onChange={e => setBuilderEmail(e.target.value)} placeholder="builder@company.com" type="email" />
                  </div>
                </div>
              </div>
              <div className="space-y-3">
                <p className="text-sm font-medium">2. Client (signs after builder)</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Client Name</Label>
                    <Input value={signClientName} onChange={e => setSignClientName(e.target.value)} placeholder="Client name" />
                  </div>
                  <div>
                    <Label>Client Email</Label>
                    <Input value={signClientEmail} onChange={e => setSignClientEmail(e.target.value)} placeholder="client@email.com" type="email" />
                  </div>
                </div>
              </div>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => setSignDialogNpcId(null)}>Cancel</Button>
                <Button
                  onClick={() => signMutation.mutate({
                    npcId: signDialogNpcId,
                    builderName,
                    builderEmail,
                    clientName: signClientName,
                    clientEmail: signClientEmail,
                  })}
                  disabled={!builderName || !builderEmail || !signClientName || !signClientEmail || signMutation.isPending}
                >
                  {signMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <PenTool className="h-4 w-4 mr-1.5" />}
                  Send for Signature
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

// ─── Variations Section ────────────────────────────────────────────────────
function VariationsSection({ jobId, clientName, clientEmail, siteAddress, quoteNumber }: {
  jobId: number; clientName: string; clientEmail?: string | null; siteAddress?: string | null; quoteNumber?: string | null;
}) {
  const { data: variations, isLoading } = trpc.constructionDocs.listVariations.useQuery({ jobId });
  const utils = trpc.useUtils();
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [variationDetails, setVariationDetails] = useState("");
  const [lineItems, setLineItems] = useState<Array<{ description: string; cost: number }>>([{ description: "", cost: 0 }]);
  const [signDialogId, setSignDialogId] = useState<number | null>(null);
  const [recipientName, setRecipientName] = useState(clientName || "");
  const [recipientEmail, setRecipientEmail] = useState(clientEmail || "");

  const lineItemsTotal = lineItems.reduce((sum, i) => sum + (i.cost || 0), 0);

  const addLineItem = () => setLineItems(prev => [...prev, { description: "", cost: 0 }]);
  const removeLineItem = (idx: number) => setLineItems(prev => prev.filter((_, i) => i !== idx));
  const updateLineItem = (idx: number, field: "description" | "cost", value: string | number) => {
    setLineItems(prev => prev.map((item, i) => i === idx ? { ...item, [field]: value } : item));
  };

  const createMutation = trpc.constructionDocs.createVariation.useMutation({
    onSuccess: () => {
      toast.success("Variation created");
      utils.constructionDocs.listVariations.invalidate({ jobId });
      setShowForm(false);
      setTitle("");
      setDescription("");
      setVariationDetails("");
      setLineItems([{ description: "", cost: 0 }]);
    },
    onError: (e) => toast.error(e.message),
  });

  const sendForSignature = trpc.constructionDocs.sendVariationForSignature.useMutation({
    onSuccess: () => {
      toast.success("Variation sent for signature via SignWell");
      utils.constructionDocs.listVariations.invalidate({ jobId });
      setSignDialogId(null);
    },
    onError: (e) => toast.error(e.message),
  });

  const downloadSigned = trpc.constructionDocs.downloadSignedVariation.useMutation({
    onSuccess: (data) => {
      if (data.url) window.open(data.url, "_blank");
    },
    onError: (e) => toast.error(e.message),
  });

  const sendReminder = trpc.constructionDocs.sendVariationReminder.useMutation({
    onSuccess: () => toast.success("Reminder sent"),
    onError: (e) => toast.error(e.message),
  });

  const handleCreate = () => {
    const validItems = lineItems.filter(i => i.description.trim());
    if (validItems.length === 0) {
      toast.error("Add at least one line item with a description");
      return;
    }
    createMutation.mutate({
      jobId,
      title,
      description,
      variationDetails,
      lineItems: validItems,
      ownerName: clientName,
      ownerAddress: siteAddress || undefined,
    });
  };

  if (isLoading) return <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin" /></div>;

  // Separate signed vs unsigned
  const signedVariations = (variations || []).filter((v: any) => v.signwellStatus === "completed" || v.status === "approved");
  const unsignedVariations = (variations || []).filter((v: any) => v.signwellStatus !== "completed" && v.status !== "approved");

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Contract Variations</h3>
        {!showForm && (
          <Button variant="brand" onClick={() => setShowForm(true)} size="sm">
            <Plus className="h-4 w-4 mr-1.5" /> New Variation
          </Button>
        )}
      </div>

      {showForm && (
        <Card>
          <CardHeader><CardTitle className="text-base">Create Contract Variation</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Variation Title</Label>
              <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Additional roofing works" />
            </div>
            <div>
              <Label>Description</Label>
              <textarea
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[60px]"
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Brief description of the variation..."
              />
            </div>
            <div>
              <Label>Additional Notes / Scope of Works</Label>
              <textarea
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[60px]"
                value={variationDetails}
                onChange={e => setVariationDetails(e.target.value)}
                placeholder="Optional detailed scope notes..."
              />
            </div>

            {/* Line Items */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-semibold">Variation Items</Label>
                <Button type="button" variant="outline" size="sm" onClick={addLineItem}>
                  <Plus className="h-3.5 w-3.5 mr-1" /> Add Item
                </Button>
              </div>
              <div className="space-y-2">
                {lineItems.map((item, idx) => (
                  <div key={idx} className="flex gap-2 items-start">
                    <div className="flex-1">
                      {idx === 0 && <p className="text-xs text-muted-foreground mb-1">Description</p>}
                      <Input
                        value={item.description}
                        onChange={e => updateLineItem(idx, "description", e.target.value)}
                        placeholder="e.g. Additional electrical work"
                      />
                    </div>
                    <div className="w-28 shrink-0">
                      {idx === 0 && <p className="text-xs text-muted-foreground mb-1">Cost ($)</p>}
                      <Input
                        type="number"
                        step="0.01"
                        value={item.cost || ""}
                        onChange={e => updateLineItem(idx, "cost", parseFloat(e.target.value) || 0)}
                        placeholder="0.00"
                      />
                    </div>
                    <div className={idx === 0 ? "mt-5" : ""}>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9 text-muted-foreground hover:text-destructive"
                        onClick={() => removeLineItem(idx)}
                        disabled={lineItems.length <= 1}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
              {/* Running Total */}
              <div className="flex justify-end items-center gap-3 pt-2 border-t">
                <span className="text-sm font-semibold">Total:</span>
                <span className="text-lg font-bold">${lineItemsTotal.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>
            </div>

            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => { setShowForm(false); setLineItems([{ description: "", cost: 0 }]); }}>Cancel</Button>
              <Button onClick={handleCreate} disabled={!title || createMutation.isPending}>
                {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : null}
                Create Variation
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Unsigned Variations - highlighted */}
      {unsignedVariations.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold text-amber-600 dark:text-amber-400 mb-2 flex items-center gap-1.5">
            <AlertTriangle className="h-4 w-4" /> Unsigned Variations ({unsignedVariations.length})
          </h4>
          <div className="space-y-2">
            {unsignedVariations.map((v: any) => (
              <Card key={v.id} className="border-amber-300 dark:border-amber-700">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium">{v.title}</p>
                      <p className="text-sm text-muted-foreground">
                        {new Date(v.createdAt).toLocaleDateString("en-AU")}
                        {v.costImpact && ` · $${parseFloat(v.costImpact).toLocaleString("en-AU", { minimumFractionDigits: 2 })}`}
                        {v.lineItems && Array.isArray(v.lineItems) && ` · ${(v.lineItems as Array<{description:string;cost:number}>).length} item${(v.lineItems as Array<{description:string;cost:number}>).length !== 1 ? "s" : ""}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge variant="outline" className="border-amber-400 text-amber-600">
                        {v.signwellStatus === "pending" ? "Awaiting Signature" : v.status || "draft"}
                      </Badge>
                      {v.pdfUrl && (
                        <Button variant="outline" size="sm" onClick={() => window.open(v.pdfUrl, "_blank")}>
                          <FileText className="h-4 w-4 mr-1" /> PDF
                        </Button>
                      )}
                      {v.signwellStatus === "pending" && (
                        <Button variant="outline" size="sm" onClick={() => sendReminder.mutate({ variationId: v.id })} disabled={sendReminder.isPending}>
                          Remind
                        </Button>
                      )}
                      {!v.signwellDocumentId && (
                        <Button size="sm" onClick={() => { setSignDialogId(v.id); setRecipientName(clientName); setRecipientEmail(clientEmail || ""); }}>
                          <Shield className="h-4 w-4 mr-1" /> Send for Signature
                        </Button>
                      )}
                    </div>
                  </div>
                  {/* Show line items summary */}
                  {v.lineItems && Array.isArray(v.lineItems) && (v.lineItems as Array<{description:string;cost:number}>).length > 0 && (
                    <div className="mt-2 pt-2 border-t border-amber-200 dark:border-amber-800">
                      <div className="space-y-1">
                        {(v.lineItems as Array<{description:string;cost:number}>).map((li, idx) => (
                          <div key={idx} className="flex justify-between text-sm">
                            <span className="text-muted-foreground">{li.description}</span>
                            <span className="font-medium">${(li.cost || 0).toLocaleString("en-AU", { minimumFractionDigits: 2 })}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {v.sentTo && (
                    <p className="text-xs text-muted-foreground mt-1">Sent to {v.sentTo}</p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Signed Variations - library */}
      {signedVariations.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold text-green-600 dark:text-green-400 mb-2 flex items-center gap-1.5">
            <CheckCircle2 className="h-4 w-4" /> Signed Variations ({signedVariations.length})
          </h4>
          <div className="space-y-2">
            {signedVariations.map((v: any) => (
              <Card key={v.id} className="border-green-300 dark:border-green-700">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">{v.title}</p>
                      <p className="text-sm text-muted-foreground">
                        Signed {v.signwellCompletedAt ? new Date(v.signwellCompletedAt).toLocaleDateString("en-AU") : ""}
                        {v.costImpact && ` · $${parseFloat(v.costImpact).toLocaleString()}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300">Signed</Badge>
                      {v.signedPdfUrl ? (
                        <Button variant="outline" size="sm" onClick={() => window.open(v.signedPdfUrl, "_blank")}>
                          <FileText className="h-4 w-4 mr-1" /> Signed PDF
                        </Button>
                      ) : v.signwellDocumentId ? (
                        <Button variant="outline" size="sm" onClick={() => downloadSigned.mutate({ variationId: v.id })} disabled={downloadSigned.isPending}>
                          {downloadSigned.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4 mr-1" />}
                          Download Signed
                        </Button>
                      ) : v.pdfUrl ? (
                        <Button variant="outline" size="sm" onClick={() => window.open(v.pdfUrl, "_blank")}>
                          <FileText className="h-4 w-4 mr-1" /> PDF
                        </Button>
                      ) : null}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {(!variations || variations.length === 0) && !showForm && (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            <Shield className="h-10 w-10 mx-auto mb-2 opacity-50" />
            <p>No contract variations yet</p>
            <p className="text-xs mt-1">Create a variation when scope changes are needed</p>
          </CardContent>
        </Card>
      )}

      {/* Send for Signature Dialog */}
      {signDialogId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setSignDialogId(null)}>
          <Card className="w-full max-w-md mx-4" onClick={e => e.stopPropagation()}>
            <CardHeader><CardTitle>Send Variation for Signature</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">This will send the variation document via SignWell for digital signature.</p>
              <div>
                <Label>Recipient Name</Label>
                <Input value={recipientName} onChange={e => setRecipientName(e.target.value)} placeholder="Client name" />
              </div>
              <div>
                <Label>Recipient Email</Label>
                <Input value={recipientEmail} onChange={e => setRecipientEmail(e.target.value)} placeholder="client@example.com" type="email" />
              </div>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => setSignDialogId(null)}>Cancel</Button>
                <Button onClick={() => sendForSignature.mutate({ variationId: signDialogId, recipientName, recipientEmail })} disabled={!recipientEmail || sendForSignature.isPending}>
                  {sendForSignature.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Shield className="h-4 w-4 mr-1.5" />}
                  Send via SignWell
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}


// ─── Inductions Section ─────────────────────────────────────────────────────
function InductionsSection({ jobId }: { jobId: number }) {
  const utils = trpc.useUtils();
  const { data: inductionStatus, isLoading } = trpc.siteInductions.getJobInductionStatus.useQuery({ jobId });
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [editingInduction, setEditingInduction] = useState<any>(null);

  const createForAll = trpc.siteInductions.createForAllTrades.useMutation({
    onSuccess: (data) => {
      toast.success(`Created ${data.created} induction${data.created !== 1 ? "s" : ""}`);
      utils.siteInductions.getJobInductionStatus.invalidate({ jobId });
    },
    onError: (err) => toast.error(err.message),
  });

  const createSingle = trpc.siteInductions.create.useMutation({
    onSuccess: () => {
      toast.success("Induction created");
      utils.siteInductions.getJobInductionStatus.invalidate({ jobId });
    },
    onError: (err) => toast.error(err.message),
  });

  const sendReminder = trpc.siteInductions.sendReminder.useMutation({
    onSuccess: () => {
      toast.success("Reminder sent");
      utils.siteInductions.getJobInductionStatus.invalidate({ jobId });
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteInduction = trpc.siteInductions.delete.useMutation({
    onSuccess: () => {
      toast.success("Induction deleted");
      utils.siteInductions.getJobInductionStatus.invalidate({ jobId });
    },
    onError: (err) => toast.error(err.message),
  });

  const generatePdf = trpc.siteInductions.generatePdf.useMutation({
    onSuccess: (data) => {
      window.open(data.pdfUrl, "_blank");
    },
    onError: (err) => toast.error(err.message),
  });

  const submitInduction = trpc.siteInductions.submit.useMutation({
    onSuccess: () => {
      toast.success("Induction completed and timestamped");
      setEditingInduction(null);
      utils.siteInductions.getJobInductionStatus.invalidate({ jobId });
    },
    onError: (err) => toast.error(err.message),
  });

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">Loading inductions...</p>
        </CardContent>
      </Card>
    );
  }

  const trades = inductionStatus || [];
  const completedCount = trades.filter(t => t.inductionStatus === "completed").length;
  const pendingCount = trades.filter(t => t.inductionStatus === "pending").length;
  const notStartedCount = trades.filter(t => t.inductionStatus === "not_started").length;

  return (
    <div className="space-y-4">
      {/* Summary Header */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-base">Site Inductions</h3>
              <p className="text-sm text-muted-foreground mt-0.5">
                Workplace Specific Induction Checklist for each trade
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => createForAll.mutate({ jobId })}
                disabled={createForAll.isPending || notStartedCount === 0}
              >
                {createForAll.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-1" />
                ) : (
                  <Plus className="h-4 w-4 mr-1" />
                )}
                Create for All Trades
              </Button>
            </div>
          </div>
          {trades.length > 0 && (
            <div className="flex items-center gap-4 mt-3 text-sm">
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full bg-green-500" />
                <span>Completed: {completedCount}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full bg-amber-400" />
                <span>Pending: {pendingCount}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full bg-slate-300" />
                <span>Not Started: {notStartedCount}</span>
              </div>
              {trades.length > 0 && (
                <Progress value={(completedCount / trades.length) * 100} className="flex-1 h-2 max-w-[200px]" />
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Trade Induction List */}
      {trades.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            <ClipboardCheck className="h-10 w-10 mx-auto mb-2 opacity-50" />
            <p>No trades assigned to this job</p>
            <p className="text-xs mt-1">Assign trades in the Overview tab first</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {trades.map((trade: any) => {
            const ind = trade.induction;
            const isExpanded = expandedId === ind?.id;
            const statusColor = trade.inductionStatus === "completed"
              ? "border-green-300 dark:border-green-700"
              : trade.inductionStatus === "pending"
              ? "border-amber-300 dark:border-amber-700"
              : "border-slate-200 dark:border-slate-700";

            return (
              <Card key={trade.installerId} className={statusColor}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`w-3 h-3 rounded-full ${
                        trade.inductionStatus === "completed" ? "bg-green-500" :
                        trade.inductionStatus === "pending" ? "bg-amber-400" :
                        "bg-slate-300"
                      }`} />
                      <div>
                        <p className="font-medium">{trade.installerName || `Trade #${trade.installerId}`}</p>
                        <p className="text-xs text-muted-foreground">
                          {trade.role || "Installer"}
                          {ind?.completedAt && ` · Completed ${new Date(ind.completedAt).toLocaleString("en-AU", { timeZone: "Australia/Sydney" })}`}
                          {ind?.reminderSentAt && !ind.completedAt && ` · Reminder sent ${new Date(ind.reminderSentAt).toLocaleDateString("en-AU")}`}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge className={
                        trade.inductionStatus === "completed"
                          ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300"
                          : trade.inductionStatus === "pending"
                          ? "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300"
                          : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400"
                      }>
                        {trade.inductionStatus === "completed" ? "Completed" :
                         trade.inductionStatus === "pending" ? "Pending" : "Not Started"}
                      </Badge>

                      {/* Actions */}
                      {trade.inductionStatus === "not_started" && (
                        <Button variant="outline" size="sm" onClick={() => createSingle.mutate({ jobId, installerId: trade.installerId })} disabled={createSingle.isPending}>
                          <Plus className="h-3.5 w-3.5 mr-1" /> Create
                        </Button>
                      )}
                      {trade.inductionStatus === "pending" && ind && (
                        <>
                          <Button variant="outline" size="sm" onClick={() => setEditingInduction(ind)}>
                            <ClipboardCheck className="h-3.5 w-3.5 mr-1" /> Complete
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => sendReminder.mutate({ id: ind.id })} disabled={sendReminder.isPending}>
                            {sendReminder.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                          </Button>
                          <Button variant="ghost" size="sm" className="text-destructive" onClick={() => { if (confirm("Delete this induction?")) deleteInduction.mutate({ id: ind.id }); }}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </>
                      )}
                      {trade.inductionStatus === "completed" && ind && (
                        <>
                          <Button variant="outline" size="sm" onClick={() => setExpandedId(isExpanded ? null : ind.id)}>
                            <Eye className="h-3.5 w-3.5 mr-1" /> {isExpanded ? "Hide" : "View"}
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => generatePdf.mutate({ id: ind.id })} disabled={generatePdf.isPending}>
                            {generatePdf.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />}
                          </Button>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Expanded View for completed inductions */}
                  {isExpanded && ind && (
                    <div className="mt-4 pt-4 border-t space-y-3">
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <span className="text-muted-foreground">Contractor:</span>
                          <span className="ml-2 font-medium">{ind.contractorName}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Phone:</span>
                          <span className="ml-2">{ind.contractorPhone || "—"}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Inducted By:</span>
                          <span className="ml-2 font-medium">{ind.inductedByName || "—"}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Medical Conditions:</span>
                          <span className="ml-2">{ind.medicalConditions || "None declared"}</span>
                        </div>
                      </div>
                      {ind.certificates && (
                        <div>
                          <h5 className="text-xs font-semibold uppercase text-muted-foreground mb-1">Certificates</h5>
                          <div className="space-y-1">
                            {(ind.certificates as any[]).map((cert: any, i: number) => (
                              <div key={i} className="flex items-center gap-3 text-sm">
                                <Badge variant="outline" className={cert.status === "Y" ? "text-green-600" : cert.status === "N" ? "text-red-600" : "text-slate-500"}>
                                  {cert.status || "—"}
                                </Badge>
                                <span>{cert.name}</span>
                                {cert.expiryDate && <span className="text-muted-foreground text-xs">Exp: {cert.expiryDate}</span>}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {ind.siteChecklist && (
                        <div>
                          <h5 className="text-xs font-semibold uppercase text-muted-foreground mb-1">Site Checklist</h5>
                          <div className="space-y-1">
                            {(ind.siteChecklist as any[]).map((item: any, i: number) => (
                              <div key={i} className="flex items-center gap-3 text-sm">
                                <Badge variant="outline" className={item.status === "Y" ? "text-green-600" : item.status === "N" ? "text-red-600" : "text-slate-500"}>
                                  {item.status || "—"}
                                </Badge>
                                <span>{item.item}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Complete Induction Dialog */}
      {editingInduction && (
        <InductionFormDialog
          induction={editingInduction}
          onClose={() => setEditingInduction(null)}
          onSubmit={(data) => submitInduction.mutate({ id: editingInduction.id, ...data })}
          isPending={submitInduction.isPending}
        />
      )}
    </div>
  );
}

// ─── Induction Form Dialog ──────────────────────────────────────────────────
function InductionFormDialog({ induction, onClose, onSubmit, isPending }: {
  induction: any;
  onClose: () => void;
  onSubmit: (data: { medicalConditions?: string; certificates: any[]; siteChecklist: any[] }) => void;
  isPending: boolean;
}) {
  const [medicalConditions, setMedicalConditions] = useState(induction.medicalConditions || "");
  const [certificates, setCertificates] = useState<any[]>(
    (induction.certificates as any[]) || []
  );
  const [siteChecklist, setSiteChecklist] = useState<any[]>(
    (induction.siteChecklist as any[]) || []
  );
  const [step, setStep] = useState(0); // 0=details, 1=certificates, 2=checklist, 3=rules, 4=confirm

  const { data: rulesData } = trpc.siteInductions.getSiteRules.useQuery();

  const updateCertStatus = (idx: number, status: string) => {
    setCertificates(prev => prev.map((c, i) => i === idx ? { ...c, status } : c));
  };
  const updateCertExpiry = (idx: number, expiryDate: string) => {
    setCertificates(prev => prev.map((c, i) => i === idx ? { ...c, expiryDate } : c));
  };
  const updateChecklistStatus = (idx: number, status: string) => {
    setSiteChecklist(prev => prev.map((c, i) => i === idx ? { ...c, status } : c));
  };

  const steps = ["Details", "Certificates", "Site Checklist", "Site Rules", "Confirm & Send"];

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ClipboardCheck className="h-5 w-5" />
            Site Induction — {induction.contractorName}
          </CardTitle>
          <div className="flex items-center gap-1 mt-2">
            {steps.map((s, i) => (
              <div key={i} className="flex items-center gap-1">
                <div className={`h-2 flex-1 rounded-full min-w-[40px] ${i <= step ? "bg-primary" : "bg-muted"}`} />
              </div>
            ))}
          </div>
          <p className="text-sm text-muted-foreground mt-1">Step {step + 1} of {steps.length}: {steps[step]}</p>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Step 0: Contractor Details */}
          {step === 0 && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Contractor Name</Label>
                  <Input value={induction.contractorName} disabled className="bg-muted" />
                </div>
                <div>
                  <Label>Phone</Label>
                  <Input value={induction.contractorPhone || ""} disabled className="bg-muted" />
                </div>
              </div>
              <div>
                <Label>Known Allergies / Medical Conditions</Label>
                <Input
                  value={medicalConditions}
                  onChange={e => setMedicalConditions(e.target.value)}
                  placeholder="None declared"
                />
              </div>
            </div>
          )}

          {/* Step 1: Certificates */}
          {step === 1 && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">Mark each certificate as Y (Yes), N (No), or NA (Not Applicable)</p>
              {certificates.map((cert, idx) => (
                <div key={idx} className="flex items-center gap-3 p-3 rounded-lg border">
                  <div className="flex-1">
                    <p className="text-sm font-medium">{cert.name}</p>
                    <div className="mt-1">
                      <Input
                        placeholder="Expiry date"
                        value={cert.expiryDate || ""}
                        onChange={e => updateCertExpiry(idx, e.target.value)}
                        className="h-8 text-xs"
                      />
                    </div>
                  </div>
                  <div className="flex gap-1">
                    {["Y", "N", "NA"].map(s => (
                      <Button
                        key={s}
                        variant={cert.status === s ? "default" : "outline"}
                        size="sm"
                        className="w-10"
                        onClick={() => updateCertStatus(idx, s)}
                      >
                        {s}
                      </Button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Step 2: Site Checklist */}
          {step === 2 && (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Issues specific to this site — mark each as Y, N, or NA</p>
              {siteChecklist.map((item, idx) => (
                <div key={idx} className="flex items-center gap-3 p-3 rounded-lg border">
                  <p className="flex-1 text-sm">{item.item}</p>
                  <div className="flex gap-1">
                    {["Y", "N", "NA"].map(s => (
                      <Button
                        key={s}
                        variant={item.status === s ? "default" : "outline"}
                        size="sm"
                        className="w-10"
                        onClick={() => updateChecklistStatus(idx, s)}
                      >
                        {s}
                      </Button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Step 3: Site Rules (read-only) */}
          {step === 3 && (
            <div className="space-y-4">
              <div>
                <h4 className="font-semibold text-sm text-primary mb-2">Site Rules</h4>
                <div className="space-y-2 p-3 rounded-lg bg-muted/50 border text-sm">
                  {(rulesData?.siteRules || []).map((rule, i) => (
                    <div key={i} className="flex gap-2">
                      <span className="text-muted-foreground shrink-0">{i + 1}.</span>
                      <span>{rule}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <h4 className="font-semibold text-sm text-red-600 dark:text-red-400 mb-2">Emergency Procedure</h4>
                <div className="space-y-2 p-3 rounded-lg bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900 text-sm">
                  {(rulesData?.emergencyProcedure || []).map((proc, i) => (
                    <div key={i} className="flex gap-2">
                      <span className="text-red-400 shrink-0">•</span>
                      <span>{proc}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Step 4: Confirmation */}
          {step === 4 && (
            <div className="space-y-4">
              <div className="p-4 rounded-lg bg-primary/5 border border-primary/20">
                <p className="text-sm font-medium">Acknowledgement</p>
                <p className="text-sm text-muted-foreground mt-1">
                  By clicking "Complete & Send", I acknowledge that <strong>{induction.contractorName}</strong> has been inducted on the above site-specific requirements. This submission will be date and time stamped.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Contractor:</span>
                  <span className="ml-2 font-medium">{induction.contractorName}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Medical:</span>
                  <span className="ml-2">{medicalConditions || "None declared"}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Certificates:</span>
                  <span className="ml-2">{certificates.filter(c => c.status).length}/{certificates.length} answered</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Checklist:</span>
                  <span className="ml-2">{siteChecklist.filter(c => c.status).length}/{siteChecklist.length} answered</span>
                </div>
              </div>
            </div>
          )}

          {/* Navigation */}
          <div className="flex justify-between pt-4 border-t">
            <Button variant="outline" onClick={step === 0 ? onClose : () => setStep(s => s - 1)}>
              {step === 0 ? "Cancel" : "Back"}
            </Button>
            {step < 4 ? (
              <Button onClick={() => setStep(s => s + 1)}>
                Next
              </Button>
            ) : (
              <Button
                onClick={() => onSubmit({ medicalConditions, certificates, siteChecklist })}
                disabled={isPending}
                className="bg-green-600 hover:bg-green-700"
              >
                {isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                ) : (
                  <CheckCircle2 className="h-4 w-4 mr-1.5" />
                )}
                Complete & Send
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Plans Section ──────────────────────────────────────────────────────────
function PlansSection({ jobId }: { jobId: number }) {
  const [showUpload, setShowUpload] = useState(false);
  const [uploadTitle, setUploadTitle] = useState("");
  const [uploadDesc, setUploadDesc] = useState("");
  const [uploadCategory, setUploadCategory] = useState("");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<string>("all");

  const { data: plans, isLoading, refetch } = trpc.plans.listByJob.useQuery({ jobId });
  const uploadMutation = trpc.plans.upload.useMutation({
    onSuccess: () => { refetch(); setShowUpload(false); setUploadTitle(""); setUploadDesc(""); setUploadCategory(""); setUploadFile(null); toast.success("Plan uploaded"); },
    onError: (e) => toast.error(e.message),
  });
  const updateCategoryMutation = trpc.plans.updateCategory.useMutation({
    onSuccess: () => { refetch(); toast.success("Category updated"); },
    onError: (e) => toast.error(e.message),
  });
  const submitToClientMutation = trpc.plans.submitToClient.useMutation({
    onSuccess: () => { refetch(); toast.success("Plan submitted to client for approval"); },
    onError: (e) => toast.error(e.message),
  });
  const submitToCouncilMutation = trpc.plans.submitToCouncil.useMutation({
    onSuccess: () => { refetch(); toast.success("Plan submitted to council"); },
    onError: (e) => toast.error(e.message),
  });
  const updateCouncilMutation = trpc.plans.updateCouncilStatus.useMutation({
    onSuccess: () => { refetch(); toast.success("Council status updated"); },
    onError: (e) => toast.error(e.message),
  });
  const deleteMutation = trpc.plans.delete.useMutation({
    onSuccess: () => { refetch(); toast.success("Plan deleted"); },
    onError: (e) => toast.error(e.message),
  });
  const unarchiveMutation = trpc.plans.unarchivePlan.useMutation({
    onSuccess: () => { refetch(); toast.success("Plan restored from archive"); },
    onError: (e) => toast.error(e.message),
  });
  const notifyClientMutation = trpc.plans.notifyClient.useMutation({
    onSuccess: (data) => { toast.success(`Notification sent to ${data.sent} client(s)`); },
    onError: (e) => toast.error(e.message),
  });
  const uploadNewVersionMutation = trpc.plans.uploadNewVersion.useMutation({
    onSuccess: () => { refetch(); setVersionUploadPlanId(null); setVersionFile(null); setVersionDesc(""); toast.success("New version uploaded"); },
    onError: (e) => toast.error(e.message),
  });

  const bulkUploadMutation = trpc.plans.bulkUpload.useMutation({
    onSuccess: (data) => { refetch(); setShowBulkUpload(false); setBulkFiles([]); toast.success(`${data.uploaded} plan(s) uploaded`); },
    onError: (e) => toast.error(e.message),
  });
  const [showBulkUpload, setShowBulkUpload] = useState(false);
  const [bulkFiles, setBulkFiles] = useState<Array<{ file: File; title: string }>>([]);
  const [bulkUploading, setBulkUploading] = useState(false);

  const handleBulkFilesSelected = (fileList: FileList | null) => {
    if (!fileList) return;
    const newFiles = Array.from(fileList).map(f => ({
      file: f,
      title: f.name.replace(/\.[^/.]+$/, "").replace(/[_-]/g, " "),
    }));
    setBulkFiles(prev => [...prev, ...newFiles].slice(0, 20));
  };

  const handleBulkUpload = async () => {
    if (bulkFiles.length === 0) return;
    setBulkUploading(true);
    try {
      const filesData = await Promise.all(
        bulkFiles.map(({ file, title }) =>
          new Promise<{ title: string; fileBase64: string; fileName: string; fileType: string }>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
              const base64 = (reader.result as string).split(",")[1];
              resolve({ title, fileBase64: base64, fileName: file.name, fileType: file.type });
            };
            reader.onerror = reject;
            reader.readAsDataURL(file);
          })
        )
      );
      bulkUploadMutation.mutate({ jobId, files: filesData });
    } catch {
      toast.error("Failed to read files");
    } finally {
      setBulkUploading(false);
    }
  };

  const [versionUploadPlanId, setVersionUploadPlanId] = useState<number | null>(null);
  const [versionFile, setVersionFile] = useState<File | null>(null);
  const [versionDesc, setVersionDesc] = useState("");
  const [versionUploading, setVersionUploading] = useState(false);
  const [annotatingPlan, setAnnotatingPlan] = useState<{ id: number; title: string; fileUrl: string; fileName: string } | null>(null);
  const [expandedCommentsPlanId, setExpandedCommentsPlanId] = useState<number | null>(null);
  const [expandedAuditPlanId, setExpandedAuditPlanId] = useState<number | null>(null);
  const [newStaffComment, setNewStaffComment] = useState("");
  const [showComparison, setShowComparison] = useState(false);
  const addCommentMutation = trpc.plans.addComment.useMutation({
    onSuccess: () => { setNewStaffComment(""); toast.success("Comment added"); },
    onError: (e) => toast.error(e.message),
  });

  const handleVersionUpload = async (parentPlanId: number) => {
    if (!versionFile) return;
    setVersionUploading(true);
    try {
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = (reader.result as string).split(",")[1];
        uploadNewVersionMutation.mutate({
          parentPlanId,
          fileBase64: base64,
          fileName: versionFile.name,
          fileType: versionFile.type,
          description: versionDesc || undefined,
        });
        setVersionUploading(false);
      };
      reader.readAsDataURL(versionFile);
    } catch {
      setVersionUploading(false);
      toast.error("Failed to read file");
    }
  };

  const handleUpload = async () => {
    if (!uploadFile || !uploadTitle) return;
    setUploading(true);
    try {
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = (reader.result as string).split(",")[1];
        uploadMutation.mutate({
          jobId,
          title: uploadTitle,
          description: uploadDesc || undefined,
          category: uploadCategory || undefined,
          fileBase64: base64,
          fileName: uploadFile.name,
          fileType: uploadFile.type,
        });
        setUploading(false);
      };
      reader.readAsDataURL(uploadFile);
    } catch {
      setUploading(false);
      toast.error("Failed to read file");
    }
  };

  const statusConfig: Record<string, { label: string; color: string }> = {
    draft: { label: "Draft", color: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300" },
    submitted_to_client: { label: "Awaiting Client Approval", color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300" },
    client_approved: { label: "Client Approved", color: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300" },
    client_rejected: { label: "Client Rejected", color: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300" },
    submitted_to_council: { label: "Submitted to Council", color: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300" },
    council_approved: { label: "Council Approved", color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300" },
    council_rejected: { label: "Council Rejected", color: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300" },
  };

  if (isLoading) return <div className="flex items-center justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Plans & Drawings</h3>
        <div className="flex gap-2">
          {plans && plans.length >= 2 && (
            <Button variant="outline" onClick={() => setShowComparison(true)} size="sm">
              <ArrowLeftRight className="h-4 w-4 mr-1.5" /> Compare
            </Button>
          )}
          <Button variant="outline" onClick={() => setShowBulkUpload(true)} size="sm">
            <Plus className="h-4 w-4 mr-1.5" /> Bulk Upload
          </Button>
          <Button onClick={() => setShowUpload(true)} size="sm">
            <Plus className="h-4 w-4 mr-1.5" /> Upload Plan
          </Button>
        </div>
      </div>

      {/* Bulk Upload Dialog */}
      {showBulkUpload && (
        <Card>
          <CardContent className="pt-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="font-medium">Bulk Upload Plans</p>
              <Badge variant="outline">{bulkFiles.length}/20 files</Badge>
            </div>
            <div>
              <Label>Select Files</Label>
              <Input type="file" accept=".pdf,.png,.jpg,.jpeg,.dwg,.dxf" multiple onChange={(e) => handleBulkFilesSelected(e.target.files)} />
            </div>
            {bulkFiles.length > 0 && (
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {bulkFiles.map((bf, idx) => (
                  <div key={idx} className="flex items-center gap-2 p-2 rounded border bg-muted/30">
                    <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    <Input
                      value={bf.title}
                      onChange={(e) => {
                        const updated = [...bulkFiles];
                        updated[idx] = { ...updated[idx], title: e.target.value };
                        setBulkFiles(updated);
                      }}
                      className="h-8 text-sm"
                      placeholder="Plan title"
                    />
                    <span className="text-xs text-muted-foreground whitespace-nowrap">{bf.file.name}</span>
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setBulkFiles(bulkFiles.filter((_, i) => i !== idx))}>
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <Button onClick={handleBulkUpload} disabled={bulkFiles.length === 0 || bulkUploading} size="sm">
                {bulkUploading ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : null}
                Upload {bulkFiles.length} Plan{bulkFiles.length !== 1 ? "s" : ""}
              </Button>
              <Button variant="outline" onClick={() => { setShowBulkUpload(false); setBulkFiles([]); }} size="sm">Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Upload Dialog */}
      {showUpload && (
        <Card>
          <CardContent className="pt-4 space-y-3">
            <div>
              <Label>Title *</Label>
              <Input value={uploadTitle} onChange={(e) => setUploadTitle(e.target.value)} placeholder="e.g. Site Plan Rev A" />
            </div>
            <div>
              <Label>Description</Label>
              <Input value={uploadDesc} onChange={(e) => setUploadDesc(e.target.value)} placeholder="Optional description" />
            </div>
            <div>
              <Label>Category</Label>
              <select className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm" value={uploadCategory} onChange={(e) => setUploadCategory(e.target.value)}>
                <option value="">No category</option>
                <option value="Site Plan">Site Plan</option>
                <option value="Floor Plan">Floor Plan</option>
                <option value="Elevation">Elevation</option>
                <option value="Engineering">Engineering</option>
                <option value="Structural">Structural</option>
                <option value="Electrical">Electrical</option>
                <option value="Plumbing">Plumbing</option>
                <option value="Landscape">Landscape</option>
                <option value="Other">Other</option>
              </select>
            </div>
            <div>
              <Label>File *</Label>
              <Input type="file" accept=".pdf,.png,.jpg,.jpeg,.dwg,.dxf" onChange={(e) => setUploadFile(e.target.files?.[0] || null)} />
            </div>
            <div className="flex gap-2">
              <Button onClick={handleUpload} disabled={!uploadFile || !uploadTitle || uploading} size="sm">
                {uploading ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : null}
                Upload
              </Button>
              <Button variant="outline" onClick={() => setShowUpload(false)} size="sm">Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Category Filter */}
      {plans && plans.length > 0 && (
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Filter:</span>
          <div className="flex flex-wrap gap-1">
            <Button variant={categoryFilter === "all" ? "default" : "outline"} size="sm" className="h-7 text-xs" onClick={() => setCategoryFilter("all")}>All</Button>
            {Array.from(new Set(plans.map(p => p.category).filter(Boolean))).sort().map(cat => (
              <Button key={cat} variant={categoryFilter === cat ? "default" : "outline"} size="sm" className="h-7 text-xs" onClick={() => setCategoryFilter(cat!)}>{cat}</Button>
            ))}
            {plans.some(p => !p.category) && (
              <Button variant={categoryFilter === "uncategorized" ? "default" : "outline"} size="sm" className="h-7 text-xs" onClick={() => setCategoryFilter("uncategorized")}>Uncategorized</Button>
            )}
          </div>
        </div>
      )}

      {/* Plans List */}
      {(!plans || plans.length === 0) ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            No plans uploaded yet. Upload a plan to get started.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {plans.filter(p => {
            if (categoryFilter === "all") return true;
            if (categoryFilter === "uncategorized") return !p.category;
            return p.category === categoryFilter;
          }).map((plan) => {
            const status = statusConfig[plan.status] || statusConfig.draft;
            const isImage = /\.(png|jpg|jpeg|gif|webp)$/i.test(plan.fileName);
            const isPdf = /\.pdf$/i.test(plan.fileName);
            // Check if plan is overdue (submitted_to_client for 7+ days)
            const isOverdue = plan.status === "submitted_to_client" && plan.submittedAt &&
              (Date.now() - new Date(plan.submittedAt).getTime()) > 7 * 24 * 60 * 60 * 1000;
            return (
              <Card key={plan.id} className={isOverdue ? "border-amber-400 dark:border-amber-600" : ""}>
                <CardContent className="py-4">
                  <div className="flex items-start justify-between gap-3">
                    {/* Thumbnail */}
                    <a href={plan.fileUrl} target="_blank" rel="noopener noreferrer" className="flex-shrink-0">
                      {isImage ? (
                        <img src={plan.fileUrl} alt={plan.title} className="w-14 h-14 rounded-md object-cover border" />
                      ) : isPdf ? (
                        <PdfThumbnail planId={plan.id} fileUrl={plan.fileUrl} thumbnailUrl={plan.thumbnailUrl} className="w-14 h-14" />
                      ) : (
                        <div className="w-14 h-14 rounded-md border flex flex-col items-center justify-center bg-gray-50 dark:bg-gray-800">
                          <FileText className="h-6 w-6 text-gray-400" />
                          <span className="text-[9px] font-medium mt-0.5 text-muted-foreground uppercase">
                            {plan.fileName.split(".").pop()}
                          </span>
                        </div>
                      )}
                    </a>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="font-medium truncate">{plan.title}</h4>
                        {plan.version > 1 && <Badge variant="outline" className="text-xs">v{plan.version}</Badge>}
                        <Badge className={`text-xs ${status.color}`}>{status.label}</Badge>
                        {isOverdue && <Badge className="text-xs bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300"><AlertTriangle className="h-3 w-3 mr-1" />Overdue</Badge>}
                        {plan.category && <Badge variant="outline" className="text-xs">{plan.category}</Badge>}
                      </div>
                      {plan.description && <p className="text-sm text-muted-foreground mt-1">{plan.description}</p>}
                      <p className="text-xs text-muted-foreground mt-1">{plan.fileName} • Uploaded {new Date(plan.createdAt).toLocaleDateString()}{isOverdue && plan.submittedAt ? ` • Sent ${Math.floor((Date.now() - new Date(plan.submittedAt).getTime()) / (24*60*60*1000))} days ago` : ""}</p>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {/\.(png|jpg|jpeg|gif|webp|pdf)$/i.test(plan.fileName) && (
                        <Button variant="ghost" size="sm" onClick={() => setAnnotatingPlan(plan)} title="Annotate">
                          <PenTool className="h-4 w-4" />
                        </Button>
                      )}
                      <Button variant="ghost" size="sm" asChild>
                        <a href={plan.fileUrl} target="_blank" rel="noopener noreferrer"><Eye className="h-4 w-4" /></a>
                      </Button>
                      <Button variant="ghost" size="sm" asChild>
                        <a href={plan.fileUrl} download={plan.fileName}><Download className="h-4 w-4" /></a>
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm"><ChevronDown className="h-4 w-4" /></Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {plan.status === "draft" && (
                            <DropdownMenuItem onClick={() => submitToClientMutation.mutate({ planId: plan.id })}>
                              <Send className="h-4 w-4 mr-2" /> Submit to Client
                            </DropdownMenuItem>
                          )}
                          {plan.status === "submitted_to_client" && (
                            <DropdownMenuItem onClick={() => notifyClientMutation.mutate({ planId: plan.id })}>
                              <Mail className="h-4 w-4 mr-2" /> Notify Client
                            </DropdownMenuItem>
                          )}
                          {plan.status === "client_rejected" && (
                            <DropdownMenuItem onClick={() => submitToClientMutation.mutate({ planId: plan.id })}>
                              <Send className="h-4 w-4 mr-2" /> Resubmit to Client
                            </DropdownMenuItem>
                          )}
                          {plan.status === "client_approved" && (
                            <DropdownMenuItem onClick={() => submitToCouncilMutation.mutate({ planId: plan.id })}>
                              <Send className="h-4 w-4 mr-2" /> Submit to Council
                            </DropdownMenuItem>
                          )}
                          {plan.status === "submitted_to_council" && (
                            <>
                              <DropdownMenuItem onClick={() => updateCouncilMutation.mutate({ planId: plan.id, approved: true })}>
                                <CheckCircle2 className="h-4 w-4 mr-2" /> Council Approved
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => updateCouncilMutation.mutate({ planId: plan.id, approved: false })}>
                                <Ban className="h-4 w-4 mr-2" /> Council Rejected
                              </DropdownMenuItem>
                            </>
                          )}
                          <DropdownMenuSub>
                            <DropdownMenuSubTrigger>
                              <FolderOpen className="h-4 w-4 mr-2" /> Set Category
                            </DropdownMenuSubTrigger>
                            <DropdownMenuSubContent>
                              {["Site Plan", "Floor Plan", "Elevation", "Engineering", "Structural", "Electrical", "Plumbing", "Landscape", "Other"].map(cat => (
                                <DropdownMenuItem key={cat} onClick={() => updateCategoryMutation.mutate({ planId: plan.id, category: cat })}>
                                  {plan.category === cat ? <CheckCircle2 className="h-3.5 w-3.5 mr-2 text-green-600" /> : <span className="w-[22px]" />} {cat}
                                </DropdownMenuItem>
                              ))}
                              {plan.category && (
                                <DropdownMenuItem onClick={() => updateCategoryMutation.mutate({ planId: plan.id, category: null })}>
                                  <X className="h-3.5 w-3.5 mr-2" /> Remove Category
                                </DropdownMenuItem>
                              )}
                            </DropdownMenuSubContent>
                          </DropdownMenuSub>
                          <DropdownMenuItem onClick={() => setVersionUploadPlanId(plan.id)}>
                            <RefreshCw className="h-4 w-4 mr-2" /> Upload New Version
                          </DropdownMenuItem>
                          {plan.status === "archived" && (
                            <DropdownMenuItem onClick={() => unarchiveMutation.mutate({ planId: plan.id })}>
                              <RefreshCw className="h-4 w-4 mr-2" /> Unarchive (Restore)
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem className="text-red-600" onClick={() => { if (confirm("Delete this plan?")) deleteMutation.mutate({ planId: plan.id }); }}>
                            <Trash2 className="h-4 w-4 mr-2" /> Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                  {/* Comments Section */}
                  <button
                    className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                    onClick={() => setExpandedCommentsPlanId(expandedCommentsPlanId === plan.id ? null : plan.id)}
                  >
                    <MessageSquare className="h-3.5 w-3.5" />
                    {expandedCommentsPlanId === plan.id ? "Hide" : "View"} Comments
                  </button>
                  {expandedCommentsPlanId === plan.id && (
                    <PlanCommentsInline planId={plan.id} newComment={newStaffComment} setNewComment={setNewStaffComment} addCommentMutation={addCommentMutation} />
                  )}
                  {/* Audit Log Timeline */}
                  <button
                    className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                    onClick={() => setExpandedAuditPlanId(expandedAuditPlanId === plan.id ? null : plan.id)}
                  >
                    <ClipboardList className="h-3.5 w-3.5" />
                    {expandedAuditPlanId === plan.id ? "Hide" : "View"} History
                  </button>
                  {expandedAuditPlanId === plan.id && (
                    <PlanAuditTimeline planId={plan.id} />
                  )}
                  {/* Upload New Version inline form */}
                  {versionUploadPlanId === plan.id && (
                    <div className="mt-3 pt-3 border-t space-y-2">
                      <p className="text-sm font-medium">Upload New Version of "{plan.title}"</p>
                      <div>
                        <Label className="text-xs">File *</Label>
                        <Input type="file" accept=".pdf,.png,.jpg,.jpeg,.dwg,.dxf" onChange={(e) => setVersionFile(e.target.files?.[0] || null)} />
                      </div>
                      <div>
                        <Label className="text-xs">Description (optional)</Label>
                        <Input value={versionDesc} onChange={(e) => setVersionDesc(e.target.value)} placeholder="What changed in this version?" />
                      </div>
                      <div className="flex gap-2">
                        <Button onClick={() => handleVersionUpload(plan.id)} disabled={!versionFile || versionUploading} size="sm">
                          {versionUploading ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : null}
                          Upload Version
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => { setVersionUploadPlanId(null); setVersionFile(null); setVersionDesc(""); }}>Cancel</Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Comparison Dialog */}
      {showComparison && plans && plans.length >= 2 && (
        <PlanComparison
          open={showComparison}
          onClose={() => setShowComparison(false)}
          plans={plans.map(p => ({ id: p.id, title: p.title, version: p.version, fileName: p.fileName, fileUrl: p.fileUrl, description: p.description, createdAt: p.createdAt }))}
        />
      )}

      {/* Annotation Dialog */}
      {annotatingPlan && (
        <PlanAnnotation
          open={!!annotatingPlan}
          onClose={() => setAnnotatingPlan(null)}
          imageUrl={annotatingPlan.fileUrl}
          planTitle={annotatingPlan.title}
        />
      )}
    </div>
  );
}

// ─── Plan Comments Inline (Staff Side) ───────────────────────────────────────
function PlanCommentsInline({ planId, newComment, setNewComment, addCommentMutation }: {
  planId: number;
  newComment: string;
  setNewComment: (v: string) => void;
  addCommentMutation: any;
}) {
  const { data, isLoading } = trpc.plans.getDetail.useQuery({ planId });
  const comments = data?.comments || [];

  if (isLoading) return <div className="mt-2 py-3 flex justify-center"><Loader2 className="h-4 w-4 animate-spin" /></div>;

  return (
    <div className="mt-2 pt-2 border-t space-y-2">
      {comments.length === 0 ? (
        <p className="text-xs text-muted-foreground">No comments yet</p>
      ) : (
        <div className="space-y-2 max-h-48 overflow-y-auto">
          {comments.map((c: any) => (
            <div key={c.id} className={`text-sm p-2.5 rounded-lg ${
              c.userType === "client" ? "bg-blue-50 border border-blue-100 dark:bg-blue-950/30 dark:border-blue-900" : "bg-gray-50 border border-gray-100 dark:bg-gray-800 dark:border-gray-700"
            }`}>
              <div className="flex items-center gap-2 mb-1">
                <span className="font-medium text-xs">
                  {c.userType === "client" ? "Client" : "Staff"}
                </span>
                <span className="text-[10px] text-muted-foreground">
                  {new Date(c.createdAt).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
              <p className="text-xs sm:text-sm whitespace-pre-wrap">{c.comment}</p>
              {c.attachmentUrl && (
                <a href={c.attachmentUrl} target="_blank" rel="noopener noreferrer" className="block mt-2">
                  <img src={c.attachmentUrl} alt="Client annotation" className="max-w-full max-h-40 rounded border object-contain" />
                  <span className="text-[10px] text-blue-600 mt-1 inline-block">View full client markup</span>
                </a>
              )}
            </div>
          ))}
        </div>
      )}
      {/* Add comment form */}
      <div className="flex gap-2">
        <Textarea
          value={newComment}
          onChange={(e) => setNewComment(e.target.value)}
          placeholder="Add a comment..."
          rows={2}
          className="text-sm flex-1"
        />
        <Button
          onClick={() => addCommentMutation.mutate({ planId, comment: newComment })}
          disabled={!newComment.trim() || addCommentMutation.isPending}
          size="icon"
          className="h-auto self-end"
        >
          {addCommentMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  );
}

// ─── Plan Audit Timeline ────────────────────────────────────────────────────
function PlanAuditTimeline({ planId }: { planId: number }) {
  const { data: logs, isLoading } = trpc.plans.getAuditLog.useQuery({ planId });

  const getActionIcon = (action: string) => {
    switch (action) {
      case "uploaded": return "📤";
      case "submitted_to_client": return "📨";
      case "client_approved": return "✅";
      case "client_rejected": return "❌";
      case "submitted_to_council": return "🏛️";
      case "council_approved": return "✅";
      case "council_rejected": return "❌";
      case "archived": return "📦";
      case "comment_added": return "💬";
      default: return "📋";
    }
  };

  const getActionLabel = (action: string) => {
    switch (action) {
      case "uploaded": return "Uploaded";
      case "submitted_to_client": return "Submitted to Client";
      case "client_approved": return "Client Approved";
      case "client_rejected": return "Client Rejected";
      case "submitted_to_council": return "Submitted to Council";
      case "council_approved": return "Council Approved";
      case "council_rejected": return "Council Rejected";
      case "archived": return "Archived";
      case "comment_added": return "Comment Added";
      default: return action.replace(/_/g, " ");
    }
  };

  const getPerformerBadge = (type: string) => {
    switch (type) {
      case "staff": return "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300";
      case "client": return "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300";
      case "system": return "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300";
      default: return "bg-gray-100 text-gray-700";
    }
  };

  if (isLoading) return <div className="mt-2 text-xs text-muted-foreground">Loading history...</div>;
  if (!logs || logs.length === 0) return <div className="mt-2 text-xs text-muted-foreground">No history recorded yet</div>;

  return (
    <div className="mt-2 pt-2 border-t">
      <div className="relative pl-4 space-y-3">
        {/* Vertical timeline line */}
        <div className="absolute left-[7px] top-1 bottom-1 w-px bg-border" />
        {logs.map((log: any) => (
          <div key={log.id} className="relative flex items-start gap-3">
            {/* Timeline dot */}
            <div className="absolute left-[-12px] top-1 w-2.5 h-2.5 rounded-full bg-primary border-2 border-background shadow-sm" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm">{getActionIcon(log.action)}</span>
                <span className="text-xs font-medium">{getActionLabel(log.action)}</span>
                {log.performedByName && (
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${getPerformerBadge(log.performedByType)}`}>
                    {log.performedByName}
                  </span>
                )}
              </div>
              {log.details && (
                <p className="text-xs text-muted-foreground mt-0.5 truncate">{log.details}</p>
              )}
              <p className="text-[10px] text-muted-foreground mt-0.5">
                {new Date(log.createdAt).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Plan History Section (Job-Level Audit Log) ─────────────────────────────
function PlanHistorySection({ jobId }: { jobId: number }) {
  const { data: logs, isLoading } = trpc.plans.getJobAuditLog.useQuery({ jobId });
  const [filter, setFilter] = useState<string>("all");

  const getActionIcon = (action: string) => {
    switch (action) {
      case "uploaded": return "📤";
      case "submitted_to_client": return "📨";
      case "client_approved": return "✅";
      case "client_rejected": return "❌";
      case "submitted_to_council": return "🏛️";
      case "council_approved": return "✅";
      case "council_rejected": return "❌";
      case "archived": return "📦";
      case "unarchived": return "🔄";
      case "comment_added": return "💬";
      default: return "📋";
    }
  };

  const getActionLabel = (action: string) => {
    switch (action) {
      case "uploaded": return "Plan Uploaded";
      case "submitted_to_client": return "Submitted to Client";
      case "client_approved": return "Client Approved";
      case "client_rejected": return "Client Rejected";
      case "submitted_to_council": return "Submitted to Council";
      case "council_approved": return "Council Approved";
      case "council_rejected": return "Council Rejected";
      case "archived": return "Archived";
      case "unarchived": return "Restored from Archive";
      case "comment_added": return "Comment Added";
      default: return action.replace(/_/g, " ");
    }
  };

  const getPerformerBadge = (type: string) => {
    switch (type) {
      case "staff": return "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300";
      case "client": return "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300";
      case "system": return "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300";
      default: return "bg-gray-100 text-gray-700";
    }
  };

  const getActionColor = (action: string) => {
    if (action.includes("approved")) return "border-l-green-500";
    if (action.includes("rejected")) return "border-l-red-500";
    if (action === "archived") return "border-l-gray-400";
    if (action === "unarchived") return "border-l-blue-500";
    if (action === "uploaded") return "border-l-purple-500";
    if (action.includes("submitted")) return "border-l-amber-500";
    return "border-l-gray-300";
  };

  const actionTypes = [
    { value: "all", label: "All Events" },
    { value: "uploaded", label: "Uploads" },
    { value: "submitted_to_client", label: "Client Submissions" },
    { value: "client_approved", label: "Client Approvals" },
    { value: "client_rejected", label: "Client Rejections" },
    { value: "submitted_to_council", label: "Council Submissions" },
    { value: "archived", label: "Archives" },
    { value: "unarchived", label: "Restorations" },
  ];

  const filteredLogs = logs?.filter((log: any) => filter === "all" || log.action === filter) || [];

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6 flex items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin mr-2" />
          <span className="text-muted-foreground">Loading plan history...</span>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-4 sm:p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-primary" />
            <h3 className="font-semibold text-lg">Plan Activity Log</h3>
            <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
              {filteredLogs.length} events
            </span>
          </div>
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="text-sm border rounded-md px-2 py-1 bg-background"
          >
            {actionTypes.map(t => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </div>

        {filteredLogs.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Clock className="h-10 w-10 mx-auto mb-2 opacity-30" />
            <p className="text-sm">No plan activity recorded yet</p>
          </div>
        ) : (
          <div className="space-y-2 max-h-[600px] overflow-y-auto">
            {filteredLogs.map((log: any) => (
              <div
                key={log.id}
                className={`flex items-start gap-3 p-3 rounded-lg border-l-4 bg-muted/30 ${getActionColor(log.action)}`}
              >
                <span className="text-lg mt-0.5">{getActionIcon(log.action)}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium">{getActionLabel(log.action)}</span>
                    {log.performedByName && (
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${getPerformerBadge(log.performedByType)}`}>
                        {log.performedByName}
                      </span>
                    )}
                  </div>
                  {log.details && (
                    <p className="text-xs text-muted-foreground mt-0.5">{log.details}</p>
                  )}
                  <p className="text-[10px] text-muted-foreground mt-1">
                    {new Date(log.createdAt).toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}


// ─── Project Plan Tab (Embedded Kanban) ──────────────────────────────────────
const KANBAN_COLUMNS = [
  { id: "backlog", label: "Backlog", color: "border-t-slate-400", bgColor: "bg-slate-50 dark:bg-slate-800/40" },
  { id: "todo", label: "To Do", color: "border-t-blue-400", bgColor: "bg-blue-50 dark:bg-blue-900/20" },
  { id: "in_progress", label: "In Progress", color: "border-t-amber-400", bgColor: "bg-amber-50 dark:bg-amber-900/20" },
  { id: "review", label: "Review", color: "border-t-purple-400", bgColor: "bg-purple-50 dark:bg-purple-900/20" },
  { id: "done", label: "Done", color: "border-t-green-400", bgColor: "bg-green-50 dark:bg-green-900/20" },
] as const;

type KanbanColumnId = typeof KANBAN_COLUMNS[number]["id"];

const PRIORITY_CONFIG: Record<string, { color: string; label: string }> = {
  low: { color: "text-slate-500", label: "Low" },
  normal: { color: "text-blue-500", label: "Normal" },
  high: { color: "text-orange-500", label: "High" },
  urgent: { color: "text-red-500", label: "Urgent" },
};

function ProjectPlanTab({ jobId }: { jobId: number }) {
  const isMobile = useIsMobile();
  const [mobileColumn, setMobileColumn] = useState<KanbanColumnId>("todo");
  const [showCreate, setShowCreate] = useState(false);
  const [createColumn, setCreateColumn] = useState<KanbanColumnId>("todo");
  const [editingTask, setEditingTask] = useState<any>(null);

  const tasksQuery = trpc.constructionKanban.tasks.list.useQuery({ jobId });
  const installersQuery = trpc.construction.installers.list.useQuery();
  const templatesQuery = trpc.projectPlanTemplates.listActive.useQuery(undefined, { enabled: false });

  const createTask = trpc.constructionKanban.tasks.create.useMutation({
    onSuccess: () => { tasksQuery.refetch(); setShowCreate(false); toast.success("Task created"); },
  });
  const updateTask = trpc.constructionKanban.tasks.update.useMutation({
    onSuccess: () => { tasksQuery.refetch(); setEditingTask(null); toast.success("Task updated"); },
  });
  const moveTask = trpc.constructionKanban.tasks.move.useMutation({
    onSuccess: () => tasksQuery.refetch(),
  });
  const deleteTask = trpc.constructionKanban.tasks.delete.useMutation({
    onSuccess: () => { tasksQuery.refetch(); toast.success("Task deleted"); },
  });
  const seedFromTemplate = trpc.projectPlanTemplates.seedFromTemplate.useMutation({
    onSuccess: (data) => {
      tasksQuery.refetch();
      toast.success(`Seeded "${data.templateName}": ${data.stagesCreated} stages, ${data.tasksCreated} tasks`);
    },
    onError: (err) => toast.error(err.message || "Failed to seed"),
  });

  const tasks = tasksQuery.data || [];
  const tasksByColumn = useMemo(() => {
    const map: Record<string, any[]> = {};
    for (const col of KANBAN_COLUMNS) map[col.id] = [];
    for (const task of tasks) {
      if (map[task.column]) map[task.column].push(task);
    }
    // Sort by position within each column
    for (const key of Object.keys(map)) {
      map[key].sort((a: any, b: any) => (a.sortOrder ?? a.position ?? 0) - (b.sortOrder ?? b.position ?? 0));
    }
    return map;
  }, [tasks]);
  const getColumnTasks = (col: KanbanColumnId) => tasksByColumn[col] || [];

  // DnD state
  const [activeId, setActiveId] = useState<number | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
  );
  const activeTask = useMemo(() => {
    if (!activeId) return null;
    return tasks.find((t: any) => t.id === activeId) || null;
  }, [activeId, tasks]);

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(Number(event.active.id));
  }, []);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);
    if (!over) return;

    const taskId = Number(active.id);
    let targetColumn: string;
    const overIdStr = String(over.id);
    // Check if dropped on a column droppable
    if (KANBAN_COLUMNS.some(c => c.id === overIdStr)) {
      targetColumn = overIdStr;
    } else {
      // Dropped on another task - find its column
      const overTask = tasks.find((t: any) => t.id === Number(over.id));
      targetColumn = overTask?.column || "backlog";
    }

    const task = tasks.find((t: any) => t.id === taskId);
    if (!task) return;

    const tasksInCol = tasksByColumn[targetColumn] || [];
    const overIndex = tasksInCol.findIndex((t: any) => t.id === Number(over.id));
    const newPosition = overIndex >= 0 ? overIndex : tasksInCol.length;

    if (task.column !== targetColumn || (task.position ?? 0) !== newPosition) {
      moveTask.mutate({
        id: taskId,
        column: targetColumn as KanbanColumnId,
        position: newPosition,
      });
    }
  }, [tasks, tasksByColumn, moveTask]);

  const [newTitle, setNewTitle] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newPriority, setNewPriority] = useState("normal");
  const [newAssignee, setNewAssignee] = useState<string>("");

  const handleCreate = () => {
    if (!newTitle.trim()) return;
    createTask.mutate({
      jobId,
      title: newTitle.trim(),
      description: newDescription.trim() || undefined,
      column: createColumn,
      priority: newPriority as "low" | "normal" | "high" | "urgent",
      assignedTo: newAssignee ? Number(newAssignee) : undefined,
    });
    setNewTitle("");
    setNewDescription("");
    setNewPriority("normal");
    setNewAssignee("");
  };

  const handleMove = (taskId: number, newColumn: KanbanColumnId) => {
    moveTask.mutate({ id: taskId, column: newColumn, position: 0 });
  };

  if (tasksQuery.isLoading) {
    return <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-4">
      {/* Header actions */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Badge variant="outline">{tasks.length} task{tasks.length !== 1 ? "s" : ""}</Badge>
          {tasks.length > 0 && (
            <Badge variant="secondary" className="text-green-700 bg-green-100">
              {tasks.filter((t: any) => t.column === "done").length} done
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => {
            templatesQuery.refetch().then(({ data }) => {
              if (data && data.length > 0) {
                seedFromTemplate.mutate({ jobId, templateId: data[0].id });
              } else {
                toast.error("No active templates available");
              }
            });
          }}>
            <ClipboardList className="h-4 w-4 mr-1" /> Seed from Template
          </Button>
          <Button size="sm" onClick={() => { setCreateColumn("todo"); setShowCreate(true); }}>
            <Plus className="h-4 w-4 mr-1" /> Add Task
          </Button>
        </div>
      </div>

      {/* Mobile: single column selector */}
      {isMobile ? (
        <div className="space-y-3">
          <div className="flex gap-1 overflow-x-auto pb-1">
            {KANBAN_COLUMNS.map(col => (
              <Button
                key={col.id}
                variant={mobileColumn === col.id ? "default" : "outline"}
                size="sm"
                className="shrink-0 text-xs"
                onClick={() => setMobileColumn(col.id)}
              >
                {col.label} ({getColumnTasks(col.id).length})
              </Button>
            ))}
          </div>
          <div className="space-y-2">
            {getColumnTasks(mobileColumn).map((task: any) => (
              <KanbanTaskCard
                key={task.id}
                task={task}
                onEdit={() => setEditingTask(task)}
                onDelete={() => deleteTask.mutate({ id: task.id })}
                onMove={handleMove}
              />
            ))}
            {getColumnTasks(mobileColumn).length === 0 && (
              <p className="text-center text-sm text-muted-foreground py-6">No tasks in this column</p>
            )}
          </div>
        </div>
      ) : (
        /* Desktop: multi-column kanban with drag-and-drop */
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <div className="grid grid-cols-5 gap-3">
            {KANBAN_COLUMNS.map(col => (
              <DroppableKanbanColumn
                key={col.id}
                column={col}
                tasks={getColumnTasks(col.id)}
                onAddTask={() => { setCreateColumn(col.id); setShowCreate(true); }}
                onEditTask={setEditingTask}
                onDeleteTask={(id) => deleteTask.mutate({ id })}
                onMove={handleMove}
              />
            ))}
          </div>
          <DragOverlay>
            {activeTask ? (
              <div className="bg-background rounded-lg border p-2.5 shadow-lg ring-2 ring-primary text-xs opacity-90">
                <p className="font-medium leading-tight text-xs">{activeTask.title}</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className={`text-[10px] font-medium ${(PRIORITY_CONFIG[activeTask.priority] || PRIORITY_CONFIG.normal).color}`}>
                    {(PRIORITY_CONFIG[activeTask.priority] || PRIORITY_CONFIG.normal).label}
                  </span>
                </div>
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      )}

      {/* Create Task Dialog */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowCreate(false)}>
          <div className="bg-background rounded-lg shadow-xl p-6 w-full max-w-md mx-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-4">New Task in "{KANBAN_COLUMNS.find(c => c.id === createColumn)?.label}"</h3>
            <div className="space-y-3">
              <div>
                <Label className="text-sm">Title</Label>
                <Input value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="Task title..." autoFocus />
              </div>
              <div>
                <Label className="text-sm">Description (optional)</Label>
                <Textarea value={newDescription} onChange={e => setNewDescription(e.target.value)} placeholder="Details..." rows={3} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-sm">Priority</Label>
                  <select className="w-full border rounded-md px-3 py-2 text-sm bg-background" value={newPriority} onChange={e => setNewPriority(e.target.value)}>
                    <option value="low">Low</option>
                    <option value="normal">Normal</option>
                    <option value="high">High</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </div>
                <div>
                  <Label className="text-sm">Assign to</Label>
                  <select className="w-full border rounded-md px-3 py-2 text-sm bg-background" value={newAssignee} onChange={e => setNewAssignee(e.target.value)}>
                    <option value="">Unassigned</option>
                    {(installersQuery.data || []).map((inst: any) => (
                      <option key={inst.id} value={inst.id}>{inst.name}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
              <Button onClick={handleCreate} disabled={!newTitle.trim() || createTask.isPending}>Create</Button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Task Dialog */}
      {editingTask && (
        <EditTaskDialog
          task={editingTask}
          installers={installersQuery.data || []}
          onClose={() => setEditingTask(null)}
          onSave={(data) => updateTask.mutate({ id: editingTask.id, ...data })}
          onDelete={() => { deleteTask.mutate({ id: editingTask.id }); setEditingTask(null); }}
          isPending={updateTask.isPending}
        />
      )}
    </div>
  );
}

// ─── Droppable Kanban Column ─────────────────────────────────────────────────
function DroppableKanbanColumn({ column, tasks, onAddTask, onEditTask, onDeleteTask, onMove }: {
  column: typeof KANBAN_COLUMNS[number];
  tasks: any[];
  onAddTask: () => void;
  onEditTask: (task: any) => void;
  onDeleteTask: (id: number) => void;
  onMove: (id: number, col: KanbanColumnId) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: column.id });

  return (
    <div
      ref={setNodeRef}
      className={`rounded-lg border-t-4 ${column.color} ${column.bgColor} p-2 min-h-[200px] transition-all ${isOver ? "ring-2 ring-primary/30 bg-primary/5" : ""}`}
    >
      <div className="flex items-center justify-between mb-2 px-1">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{column.label}</span>
        <Badge variant="outline" className="text-[10px] h-5">{tasks.length}</Badge>
      </div>
      <div className="space-y-2 min-h-[80px]">
        <SortableContext items={tasks.map((t: any) => t.id)} strategy={verticalListSortingStrategy}>
          {tasks.map((task: any) => (
            <SortableKanbanCard
              key={task.id}
              task={task}
              onEdit={() => onEditTask(task)}
              onDelete={() => onDeleteTask(task.id)}
              onMove={onMove}
            />
          ))}
        </SortableContext>
      </div>
      <Button
        variant="ghost"
        size="sm"
        className="w-full mt-2 text-xs text-muted-foreground"
        onClick={onAddTask}
      >
        <Plus className="h-3 w-3 mr-1" /> Add
      </Button>
    </div>
  );
}

// ─── Sortable Kanban Card ────────────────────────────────────────────────────
function SortableKanbanCard({ task, onEdit, onDelete, onMove }: {
  task: any;
  onEdit: () => void;
  onDelete: () => void;
  onMove: (id: number, col: KanbanColumnId) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.3 : 1,
  };

  return (
    <div ref={setNodeRef} style={style}>
      <KanbanTaskCard task={task} onEdit={onEdit} onDelete={onDelete} onMove={onMove} dragProps={{ ...attributes, ...listeners }} compact />
    </div>
  );
}

// ─── Kanban Task Card (used in both mobile and desktop) ──────────────────────
function KanbanTaskCard({ task, onEdit, onDelete, onMove, dragProps, compact }: {
  task: any;
  onEdit: () => void;
  onDelete: () => void;
  onMove: (id: number, col: KanbanColumnId) => void;
  dragProps?: any;
  compact?: boolean;
}) {
  const priority = PRIORITY_CONFIG[task.priority] || PRIORITY_CONFIG.normal;

  return (
    <div className={`bg-background rounded-lg border p-2.5 shadow-sm hover:shadow-md transition-shadow cursor-pointer group ${compact ? "text-xs" : "text-sm"}`} onClick={onEdit}>
      <div className="flex items-start justify-between gap-1">
        <div className="flex items-start gap-1">
          {dragProps && (
            <button {...dragProps} className="mt-0.5 cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground touch-none" onClick={e => e.stopPropagation()}>
              <GripVertical className="h-3.5 w-3.5" />
            </button>
          )}
          <p className={`font-medium leading-tight ${compact ? "text-xs" : "text-sm"}`}>{task.title}</p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild onClick={e => e.stopPropagation()}>
            <Button variant="ghost" size="icon" className="h-5 w-5 opacity-0 group-hover:opacity-100 shrink-0">
              <ChevronDown className="h-3 w-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>Move to</DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                {KANBAN_COLUMNS.filter(c => c.id !== task.column).map(col => (
                  <DropdownMenuItem key={col.id} onClick={(e) => { e.stopPropagation(); onMove(task.id, col.id); }}>
                    {col.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onDelete(); }} className="text-destructive">
              <Trash2 className="h-3 w-3 mr-1" /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {!compact && task.description && <p className="text-muted-foreground text-xs mt-1 line-clamp-2">{task.description}</p>}
      <div className="flex items-center gap-2 mt-1.5 flex-wrap">
        <span className={`text-[10px] font-medium ${priority.color}`}>{priority.label}</span>
        {task.assignedToName && (
          <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
            <User className="h-2.5 w-2.5" /> {task.assignedToName}
          </span>
        )}
        {task.dueDate && (
          <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
            <Calendar className="h-2.5 w-2.5" /> {new Date(task.dueDate).toLocaleDateString("en-AU", { day: "numeric", month: "short" })}
          </span>
        )}
      </div>
    </div>
  );
}

function EditTaskDialog({ task, installers, onClose, onSave, onDelete, isPending }: {
  task: any;
  installers: any[];
  onClose: () => void;
  onSave: (data: any) => void;
  onDelete: () => void;
  isPending: boolean;
}) {
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description || "");
  const [priority, setPriority] = useState(task.priority || "normal");
  const [assignee, setAssignee] = useState(task.assignedTo?.toString() || "");
  const [column, setColumn] = useState(task.column);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-background rounded-lg shadow-xl p-6 w-full max-w-md mx-4" onClick={e => e.stopPropagation()}>
        <h3 className="text-lg font-semibold mb-4">Edit Task</h3>
        <div className="space-y-3">
          <div>
            <Label className="text-sm">Title</Label>
            <Input value={title} onChange={e => setTitle(e.target.value)} />
          </div>
          <div>
            <Label className="text-sm">Description</Label>
            <Textarea value={description} onChange={e => setDescription(e.target.value)} rows={3} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-sm">Status</Label>
              <select className="w-full border rounded-md px-3 py-2 text-sm bg-background" value={column} onChange={e => setColumn(e.target.value)}>
                {KANBAN_COLUMNS.map(col => <option key={col.id} value={col.id}>{col.label}</option>)}
              </select>
            </div>
            <div>
              <Label className="text-sm">Priority</Label>
              <select className="w-full border rounded-md px-3 py-2 text-sm bg-background" value={priority} onChange={e => setPriority(e.target.value)}>
                <option value="low">Low</option>
                <option value="normal">Normal</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>
          </div>
          <div>
            <Label className="text-sm">Assign to</Label>
            <select className="w-full border rounded-md px-3 py-2 text-sm bg-background" value={assignee} onChange={e => setAssignee(e.target.value)}>
              <option value="">Unassigned</option>
              {installers.map((inst: any) => <option key={inst.id} value={inst.id}>{inst.name}</option>)}
            </select>
          </div>
        </div>
        <div className="flex items-center justify-between mt-4">
          <Button variant="destructive" size="sm" onClick={onDelete}>
            <Trash2 className="h-4 w-4 mr-1" /> Delete
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={() => onSave({
              title: title.trim(),
              description: description.trim() || undefined,
              priority,
              column,
              assignedTo: assignee ? Number(assignee) : null,
            })} disabled={!title.trim() || isPending}>
              Save
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Schedule Tab (embedded calendar filtered to this job) ─────────────────────
const EVENT_TYPE_CONFIG: Record<string, { color: string; icon: any; label: string }> = {
  installation: { color: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300", icon: Wrench, label: "Installation" },
  inspection: { color: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300", icon: ClipboardCheck, label: "Inspection" },
  meeting: { color: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300", icon: Users, label: "Meeting" },
  delivery: { color: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300", icon: Package, label: "Delivery" },
  other: { color: "bg-slate-100 text-slate-800 dark:bg-slate-900/30 dark:text-slate-300", icon: Clock, label: "Other" },
};

const SCHEDULE_STATUS_COLORS: Record<string, string> = {
  scheduled: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  confirmed: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  completed: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
  cancelled: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
};

function ScheduleTab({ jobId }: { jobId: number }) {
  const [viewMode, setViewMode] = useState<"list" | "month">("list");
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [showCreate, setShowCreate] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<any>(null);

  const dateRange = useMemo(() => {
    const d = new Date(currentDate);
    if (viewMode === "month") {
      const start = new Date(d.getFullYear(), d.getMonth(), 1);
      start.setDate(start.getDate() - start.getDay());
      const end = new Date(start);
      end.setDate(end.getDate() + 42);
      return { start: start.toISOString(), end: end.toISOString() };
    }
    // List view: show 3 months ahead
    const start = new Date();
    start.setDate(start.getDate() - 7);
    const end = new Date();
    end.setMonth(end.getMonth() + 3);
    return { start: start.toISOString(), end: end.toISOString() };
  }, [currentDate, viewMode]);

  const eventsQuery = trpc.constructionSchedule.list.useQuery({
    jobId,
    startDate: dateRange.start,
    endDate: dateRange.end,
  });
  const installersQuery = trpc.construction.installers.list.useQuery();

  const createEvent = trpc.constructionSchedule.create.useMutation({
    onSuccess: () => { eventsQuery.refetch(); setShowCreate(false); toast.success("Event created"); },
    onError: (err: any) => toast.error(err.message),
  });
  const updateEvent = trpc.constructionSchedule.update.useMutation({
    onSuccess: () => { eventsQuery.refetch(); setSelectedEvent(null); toast.success("Event updated"); },
    onError: (err: any) => toast.error(err.message),
  });
  const deleteEvent = trpc.constructionSchedule.delete.useMutation({
    onSuccess: () => { eventsQuery.refetch(); setSelectedEvent(null); toast.success("Event deleted"); },
  });

  const events = eventsQuery.data || [];

  const navigatePrev = () => {
    const d = new Date(currentDate);
    d.setMonth(d.getMonth() - 1);
    setCurrentDate(d);
  };
  const navigateNext = () => {
    const d = new Date(currentDate);
    d.setMonth(d.getMonth() + 1);
    setCurrentDate(d);
  };

  // Group events by date for list view
  const groupedEvents = useMemo(() => {
    const groups: Record<string, any[]> = {};
    for (const ev of events) {
      const dateKey = new Date(ev.startTime).toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
      if (!groups[dateKey]) groups[dateKey] = [];
      groups[dateKey].push(ev);
    }
    return Object.entries(groups).sort((a, b) => {
      const da = new Date(a[1][0].startTime).getTime();
      const db = new Date(b[1][0].startTime).getTime();
      return da - db;
    });
  }, [events]);

  // Month calendar data
  const calendarDays = useMemo(() => {
    if (viewMode !== "month") return [];
    const d = new Date(currentDate);
    const firstDay = new Date(d.getFullYear(), d.getMonth(), 1);
    const startOffset = firstDay.getDay();
    const start = new Date(firstDay);
    start.setDate(start.getDate() - startOffset);
    const days: { date: Date; events: any[]; isCurrentMonth: boolean }[] = [];
    for (let i = 0; i < 42; i++) {
      const day = new Date(start);
      day.setDate(start.getDate() + i);
      const dayStr = day.toISOString().slice(0, 10);
      const dayEvents = events.filter(ev => new Date(ev.startTime).toISOString().slice(0, 10) === dayStr);
      days.push({ date: day, events: dayEvents, isCurrentMonth: day.getMonth() === d.getMonth() });
    }
    return days;
  }, [currentDate, events, viewMode]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Badge variant="outline">{events.length} event{events.length !== 1 ? "s" : ""}</Badge>
          <div className="flex border rounded-md overflow-hidden">
            <button className={`px-3 py-1 text-xs ${viewMode === "list" ? "bg-primary text-primary-foreground" : "bg-background"}`} onClick={() => setViewMode("list")}>List</button>
            <button className={`px-3 py-1 text-xs ${viewMode === "month" ? "bg-primary text-primary-foreground" : "bg-background"}`} onClick={() => setViewMode("month")}>Month</button>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {viewMode === "month" && (
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={navigatePrev}><ArrowLeft className="h-4 w-4" /></Button>
              <span className="text-sm font-medium min-w-[120px] text-center">
                {currentDate.toLocaleDateString("en-AU", { month: "long", year: "numeric" })}
              </span>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={navigateNext}><ArrowLeft className="h-4 w-4 rotate-180" /></Button>
            </div>
          )}
          <Button size="sm" onClick={() => setShowCreate(true)}>
            <Plus className="h-4 w-4 mr-1" /> Add Event
          </Button>
        </div>
      </div>

      {eventsQuery.isLoading ? (
        <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : viewMode === "list" ? (
        /* List view */
        <div className="space-y-4">
          {groupedEvents.length === 0 && (
            <Card><CardContent className="p-8 text-center text-muted-foreground">No scheduled events for this job yet</CardContent></Card>
          )}
          {groupedEvents.map(([dateLabel, dayEvents]) => (
            <div key={dateLabel}>
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">{dateLabel}</h4>
              <div className="space-y-2">
                {dayEvents.map((ev: any) => {
                  const typeConf = EVENT_TYPE_CONFIG[ev.eventType] || EVENT_TYPE_CONFIG.other;
                  const TypeIcon = typeConf.icon;
                  return (
                    <Card key={ev.id} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setSelectedEvent(ev)}>
                      <CardContent className="p-3 flex items-center gap-3">
                        <div className={`rounded-md p-2 ${typeConf.color}`}><TypeIcon className="h-4 w-4" /></div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm truncate">{ev.title}</p>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                            <span>{new Date(ev.startTime).toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit" })}</span>
                            {ev.endTime && <span>– {new Date(ev.endTime).toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit" })}</span>}
                            {ev.installerName && <span className="flex items-center gap-0.5"><User className="h-3 w-3" /> {ev.installerName}</span>}
                          </div>
                        </div>
                        <Badge variant="outline" className={`text-[10px] ${SCHEDULE_STATUS_COLORS[ev.status] || ""}`}>{ev.status}</Badge>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* Month view with drag-to-reschedule */
        <DndScheduleMonthView
          calendarDays={calendarDays}
          onEventClick={(ev: any) => setSelectedEvent(ev)}
          onReschedule={(eventId: number, newDate: string) => {
            const ev = events.find((e: any) => e.id === eventId);
            if (!ev) return;
            // Preserve the time, just change the date
            const oldStart = new Date(ev.startTime);
            const [year, month, day] = newDate.split("-").map(Number);
            oldStart.setFullYear(year, month - 1, day);
            const updateData: any = { id: eventId, startTime: oldStart.toISOString() };
            if (ev.endTime) {
              const oldEnd = new Date(ev.endTime);
              const diff = new Date(ev.startTime).getTime() - oldEnd.getTime();
              const newEnd = new Date(oldStart.getTime() - diff);
              updateData.endTime = newEnd.toISOString();
            }
            updateEvent.mutate(updateData);
          }}
        />
      )}

      {/* Create Event Dialog */}
      {showCreate && (
        <ScheduleEventDialog
          mode="create"
          jobId={jobId}
          installers={installersQuery.data || []}
          onClose={() => setShowCreate(false)}
          onSave={(data) => createEvent.mutate(data)}
          isPending={createEvent.isPending}
        />
      )}

      {/* Edit Event Dialog */}
      {selectedEvent && (
        <ScheduleEventDialog
          mode="edit"
          jobId={jobId}
          event={selectedEvent}
          installers={installersQuery.data || []}
          onClose={() => setSelectedEvent(null)}
          onSave={(data) => updateEvent.mutate({ id: selectedEvent.id, ...data })}
          onDelete={() => deleteEvent.mutate({ id: selectedEvent.id })}
          isPending={updateEvent.isPending}
        />
      )}
    </div>
  );
}

// ─── DnD Schedule Month View ─────────────────────────────────────────────────
function DndScheduleMonthView({ calendarDays, onEventClick, onReschedule }: {
  calendarDays: { date: Date; events: any[]; isCurrentMonth: boolean }[];
  onEventClick: (ev: any) => void;
  onReschedule: (eventId: number, newDate: string) => void;
}) {
  const [activeId, setActiveId] = useState<number | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  const activeEvent = activeId ? calendarDays.flatMap(d => d.events).find((e: any) => e.id === activeId) : null;

  function handleDragStart(event: DragStartEvent) {
    setActiveId(event.active.id as number);
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveId(null);
    const { active, over } = event;
    if (!over) return;
    const eventId = active.id as number;
    const targetDate = over.id as string; // ISO date string like "2026-05-21"
    // Find the event's current date
    const currentEvent = calendarDays.flatMap(d => d.events).find((e: any) => e.id === eventId);
    if (!currentEvent) return;
    const currentDate = new Date(currentEvent.startTime).toISOString().slice(0, 10);
    if (currentDate !== targetDate) {
      onReschedule(eventId, targetDate);
    }
  }

  return (
    <Card>
      <CardContent className="p-2">
        <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
          <div className="grid grid-cols-7 gap-px">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(d => (
              <div key={d} className="text-center text-[10px] font-semibold text-muted-foreground py-1">{d}</div>
            ))}
            {calendarDays.map((day, i) => (
              <DroppableCalendarDay key={i} day={day} onEventClick={onEventClick} activeId={activeId} />
            ))}
          </div>
          <DragOverlay>
            {activeEvent ? (
              <div className={`text-[9px] px-1 py-0.5 rounded truncate shadow-lg opacity-90 ${(EVENT_TYPE_CONFIG[activeEvent.eventType as keyof typeof EVENT_TYPE_CONFIG] || EVENT_TYPE_CONFIG.other).color}`}>
                {activeEvent.title}
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      </CardContent>
    </Card>
  );
}

function DroppableCalendarDay({ day, onEventClick, activeId }: {
  day: { date: Date; events: any[]; isCurrentMonth: boolean };
  onEventClick: (ev: any) => void;
  activeId: number | null;
}) {
  const dateStr = day.date.toISOString().slice(0, 10);
  const { setNodeRef, isOver } = useDroppable({ id: dateStr });
  const isToday = day.date.toDateString() === new Date().toDateString();

  return (
    <div
      ref={setNodeRef}
      className={`min-h-[60px] p-1 border rounded-sm transition-colors ${
        day.isCurrentMonth ? "bg-background" : "bg-muted/30"
      } ${isToday ? "ring-1 ring-primary" : ""} ${
        isOver ? "bg-primary/10 ring-1 ring-primary/50" : ""
      }`}
    >
      <span className={`text-[10px] ${isToday ? "font-bold text-primary" : "text-muted-foreground"}`}>{day.date.getDate()}</span>
      <div className="space-y-0.5 mt-0.5">
        {day.events.slice(0, 2).map((ev: any) => (
          <DraggableCalendarEvent key={ev.id} event={ev} onEventClick={onEventClick} />
        ))}
        {day.events.length > 2 && <span className="text-[9px] text-muted-foreground">+{day.events.length - 2} more</span>}
      </div>
    </div>
  );
}

function DraggableCalendarEvent({ event, onEventClick }: { event: any; onEventClick: (ev: any) => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useSortable({ id: event.id });
  const typeConf = EVENT_TYPE_CONFIG[event.eventType as keyof typeof EVENT_TYPE_CONFIG] || EVENT_TYPE_CONFIG.other;
  const style = transform ? { transform: `translate(${transform.x}px, ${transform.y}px)`, opacity: isDragging ? 0.5 : 1 } : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`text-[9px] px-1 py-0.5 rounded truncate cursor-grab active:cursor-grabbing ${typeConf.color} ${isDragging ? "shadow-md ring-1 ring-primary" : ""}`}
      onClick={(e) => { e.stopPropagation(); onEventClick(event); }}
    >
      {event.title}
    </div>
  );
}

// ─── Schedule Event Dialog (create/edit) ─────────────────────────────────────
function ScheduleEventDialog({ mode, jobId, event, installers, onClose, onSave, onDelete, isPending }: {
  mode: "create" | "edit";
  jobId: number;
  event?: any;
  installers: any[];
  onClose: () => void;
  onSave: (data: any) => void;
  onDelete?: () => void;
  isPending: boolean;
}) {
  const [title, setTitle] = useState(event?.title || "");
  const [eventType, setEventType] = useState(event?.eventType || "installation");
  const [startDate, setStartDate] = useState(event ? new Date(event.startTime).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10));
  const [startTime, setStartTime] = useState(event ? new Date(event.startTime).toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit", hour12: false }) : "08:00");
  const [endTime, setEndTime] = useState(event?.endTime ? new Date(event.endTime).toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit", hour12: false }) : "16:00");
  const [assignedInstallerId, setAssignedInstallerId] = useState(event?.assignedInstallerId?.toString() || "");
  const [status, setStatus] = useState(event?.status || "scheduled");
  const [notes, setNotes] = useState(event?.notes || "");

  const handleSubmit = () => {
    if (!title.trim()) return;
    const startDateTime = new Date(`${startDate}T${startTime}`);
    const endDateTime = endTime ? new Date(`${startDate}T${endTime}`) : undefined;
    const data: any = {
      title: title.trim(),
      eventType,
      startTime: startDateTime.toISOString(),
      endTime: endDateTime?.toISOString(),
      assignedInstallerId: assignedInstallerId ? Number(assignedInstallerId) : undefined,
      notes: notes.trim() || undefined,
    };
    if (mode === "create") data.jobId = jobId;
    if (mode === "edit") data.status = status;
    onSave(data);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-background rounded-lg shadow-xl p-6 w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <h3 className="text-lg font-semibold mb-4">{mode === "create" ? "New Schedule Event" : "Edit Event"}</h3>
        <div className="space-y-3">
          <div>
            <Label className="text-sm">Title</Label>
            <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Event title..." autoFocus />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-sm">Type</Label>
              <select className="w-full border rounded-md px-3 py-2 text-sm bg-background" value={eventType} onChange={e => setEventType(e.target.value)}>
                <option value="installation">Installation</option>
                <option value="inspection">Inspection</option>
                <option value="meeting">Meeting</option>
                <option value="delivery">Delivery</option>
                <option value="other">Other</option>
              </select>
            </div>
            {mode === "edit" && (
              <div>
                <Label className="text-sm">Status</Label>
                <select className="w-full border rounded-md px-3 py-2 text-sm bg-background" value={status} onChange={e => setStatus(e.target.value)}>
                  <option value="scheduled">Scheduled</option>
                  <option value="confirmed">Confirmed</option>
                  <option value="completed">Completed</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </div>
            )}
          </div>
          <div>
            <Label className="text-sm">Date</Label>
            <div className="flex gap-1 items-center">
              <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="flex-1" />
              {startDate && <Button type="button" variant="ghost" size="sm" className="h-8 px-2 text-muted-foreground hover:text-destructive" onClick={() => setStartDate("")} title="Clear date">&times;</Button>}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-sm">Start Time</Label>
              <Input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} />
            </div>
            <div>
              <Label className="text-sm">End Time</Label>
              <Input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} />
            </div>
          </div>
          <div>
            <Label className="text-sm">Assigned Installer</Label>
            <select className="w-full border rounded-md px-3 py-2 text-sm bg-background" value={assignedInstallerId} onChange={e => setAssignedInstallerId(e.target.value)}>
              <option value="">Unassigned</option>
              {installers.map((inst: any) => <option key={inst.id} value={inst.id}>{inst.name}</option>)}
            </select>
          </div>
          <div>
            <Label className="text-sm">Notes</Label>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} placeholder="Additional notes..." />
          </div>
        </div>
        <div className="flex items-center justify-between mt-4">
          {mode === "edit" && onDelete ? (
            <Button variant="destructive" size="sm" onClick={onDelete}><Trash2 className="h-4 w-4 mr-1" /> Delete</Button>
          ) : <div />}
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={!title.trim() || isPending}>
              {mode === "create" ? "Create" : "Save"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}


// ─── Check Measure Tab ──────────────────────────────────────────────────────
function CheckMeasureTab({ jobId, quoteId }: { jobId: number; quoteId?: number | null }) {
  const [, navigate] = useLocation();
  const { data: workbook, isLoading } = trpc.construction.checkMeasure.getByJob.useQuery(
    { jobId },
    { enabled: !!jobId }
  );

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
          <p className="text-sm text-muted-foreground mt-2">Loading check measure...</p>
        </CardContent>
      </Card>
    );
  }

  if (!workbook) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Clipboard className="h-10 w-10 mx-auto mb-3 text-muted-foreground opacity-40" />
          <p className="text-muted-foreground font-medium">No Check Measure Workbook</p>
          <p className="text-xs text-muted-foreground mt-1">
            A check measure workbook is automatically created when the job is created from a quote.
          </p>
          <Button
            variant="outline"
            size="sm"
            className="mt-4 gap-1.5"
            onClick={() => navigate(`/construction/jobs/${jobId}/check-measure`)}
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Open Check Measure Page
          </Button>
        </CardContent>
      </Card>
    );
  }

  const STATUS_LABELS: Record<string, { label: string; color: string }> = {
    pending_review: { label: "Pending Review", color: "bg-yellow-100 text-yellow-800" },
    in_review: { label: "In Review", color: "bg-blue-100 text-blue-800" },
    reviewed: { label: "Reviewed", color: "bg-green-100 text-green-800" },
    approved: { label: "Approved", color: "bg-emerald-100 text-emerald-800" },
    variance_found: { label: "Variance Found", color: "bg-red-100 text-red-800" },
  };

  const statusInfo = STATUS_LABELS[workbook.status] || STATUS_LABELS.pending_review;
  const specData = workbook.specData as Record<string, any> | null;

  return (
    <div className="space-y-4">
      {/* Header with status and link */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <Clipboard className="h-5 w-5 text-teal-700" />
              <div>
                <h3 className="font-semibold text-base">{workbook.title}</h3>
                <p className="text-xs text-muted-foreground">
                  Original Quote: {workbook.originalQuoteNumber || "N/A"}
                  {workbook.checkedByName && ` • Checked by: ${workbook.checkedByName}`}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge className={statusInfo.color}>{statusInfo.label}</Badge>
              <Button
                variant="default"
                size="sm"
                className="gap-1.5"
                onClick={() => navigate(`/construction/jobs/${jobId}/check-measure`)}
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Open Full Workbook
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Spec Data Summary (duplicated from quote) */}
      {specData && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Spec Sheet Summary (from Original Quote)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {Object.entries(specData)
                .filter(([key, value]) => {
                  if (key === "descriptionOfWork") return false;
                  if (value === null || value === undefined || value === "") return false;
                  if (typeof value === "object") return false;
                  return true;
                })
                .slice(0, 20)
                .map(([key, value]) => {
                  const label = key.replace("spec", "").replace(/([A-Z])/g, " $1").trim();
                  return (
                    <div key={key} className="border rounded-md p-2">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</p>
                      <p className="text-sm font-medium mt-0.5 truncate">{String(value)}</p>
                    </div>
                  );
                })}
            </div>
            {specData.descriptionOfWork && (
              <div className="mt-3 border rounded-md p-3">
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Description of Work</p>
                <p className="text-sm mt-1 whitespace-pre-wrap line-clamp-4">{specData.descriptionOfWork}</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Variance Notes */}
      {workbook.varianceNotes && (
        <Card className="border-amber-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2 text-amber-800">
              <AlertTriangle className="h-4 w-4" />
              Variance Notes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm whitespace-pre-wrap">{workbook.varianceNotes}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── Site Plan Tab ──────────────────────────────────────────────────────────
function SitePlanTab({ jobId, quoteId }: { jobId: number; quoteId?: number | null }) {
  const { data: quote, isLoading } = trpc.quotes.get.useQuery(
    { id: quoteId! },
    { enabled: !!quoteId }
  );
  const [parcelData, setParcelData] = useState<any>(null);
  const [sitePlanExpanded, setSitePlanExpanded] = useState(false);

  useEffect(() => {
    if (quote && (quote as any).parcelDataJson && !parcelData) {
      try {
        const cached = typeof (quote as any).parcelDataJson === 'string'
          ? JSON.parse((quote as any).parcelDataJson)
          : (quote as any).parcelDataJson;
        setParcelData(cached);
      } catch { /* ignore */ }
    }
  }, [quote]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!quoteId) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Ruler className="h-10 w-10 mx-auto mb-3 text-muted-foreground opacity-40" />
          <p className="text-muted-foreground font-medium">No Linked Quote</p>
          <p className="text-xs text-muted-foreground mt-1">
            Site plan data comes from the linked quote's spec sheet. This job has no linked quote.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
          <p className="text-sm text-muted-foreground mt-2">Loading site plan data...</p>
        </CardContent>
      </Card>
    );
  }

  if (!quote) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Ruler className="h-10 w-10 mx-auto mb-3 text-muted-foreground opacity-40" />
          <p className="text-muted-foreground">Could not load quote data</p>
        </CardContent>
      </Card>
    );
  }

  const q = quote as any;
  const structureWidthMm = q.specWidth ? parseFloat(q.specWidth) * 1000 : undefined;
  const structureLengthMm = q.specLength ? parseFloat(q.specLength) * 1000 : undefined;
  const structureOffsetX = q.specStructurePosX ? parseFloat(q.specStructurePosX) : 0;
  const structureOffsetY = q.specStructurePosY ? parseFloat(q.specStructurePosY) : 0;
  const structureRotation = q.specStructureRotation ? parseFloat(q.specStructureRotation) : 0;
  const houseWalls = q.specHouseWalls ? q.specHouseWalls.split(",").filter(Boolean) : [];
  const setbackColor = q.specSetbackColor || "#FF6B35";

  const hasParcelData = !!parcelData;
  const hasDimensions = !!(structureWidthMm && structureLengthMm);

  if (!hasParcelData && !hasDimensions) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Ruler className="h-10 w-10 mx-auto mb-3 text-muted-foreground opacity-40" />
          <p className="text-muted-foreground font-medium">No Site Plan Data</p>
          <p className="text-xs text-muted-foreground mt-1">
            The linked quote does not have site plan or boundary data configured yet.
            Add dimensions and fetch site data in the quote's spec sheet to see the site plan here.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Info banner */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <Ruler className="h-5 w-5 text-blue-600" />
              <div>
                <h3 className="font-semibold text-base">Site Measurement Plan</h3>
                <p className="text-xs text-muted-foreground">
                  {q.siteAddress || "No address"} 
                  {parcelData?.lotId && ` • Lot: ${parcelData.lotId}`}
                  {parcelData?.areaSqm && ` • ${parcelData.areaSqm.toFixed(0)} m²`}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              {structureWidthMm && structureLengthMm && (
                <Badge variant="outline" className="text-xs">
                  Structure: {(structureWidthMm / 1000).toFixed(1)}m × {(structureLengthMm / 1000).toFixed(1)}m
                </Badge>
              )}
              {parcelData?.source && (
                <Badge variant="outline" className="text-xs">
                  Source: {parcelData.source === "actmapi" ? "ACTmapi" : "NSW Cadastre"}
                </Badge>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Fullscreen overlay */}
      {sitePlanExpanded && (
        <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm flex flex-col p-4 overflow-auto">
          <SitePlanDiagram
            boundaryCoords={parcelData?.coordinates}
            propertyFrontageM={parcelData?.dimensions?.frontageM}
            propertyDepthM={parcelData?.dimensions?.depthM}
            propertyAreaSqm={parcelData?.areaSqm}
            structureWidthMm={structureWidthMm}
            structureLengthMm={structureLengthMm}
            setbackFrontMm={q.specSetbackFront ? parseFloat(q.specSetbackFront) : undefined}
            setbackRearMm={q.specSetbackRear ? parseFloat(q.specSetbackRear) : undefined}
            setbackLeftMm={q.specSetbackLeft ? parseFloat(q.specSetbackLeft) : undefined}
            setbackRightMm={q.specSetbackRight ? parseFloat(q.specSetbackRight) : undefined}
            houseWalls={houseWalls}
            lotId={parcelData?.lotId}
            suburb={parcelData?.suburb}
            centroid={parcelData?.centroid}
            structureOffsetX={structureOffsetX}
            structureOffsetY={structureOffsetY}
            structureRotation={structureRotation}
            draggable={false}
            setbackColor={setbackColor}
            expanded={true}
            onToggleExpand={() => setSitePlanExpanded(false)}
          />
        </div>
      )}

      {/* Site Plan Diagram */}
      <Card>
        <CardContent className="p-4">
          <SitePlanDiagram
            boundaryCoords={parcelData?.coordinates}
            propertyFrontageM={parcelData?.dimensions?.frontageM}
            propertyDepthM={parcelData?.dimensions?.depthM}
            propertyAreaSqm={parcelData?.areaSqm}
            structureWidthMm={structureWidthMm}
            structureLengthMm={structureLengthMm}
            setbackFrontMm={q.specSetbackFront ? parseFloat(q.specSetbackFront) : undefined}
            setbackRearMm={q.specSetbackRear ? parseFloat(q.specSetbackRear) : undefined}
            setbackLeftMm={q.specSetbackLeft ? parseFloat(q.specSetbackLeft) : undefined}
            setbackRightMm={q.specSetbackRight ? parseFloat(q.specSetbackRight) : undefined}
            houseWalls={houseWalls}
            lotId={parcelData?.lotId}
            suburb={parcelData?.suburb}
            centroid={parcelData?.centroid}
            structureOffsetX={structureOffsetX}
            structureOffsetY={structureOffsetY}
            structureRotation={structureRotation}
            draggable={false}
            setbackColor={setbackColor}
            onToggleExpand={() => setSitePlanExpanded(true)}
          />
        </CardContent>
      </Card>

      {/* A3 Print-Ready Site Plan */}
      <SitePlanPrintPage
        boundaryCoords={parcelData?.coordinates}
        propertyFrontageM={parcelData?.dimensions?.frontageM || 20}
        propertyDepthM={parcelData?.dimensions?.depthM || 30}
        propertyAreaSqm={parcelData?.areaSqm}
        structureWidthMm={structureWidthMm}
        structureLengthMm={structureLengthMm}
        setbackFrontMm={q.specSetbackFront ? parseFloat(q.specSetbackFront) : undefined}
        setbackLeftMm={q.specSetbackLeft ? parseFloat(q.specSetbackLeft) : undefined}
        setbackRearMm={q.specSetbackRear ? parseFloat(q.specSetbackRear) : undefined}
        setbackRightMm={q.specSetbackRight ? parseFloat(q.specSetbackRight) : undefined}
        houseWalls={houseWalls}
        lotId={parcelData?.lotId}
        suburb={parcelData?.suburb}
        structureOffsetX={structureOffsetX}
        structureOffsetY={structureOffsetY}
        structureRotation={structureRotation}
        clientName={q.specClientName || q.clientName || ""}
        siteAddress={q.siteAddress || ""}
        quoteNumber={q.quoteNumber || ""}
        designAdviser={q.specDesignAdviser || ""}
        roofType={q.specRoofType || ""}
        setbackColor={setbackColor}
        postPositions={q.specPostPositions ? q.specPostPositions.split(",").filter(Boolean) : []}
        centroid={parcelData?.centroid}
        satelliteImageUrl={q.satelliteImageUrl || undefined}
      />

      {/* Setback Summary */}
      {(q.specSetbackFront || q.specSetbackRear || q.specSetbackLeft || q.specSetbackRight) && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Setbacks</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {q.specSetbackFront && (
                <div className="border rounded-md p-2 text-center">
                  <p className="text-[10px] text-muted-foreground uppercase">Front</p>
                  <p className="text-sm font-medium">{q.specSetbackFront} mm</p>
                </div>
              )}
              {q.specSetbackRear && (
                <div className="border rounded-md p-2 text-center">
                  <p className="text-[10px] text-muted-foreground uppercase">Rear</p>
                  <p className="text-sm font-medium">{q.specSetbackRear} mm</p>
                </div>
              )}
              {q.specSetbackLeft && (
                <div className="border rounded-md p-2 text-center">
                  <p className="text-[10px] text-muted-foreground uppercase">Left</p>
                  <p className="text-sm font-medium">{q.specSetbackLeft} mm</p>
                </div>
              )}
              {q.specSetbackRight && (
                <div className="border rounded-md p-2 text-center">
                  <p className="text-[10px] text-muted-foreground uppercase">Right</p>
                  <p className="text-sm font-medium">{q.specSetbackRight} mm</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}


// ─── Approvals Section (moved from CrmLeadDetail) ────────────────────────
function BuildingAuthoritySection({ leadId, clientEmail, clientName }: { leadId: number; clientEmail: string; clientName: string }) {
  const { data } = trpc.crm.buildingAuthority.get.useQuery({ leadId });
  const utils = trpc.useUtils();
  const [form, setForm] = useState({ councilName: "", applicationDate: "", approvalDate: "", approvalNumber: "", status: "", councilLetterType: "", councilLetterSentDate: "", notes: "" });
  const [sendingLetter, setSendingLetter] = useState<string | null>(null);
  const sendLetterMut = trpc.crm.sendLetter.useMutation();
  const { buildingAuthorityStatuses } = useBuildingAuthorityOptions();
  const { councilLetterTypes } = useCouncilLetterTypeOptions();
  const FALLBACK_BA_STATUSES = [{ value: "pending", label: "Pending" }, { value: "submitted", label: "Submitted" }, { value: "approved", label: "Approved" }, { value: "rejected", label: "Rejected" }, { value: "exempt", label: "Exempt" }];
  const FALLBACK_LETTER_TYPES = [{ value: "initial", label: "Initial Letter" }, { value: "follow_up", label: "Follow Up" }, { value: "approval", label: "Approval Letter" }];
  const baStatusOpts = buildingAuthorityStatuses.length > 0 ? buildingAuthorityStatuses : FALLBACK_BA_STATUSES;
  const letterTypeOpts = councilLetterTypes.length > 0 ? councilLetterTypes : FALLBACK_LETTER_TYPES;

  useEffect(() => {
    if (data) {
      setForm({
        councilName: data.councilName || "", applicationDate: data.applicationDate || "",
        approvalDate: data.approvalDate || "", approvalNumber: data.approvalNumber || "",
        status: data.status || "", councilLetterType: data.councilLetterType || "",
        councilLetterSentDate: data.councilLetterSentDate || "", notes: data.notes || "",
      });
    }
  }, [data]);

  const upsertMut = trpc.crm.buildingAuthority.upsert.useMutation({
    onSuccess: () => { toast.success("Saved"); utils.crm.buildingAuthority.get.invalidate({ leadId }); }
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Building className="h-5 w-5" />
          Approvals
          <BaStatusBadge status={data?.status} />
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div><label className="text-xs font-medium">Local Council</label>
            <CouncilSelect value={form.councilName} onChange={(v) => setForm(f => ({ ...f, councilName: v }))} />
          </div>
          <div><label className="text-xs font-medium">Status</label>
            <Select value={form.status} onValueChange={(v) => setForm(f => ({ ...f, status: v }))}>
              <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
              <SelectContent>
                {baStatusOpts.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="text-xs font-medium">Application Date</label>
            <div className="flex gap-1 items-center">
              <Input type="date" value={form.applicationDate} onChange={(e) => setForm(f => ({ ...f, applicationDate: e.target.value }))} className="flex-1" />
              {form.applicationDate && <Button type="button" variant="ghost" size="sm" className="h-8 px-2 text-muted-foreground hover:text-destructive" onClick={() => setForm(f => ({ ...f, applicationDate: "" }))} title="Clear date">&times;</Button>}
            </div>
          </div>
          <div><label className="text-xs font-medium">Approval Date</label>
            <div className="flex gap-1 items-center">
              <Input type="date" value={form.approvalDate} onChange={(e) => setForm(f => ({ ...f, approvalDate: e.target.value }))} className="flex-1" />
              {form.approvalDate && <Button type="button" variant="ghost" size="sm" className="h-8 px-2 text-muted-foreground hover:text-destructive" onClick={() => setForm(f => ({ ...f, approvalDate: "" }))} title="Clear date">&times;</Button>}
            </div>
          </div>
        </div>
        <div><label className="text-xs font-medium">Approval Number</label><Input value={form.approvalNumber} onChange={(e) => setForm(f => ({ ...f, approvalNumber: e.target.value }))} /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="text-xs font-medium">Council Letter Type</label>
            <Select value={form.councilLetterType} onValueChange={(v) => setForm(f => ({ ...f, councilLetterType: v }))}>
              <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
              <SelectContent>
                {letterTypeOpts.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div><label className="text-xs font-medium">Letter Sent Date</label>
            <div className="flex gap-1 items-center">
              <Input type="date" value={form.councilLetterSentDate} onChange={(e) => setForm(f => ({ ...f, councilLetterSentDate: e.target.value }))} className="flex-1" />
              {form.councilLetterSentDate && <Button type="button" variant="ghost" size="sm" className="h-8 px-2 text-muted-foreground hover:text-destructive" onClick={() => setForm(f => ({ ...f, councilLetterSentDate: "" }))} title="Clear date">&times;</Button>}
            </div>
          </div>
        </div>
        <div><label className="text-xs font-medium">Notes</label><Textarea value={form.notes} onChange={(e) => setForm(f => ({ ...f, notes: e.target.value }))} rows={3} /></div>
        {form.approvalDate && form.applicationDate && form.approvalDate < form.applicationDate && (
          <p className="text-xs text-destructive">Approval Date cannot be before Application Date</p>
        )}
        <div className="flex gap-2 items-center">
          <Button onClick={() => {
            if (form.approvalDate && form.applicationDate && form.approvalDate < form.applicationDate) {
              toast.error("Approval Date cannot be before Application Date");
              return;
            }
            upsertMut.mutate({ leadId, ...form });
          }} disabled={upsertMut.isPending}><Save className="h-4 w-4 mr-1" /> Save</Button>
          <Button type="button" variant="outline" size="sm" className="text-xs" onClick={() => {
            const exemptForm = { ...form, status: "exempt", applicationDate: "", approvalDate: "", approvalNumber: "", councilLetterType: "", councilLetterSentDate: "" };
            setForm(exemptForm);
            upsertMut.mutate({ leadId, ...exemptForm });
          }} disabled={upsertMut.isPending}>Not Required / Exempt</Button>
        </div>

        {/* Council Letter Actions */}
        <div className="pt-3 border-t mt-3">
          <label className="text-xs font-medium mb-2 block">Send Council Letter</label>
          <div className="flex flex-wrap gap-2">
            {([
              { type: "council_intro" as const, label: "Intro Council Letter" },
              { type: "council_out_of" as const, label: "Out Of Council Letter" },
              { type: "council_no_council" as const, label: "No Council Letter" },
            ]).map(({ type, label }) => (
              <Button
                key={type}
                variant="outline"
                size="sm"
                disabled={!clientEmail || sendingLetter === type}
                onClick={async () => {
                  if (!clientEmail) { toast.error("No email address on client"); return; }
                  setSendingLetter(type);
                  try {
                    const res = await sendLetterMut.mutateAsync({
                      leadId, letterType: type, to: clientEmail, clientName,
                    });
                    if (res.success) {
                      toast.success(`${label} sent to ${clientEmail}`);
                      setForm(f => ({ ...f, councilLetterType: type, councilLetterSentDate: new Date().toISOString().split("T")[0] }));
                    } else {
                      toast.error(res.error || "Failed to send");
                    }
                  } catch (e: any) {
                    toast.error(e.message || "Error sending letter");
                  } finally {
                    setSendingLetter(null);
                  }
                }}
              >
                <Mail className="h-4 w-4 mr-1" /> {label}
              </Button>
            ))}
          </div>
          {!clientEmail && <p className="text-xs text-muted-foreground mt-1">Add an email address to the client to enable sending.</p>}
        </div>
        <LeadSectionNotes leadId={leadId} section="building_authority" />
      </CardContent>
    </Card>
  );
}

// ─── Approvals Status Badge (colour-coded) ─────────────────────────────────────────
function BaStatusBadge({ status }: { status?: string | null }) {
  if (!status) return null;
  const s = status.toLowerCase();
  let label = "";
  let colorClass = "";

  if (s === "approved" || s === "approved with conditions") {
    label = "Approved"; colorClass = "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400";
  } else if (s === "pending") {
    label = "Pending"; colorClass = "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400";
  } else if (s === "rejected" || s === "refused") {
    label = "Rejected"; colorClass = "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400";
  } else if (s === "exempt" || s === "not required") {
    label = "Exempt"; colorClass = "bg-gray-100 text-gray-600 dark:bg-gray-800/50 dark:text-gray-400";
  } else if (s === "lodged" || s === "submitted") {
    label = "Lodged"; colorClass = "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400";
  } else {
    return null;
  }

  return (
    <Badge className={`${colorClass} ml-2`} variant="secondary">
      <span className="w-1.5 h-1.5 rounded-full mr-1 bg-current" />
      {label}
    </Badge>
  );
}

// ─── Approvals Read-Only Activity View ──────────────────────────────────────
function BuildingAuthorityReadOnly({ leadId }: { leadId: number }) {
  const { data } = trpc.crm.buildingAuthority.get.useQuery({ leadId });
  const [, navigate] = useLocation();

  if (!data) return <Card><CardContent className="p-6 text-center text-muted-foreground">Loading approvals data...</CardContent></Card>;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Building className="h-5 w-5" />
          Approvals Activity
          <BaStatusBadge status={data?.status} />
          <Button variant="outline" size="sm" className="ml-auto" onClick={() => navigate("/construction/ba-calendar")}>
            Manage in Approvals →
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Local Council</label>
            <p className="text-sm font-medium">{data.councilName || "—"}</p>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Status</label>
            <p className="text-sm font-medium capitalize">{data.status || "—"}</p>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Application Date</label>
            <p className="text-sm font-medium">{data.applicationDate || "—"}</p>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Approval Date</label>
            <p className="text-sm font-medium">{data.approvalDate || "—"}</p>
          </div>
        </div>
        {data.approvalNumber && (
          <div>
            <label className="text-xs font-medium text-muted-foreground">Approval Number</label>
            <p className="text-sm font-medium">{data.approvalNumber}</p>
          </div>
        )}
        {data.councilLetterType && (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Letter Type</label>
              <p className="text-sm font-medium capitalize">{data.councilLetterType.replace(/_/g, " ")}</p>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Letter Sent</label>
              <p className="text-sm font-medium">{data.councilLetterSentDate || "—"}</p>
            </div>
          </div>
        )}
        {data.notes && (
          <div>
            <label className="text-xs font-medium text-muted-foreground">Notes</label>
            <p className="text-sm text-muted-foreground">{data.notes}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
