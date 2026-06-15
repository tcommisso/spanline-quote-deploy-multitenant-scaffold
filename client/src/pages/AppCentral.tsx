import { useAuth } from "@/_core/hooks/useAuth";
import { useLocation } from "wouter";
import { isAdminRole, hasPermission, type UserRole } from "@shared/const";
import { trpc } from "@/lib/trpc";
import { useState, useMemo, useCallback, useEffect } from "react";
import {
  Contact,
  LayoutDashboard,
  HardHat,
  Factory,
  Warehouse,
  Shield,
  Settings2,
  TrendingUp,
  AlertTriangle,
  Users,
  Package,
  Clock,
  FileText,
  Eye,
  EyeOff,
  GripVertical,
  CheckSquare,
  Check,
  DollarSign,
  Wallet,
  BarChart3,
  ClipboardCheck,
  ClipboardList,
  Inbox,
  MapPin,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { OnboardingTour, isTourCompleted, TourHelpButton, type TourStep } from "@/components/OnboardingTour";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";

// ─── Section definitions ────────────────────────────────────────────────────
export type AppSection = {
  id: string;
  label: string;
  description: string;
  icon: LucideIcon;
  path: string; // default landing path for this section
  color: string; // accent color class (module accent)
  bgColor: string; // background color class
  accentHex: string; // raw hex for accent stripe/icon bg
  allowedRoles: UserRole[] | "all"; // which roles can see this section
};

// Tier 1 modules use Brand Gold accent, Tier 2 keep their own softer accent
const TIER1_IDS = new Set(["inbox", "crm", "sales", "construction"]);

export const APP_SECTIONS: AppSection[] = [
  {
    id: "inbox",
    label: "Inbox",
    description: "Messages & notifications",
    icon: Inbox,
    path: "/inbox",
    color: "text-[#C9AB57]",
    bgColor: "bg-white border-[#E5E7EB]",
    accentHex: "#C9AB57",
    allowedRoles: "all",
  },
  {
    id: "crm",
    label: "CRM",
    description: "Leads, clients & pipeline",
    icon: Contact,
    path: "/crm/leads",
    color: "text-[#3B5EA7]",
    bgColor: "bg-white border-[#E5E7EB]",
    accentHex: "#3B5EA7",
    allowedRoles: ["super_admin", "admin", "design_adviser", "office_user"],
  },
  {
    id: "sales",
    label: "Sales",
    description: "Quotes, proposals & analytics",
    icon: LayoutDashboard,
    path: "/sales",
    color: "text-[#22994A]",
    bgColor: "bg-white border-[#E5E7EB]",
    accentHex: "#22994A",
    allowedRoles: ["super_admin", "admin", "design_adviser", "office_user", "construction_user"],
  },
  {
    id: "construction",
    label: "Build",
    description: "Clients, jobs & tracking",
    icon: HardHat,
    path: "/construction/clients",
    color: "text-[#C97812]",
    bgColor: "bg-white border-[#E5E7EB]",
    accentHex: "#C97812",
    allowedRoles: ["super_admin", "admin", "office_user", "construction_user"],
  },
  {
    id: "proposals",
    label: "Proposals",
    description: "Documents, sign-off & contracts",
    icon: FileText,
    path: "/proposals",
    color: "text-[#0E7490]",
    bgColor: "bg-white border-[#E5E7EB]",
    accentHex: "#0E7490",
    allowedRoles: ["super_admin", "admin", "design_adviser", "office_user"],
  },
  {
    id: "manufacturing",
    label: "Manufacturing",
    description: "Orders, dispatch & drivers",
    icon: Factory,
    path: "/manufacturing",
    color: "text-[#6D33CC]",
    bgColor: "bg-white border-[#E5E7EB]",
    accentHex: "#6D33CC",
    allowedRoles: ["super_admin", "admin", "office_user", "construction_user", "warehouse"],
  },
  {
    id: "inventory",
    label: "Inventory",
    description: "Stock, procurement & suppliers",
    icon: Warehouse,
    path: "/inventory/dashboard",
    color: "text-[#CC5A10]",
    bgColor: "bg-white border-[#E5E7EB]",
    accentHex: "#CC5A10",
    allowedRoles: ["super_admin", "admin", "office_user", "warehouse"],
  },
  {
    id: "approvals",
    label: "Approvals",
    description: "Building approvals & workflow",
    icon: ClipboardCheck,
    path: "/approvals",
    color: "text-[#0A7A9E]",
    bgColor: "bg-white border-[#E5E7EB]",
    accentHex: "#0A7A9E",
    allowedRoles: ["super_admin", "admin", "office_user", "construction_user"],
  },
  {
    id: "da_tracker",
    label: "DA Tracker",
    description: "Development applications & map",
    icon: MapPin,
    path: "/da-tracker",
    color: "text-[#0A72A8]",
    bgColor: "bg-white border-[#E5E7EB]",
    accentHex: "#0A72A8",
    allowedRoles: ["super_admin", "admin", "office_user", "design_adviser"],
  },
  {
    id: "finance",
    label: "Finance",
    description: "Commissions, invoices & costs",
    icon: Wallet,
    path: "/admin/da-commissions",
    color: "text-[#157A3B]",
    bgColor: "bg-white border-[#E5E7EB]",
    accentHex: "#157A3B",
    allowedRoles: ["super_admin", "admin", "office_user"],
  },
  {
    id: "reporting",
    label: "Reporting",
    description: "Analytics, KPIs & reports",
    icon: BarChart3,
    path: "/analytics",
    color: "text-[#4840C7]",
    bgColor: "bg-white border-[#E5E7EB]",
    accentHex: "#4840C7",
    allowedRoles: ["super_admin", "admin", "office_user"],
  },
  {
    id: "admin",
    label: "Admin",
    description: "Settings, data & users",
    icon: Shield,
    path: "/admin/company-settings",
    color: "text-[#475569]",
    bgColor: "bg-white border-[#E5E7EB]",
    accentHex: "#475569",
    allowedRoles: ["super_admin", "admin"],
  },
];

// ─── Helper: get sections visible to a role ─────────────────────────────────
export function getVisibleSections(role: UserRole): AppSection[] {
  return APP_SECTIONS.filter(
    (s) => s.allowedRoles === "all" || s.allowedRoles.includes(role)
  );
}

// ─── Helper: detect which section a path belongs to ─────────────────────────
export function getSectionForPath(path: string): string | null {
  if (path.startsWith("/inbox")) return "inbox";
  if (path.startsWith("/crm") || path.startsWith("/calls")) return "crm";
  if (path.startsWith("/proposals")) return "proposals";
  if (path.startsWith("/sales") || path === "/quotes" || path.startsWith("/quotes") || path.startsWith("/deck-quotes") || path.startsWith("/eclipse-quotes") || path.startsWith("/patio-planner")) return "sales";
  if (path.startsWith("/approvals")) return "approvals";
  if (path.startsWith("/da-tracker")) return "da_tracker";
  if (path.startsWith("/construction/analytics") || path === "/analytics" || path.startsWith("/manufacturing/kpi") || path === "/crm/reports") return "reporting";
  if (path.startsWith("/construction/financials") || path.startsWith("/admin/da-commissions") || path.startsWith("/admin/da-invoices") || path.startsWith("/admin/subscriptions") || path.startsWith("/admin/render-costs") || path.startsWith("/admin/suppliers") || path.startsWith("/admin/supplier-feedback")) return "finance";
  if (path.startsWith("/construction") || path.startsWith("/calendar-availability") || path.startsWith("/plan-converter")) return "construction";
  if (path.startsWith("/manufacturing")) return "manufacturing";
  if (path.startsWith("/inventory")) return "inventory";
  if (path.startsWith("/admin") || path.startsWith("/xero-settings")) return "admin";
  return null;
}

// ─── Widget definitions ─────────────────────────────────────────────────────
type WidgetDef = {
  id: string;
  label: string;
  icon: LucideIcon;
};

const WIDGET_DEFS: WidgetDef[] = [
  { id: "kpi_quotes", label: "Quotes This Month", icon: FileText },
  { id: "kpi_revenue", label: "Revenue This Month", icon: DollarSign },
  { id: "kpi_jobs", label: "Active Jobs", icon: HardHat },
  { id: "kpi_leads", label: "New Leads", icon: Users },
  { id: "kpi_low_stock", label: "Low Stock Alerts", icon: Package },
  { id: "recent_activity", label: "Recent Activity", icon: Clock },
  { id: "overdue_pos", label: "Overdue POs", icon: AlertTriangle },
  { id: "your_tasks", label: "Your Tasks", icon: CheckSquare },
];

// ─── Tile metric helper — maps section IDs to live KPI snippets ────────────
function getTileMetric(
  sectionId: string,
  kpiData: any,
  totalUnread: number
): string | null {
  if (!kpiData && sectionId !== "inbox") return null;
  switch (sectionId) {
    case "inbox":
      return totalUnread > 0 ? `${totalUnread} unread` : null;
    case "crm":
      return kpiData?.leadsThisMonth != null ? `${kpiData.leadsThisMonth} new leads` : null;
    case "sales":
      return kpiData?.quotesThisMonth != null ? `${kpiData.quotesThisMonth} quotes this month` : null;
    case "construction":
      return kpiData?.activeJobs != null ? `${kpiData.activeJobs} active jobs` : null;
    case "inventory":
      return kpiData?.lowStockItems ? `${kpiData.lowStockItems} low stock` : null;
    case "approvals":
      return kpiData?.awaitingApprovals ? `${kpiData.awaitingApprovals} pending` : null;
    case "finance":
      return kpiData?.revenueThisMonth != null ? `$${Number(kpiData.revenueThisMonth).toLocaleString()} this month` : null;
    case "manufacturing":
      return kpiData?.overduePOs ? `${kpiData.overduePOs} overdue POs` : null;
    default:
      return null;
  }
}

// ─── App Central Page Component ─────────────────────────────────────────────
// ─── Tour steps for App Central ─────────────────────────────────────────────
const APP_CENTRAL_TOUR_STEPS: TourStep[] = [
  {
    target: "[data-tour='section-grid']",
    title: "App Sections",
    content: "These are your main work areas. Click any section to open it. Only sections relevant to your role are shown.",
    position: "bottom",
  },
  {
    target: "[data-tour='customise-btn']",
    title: "Customise Your Dashboard",
    content: "Click here to show or hide widgets below. Choose which KPIs and activity feeds matter most to you.",
    position: "bottom",
  },
  {
    target: "[data-tour='kpi-row']",
    title: "KPI Widgets",
    content: "At-a-glance metrics for your business. Click any card to jump directly to that section for details.",
    position: "top",
  },
  {
    target: "[data-tour='recent-activity']",
    title: "Recent Activity",
    content: "Your latest quotes and updates appear here. Click any item to open it directly.",
    position: "top",
  },
];

export default function AppCentral() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const [editMode, setEditMode] = useState(false);
  const [tourActive, setTourActive] = useState(false);

  // Auto-start tour for first-time users
  const [autoStarted, setAutoStarted] = useState(false);
  useEffect(() => {
    if (user && !isTourCompleted(`app_central_${user.id}`) && !autoStarted && !tourActive) {
      setAutoStarted(true);
      const timer = setTimeout(() => setTourActive(true), 1000);
      return () => clearTimeout(timer);
    }
  }, [user, autoStarted, tourActive]);

  const handleTourComplete = useCallback(() => {
    setTourActive(false);
  }, []);

  const role = (user?.role || "user") as UserRole;
  const visibleSections = getVisibleSections(role);

  // Inbox unread count for badge
  const { data: inboxUnread } = trpc.inbox.unreadCount.useQuery(undefined, { refetchInterval: 15000 });
  const { data: chatUnread } = trpc.chat.getUnreadTotal.useQuery(undefined, { refetchInterval: 15000 });
  const totalUnread = (inboxUnread || 0) + (chatUnread?.total || 0);

  // Widget config
  const { data: widgetConfig, refetch: refetchConfig } =
    trpc.appCentral.getWidgetConfig.useQuery();
  const saveConfig = trpc.appCentral.saveWidgetConfig.useMutation({
    onSuccess: () => refetchConfig(),
  });

  // KPI data
  const { data: kpiData } = trpc.appCentral.kpiData.useQuery();
  // Recent activity
  const { data: recentActivity } = trpc.appCentral.recentActivity.useQuery();
  // Your tasks
  const { data: yourTasks } = trpc.appCentral.yourTasks.useQuery();

  const visibleWidgets = useMemo(() => {
    if (!widgetConfig) return WIDGET_DEFS.map((w) => ({ ...w, visible: true, order: WIDGET_DEFS.indexOf(w) }));
    return WIDGET_DEFS.map((def) => {
      const cfg = widgetConfig.widgets.find((w) => w.id === def.id);
      return { ...def, visible: cfg?.visible ?? true, order: cfg?.order ?? 99 };
    }).sort((a, b) => a.order - b.order);
  }, [widgetConfig]);

  const toggleWidget = (widgetId: string) => {
    const updated = visibleWidgets.map((w) => ({
      id: w.id,
      visible: w.id === widgetId ? !w.visible : w.visible,
      order: w.order,
    }));
    saveConfig.mutate({ widgets: updated });
  };

  return (
    <div className="space-y-6 sm:space-y-8 max-w-5xl mx-auto pb-24 md:pb-6">
      {/* Command Centre Header */}
      <div className="pt-2 px-4 sm:px-6 py-4 sm:py-5 rounded-xl bg-sidebar border border-sidebar-accent">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-white">
              Welcome back{user?.name ? `, ${user.name.split(" ")[0]}` : ""}
            </h1>
            {/* Quick stats row */}
            <div className="flex flex-wrap items-center gap-3 mt-2">
              {kpiData?.awaitingApprovals ? (
                <button onClick={() => setLocation("/crm?status=building_authority")} className="text-xs text-[#C9AB57] hover:text-[#D6BA68] transition-colors">
                  {kpiData.awaitingApprovals} approvals waiting
                </button>
              ) : null}
              {kpiData?.activeJobs ? (
                <button onClick={() => setLocation("/construction")} className="text-xs text-gray-300 hover:text-white transition-colors">
                  {kpiData.activeJobs} active jobs
                </button>
              ) : null}
              {totalUnread > 0 ? (
                <button onClick={() => setLocation("/inbox")} className="text-xs text-gray-300 hover:text-white transition-colors">
                  {totalUnread} unread messages
                </button>
              ) : null}
              {kpiData?.overduePOs ? (
                <button onClick={() => setLocation("/inventory/procurement")} className="text-xs text-red-400 hover:text-red-300 transition-colors">
                  {kpiData.overduePOs} overdue POs
                </button>
              ) : null}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <TourHelpButton
              onClick={() => setTourActive(true)}
              label="Tour"
              className="border-[#102544] text-white hover:bg-[#102544] hover:text-white"
            />
            <Dialog open={editMode} onOpenChange={setEditMode}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2 border-[#102544] text-white hover:bg-[#102544] hover:text-white" data-tour="customise-btn">
                  <Settings2 className="h-4 w-4" />
                  Customise
                </Button>
              </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Customise Dashboard Widgets</DialogTitle>
              </DialogHeader>
              <div className="space-y-3 pt-2">
                {visibleWidgets.map((w) => (
                  <div
                    key={w.id}
                    className="flex items-center justify-between p-3 rounded-lg border"
                  >
                    <div className="flex items-center gap-3">
                      <GripVertical className="h-4 w-4 text-muted-foreground" />
                      <w.icon className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-medium">{w.label}</span>
                    </div>
                    <Switch
                      checked={w.visible}
                      onCheckedChange={() => toggleWidget(w.id)}
                    />
                  </div>
                ))}
              </div>
            </DialogContent>
          </Dialog>
        </div>
        </div>
      </div>

      {/* Section Grid */}
      <TooltipProvider delayDuration={300}>
      <div data-tour="section-grid" className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3" style={{ gridAutoRows: '1fr' }}>
        {visibleSections.map((section) => {
          const isInbox = section.id === "inbox";
          const isTier1 = TIER1_IDS.has(section.id);
          // Tier 1 modules use gold icon bg; Tier 2 use their own softer accent
          const iconBgColor = isTier1 ? "#C9AB57" : section.accentHex;
          const iconTextColor = isTier1 ? "#06162D" : "#FFFFFF";
          // Get metric for this tile
          const metric = getTileMetric(section.id, kpiData, totalUnread);
          const tileContent = (
            <button
              key={section.id}
              onClick={() => {
                if (navigator.vibrate) navigator.vibrate(10);
                setLocation(section.path);
              }}
              className={`relative w-full h-full flex flex-col items-center justify-between gap-3 p-6 sm:p-7 rounded-xl border transition-all duration-200 cursor-pointer group hover:-translate-y-1 hover:shadow-[0_8px_24px_rgba(6,22,45,0.08)] ${section.bgColor}`}
              style={{ minHeight: '200px' }}
            >
              <div className="flex flex-col items-center gap-3">
                <div className={`relative h-16 w-16 flex items-center justify-center group-hover:shadow-lg transition-shadow ${!isTier1 ? 'opacity-80' : ''}`} style={{ backgroundColor: isTier1 ? '#C9AB57' : section.accentHex, color: isTier1 ? '#06162D' : '#fff', borderRadius: '18px', boxShadow: isTier1 ? '0 4px 12px rgba(201,171,87,.25)' : '0 4px 12px rgba(0,0,0,.1)' }}>
                  <section.icon className="h-7 w-7" />
                  {isInbox && totalUnread > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 flex items-center justify-center rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold leading-none shadow-sm">
                      {totalUnread > 99 ? "99+" : totalUnread}
                    </span>
                  )}
                </div>
                <div className="text-center">
                  <p className={`text-[#1F2937] leading-tight ${isTier1 ? 'font-bold text-[20px] sm:text-[24px]' : 'font-semibold text-[16px] sm:text-[18px]'}`}>{section.label}</p>
                  <span className="block mx-auto mt-1 h-[2px] rounded-full transition-all duration-200 w-8 group-hover:w-12" style={{ backgroundColor: isTier1 ? '#C9AB57' : section.accentHex }} />
                  <p className="text-[12px] text-[#6B7280] mt-1 hidden sm:block">{section.description}</p>
                </div>
              </div>
              {/* Metrics divider + data — always reserve space for consistent tile height */}
              <div className={`w-full pt-2 mt-auto ${metric ? 'border-t border-[#E5E7EB]' : ''}`}>
                <p className={`text-xs text-center ${metric ? 'text-[#6B7280]' : 'text-transparent'}`}>{metric || '\u00A0'}</p>
              </div>
            </button>
          );

          if (isInbox && totalUnread > 0) {
            return (
              <Tooltip key={section.id}>
                <TooltipTrigger asChild>{tileContent}</TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs">
                  <div className="space-y-0.5">
                    {(inboxUnread || 0) > 0 && <p>{inboxUnread} unread email{(inboxUnread || 0) > 1 ? "s" : ""}</p>}
                    {(chatUnread?.total || 0) > 0 && <p>{chatUnread?.total} chat message{(chatUnread?.total || 0) > 1 ? "s" : ""}</p>}
                  </div>
                </TooltipContent>
              </Tooltip>
            );
          }

          return <span key={section.id}>{tileContent}</span>;
        })}
      </div>
      </TooltipProvider>

      {/* Widgets Section */}
      <div className="space-y-4">
        {/* KPI Row */}
        <div data-tour="kpi-row" className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {visibleWidgets.find((w) => w.id === "kpi_quotes" && w.visible) && (
            <KpiCard
              label="Quotes This Month"
              value={kpiData?.quotesThisMonth ?? "—"}
              subLabel={`${kpiData?.conversionRate ?? 0}% conversion`}
              icon={FileText}
              color="text-emerald-600"
              onClick={() => setLocation("/sales")}
            />
          )}
          {visibleWidgets.find((w) => w.id === "kpi_revenue" && w.visible) && (
            <KpiCard
              label="Revenue This Month"
              value={kpiData?.revenueThisMonth != null ? `$${Number(kpiData.revenueThisMonth).toLocaleString()}` : "—"}
              icon={DollarSign}
              color="text-green-600"
              onClick={() => setLocation("/sales")}
            />
          )}
          {visibleWidgets.find((w) => w.id === "kpi_jobs" && w.visible) && (
            <KpiCard
              label="Active Jobs"
              value={kpiData?.activeJobs ?? "—"}
              icon={HardHat}
              color="text-amber-600"
              onClick={() => setLocation("/construction")}
            />
          )}
          {visibleWidgets.find((w) => w.id === "kpi_leads" && w.visible) && (
            <KpiCard
              label="New Leads"
              value={kpiData?.leadsThisMonth ?? "—"}
              subLabel="this month"
              icon={Users}
              color="text-blue-600"
              onClick={() => setLocation("/crm")}
            />
          )}
          {visibleWidgets.find((w) => w.id === "kpi_low_stock" && w.visible) && (
            <KpiCard
              label="Low Stock"
              value={kpiData?.lowStockItems ?? "—"}
              subLabel="items below min"
              icon={Package}
              color={kpiData?.lowStockItems ? "text-red-600" : "text-orange-600"}
              onClick={() => setLocation("/inventory/low-stock-alerts")}
              alert={!!kpiData?.lowStockItems}
            />
          )}
          {visibleWidgets.find((w) => w.id === "kpi_approvals" && w.visible) && (
            <KpiCard
              label="Awaiting Approvals"
              value={kpiData?.awaitingApprovals ?? "—"}
              subLabel="building authority"
              icon={ClipboardList}
              color={kpiData?.awaitingApprovals ? "text-orange-600" : "text-gray-500"}
              onClick={() => setLocation("/crm?status=building_authority")}
              alert={!!kpiData?.awaitingApprovals}
            />
          )}
        </div>

        {/* Overdue POs alert */}
        {visibleWidgets.find((w) => w.id === "overdue_pos" && w.visible) &&
          kpiData?.overduePOs !== undefined &&
          kpiData.overduePOs > 0 && (
            <Card
              className="border-red-200 bg-red-50 cursor-pointer hover:bg-red-100 transition-colors"
              onClick={() => setLocation("/inventory/procurement")}
            >
              <CardContent className="py-3 px-4 flex items-center gap-3">
                <AlertTriangle className="h-5 w-5 text-red-600" />
                <span className="text-sm font-medium text-red-800">
                  {kpiData.overduePOs} overdue purchase order{kpiData.overduePOs > 1 ? "s" : ""} require attention
                </span>
              </CardContent>
            </Card>
          )}

        {/* Recent Activity */}
        {visibleWidgets.find((w) => w.id === "recent_activity" && w.visible) && (
          <Card data-tour="recent-activity">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                Recent Activity
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              {recentActivity && recentActivity.length > 0 ? (
                <div className="space-y-2">
                  {recentActivity.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between py-2 px-3 rounded-md hover:bg-muted/50 cursor-pointer transition-colors"
                      onClick={() => setLocation(`/quotes/${item.id}`)}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">
                            {item.quoteNumber} — {item.clientName}
                          </p>
                        </div>
                      </div>
                      <Badge
                        variant={
                          item.status === "accepted"
                            ? "default"
                            : item.status === "sent"
                            ? "secondary"
                            : item.status === "lost"
                            ? "destructive"
                            : "outline"
                        }
                        className="text-[10px] shrink-0"
                      >
                        {item.status}
                      </Badge>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  No recent activity
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {/* Your Tasks */}
        {visibleWidgets.find((w) => w.id === "your_tasks" && w.visible) && (
          <YourTasksWidget />
        )}
      </div>
      {/* Onboarding Tour */}
      <OnboardingTour
        tourId={user ? `app_central_${user.id}` : "app_central"}
        steps={APP_CENTRAL_TOUR_STEPS}
        active={tourActive}
        onComplete={handleTourComplete}
      />
    </div>
  );
}

// ─── KPI Card Component ─────────────────────────────────────────────────────
function KpiCard({
  label,
  value,
  subLabel,
  icon: Icon,
  color,
  onClick,
  alert,
}: {
  label: string;
  value: number | string;
  subLabel?: string;
  icon: LucideIcon;
  color: string;
  onClick?: () => void;
  alert?: boolean;
}) {
  return (
    <Card
      className={`cursor-pointer hover:shadow-md transition-shadow ${alert ? "border-red-200" : ""}`}
      onClick={onClick}
    >
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <Icon className={`h-5 w-5 ${color}`} />
          {alert && (
            <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
          )}
        </div>
        <p className="text-2xl font-bold mt-2">{value}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
        {subLabel && (
          <p className="text-[10px] text-muted-foreground">{subLabel}</p>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Your Tasks Widget with Mark Complete ──────────────────────────────────
function YourTasksWidget() {
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();
  const { data: yourTasks } = trpc.appCentral.yourTasks.useQuery();

  const completeTask = trpc.appCentral.completeTask.useMutation({
    onMutate: async ({ taskId, section }) => {
      // Optimistic: remove from list immediately
      await utils.appCentral.yourTasks.cancel();
      const prev = utils.appCentral.yourTasks.getData();
      utils.appCentral.yourTasks.setData(undefined, (old) =>
        old ? old.filter((t) => !(t.id === taskId && t.section === section)) : []
      );
      return { prev };
    },
    onError: (_err, _vars, context) => {
      if (context?.prev) {
        utils.appCentral.yourTasks.setData(undefined, context.prev);
      }
      toast.error("Failed to complete task");
    },
    onSettled: () => {
      utils.appCentral.yourTasks.invalidate();
    },
    onSuccess: () => {
      toast.success("Task marked complete");
    },
  });

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <CheckSquare className="h-4 w-4 text-muted-foreground" />
          Your Tasks
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        {yourTasks && yourTasks.length > 0 ? (
          <div className="space-y-2">
            {yourTasks.map((task) => (
              <div
                key={`${task.section}-${task.id}`}
                className="flex items-center justify-between py-2 px-3 rounded-md hover:bg-muted/50 transition-colors group"
              >
                <div
                  className="flex items-center gap-3 min-w-0 cursor-pointer flex-1"
                  onClick={() => setLocation(task.path)}
                >
                  <CheckSquare className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{task.title}</p>
                    <p className="text-[11px] text-muted-foreground">{task.section}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {task.dueDate && (
                    <span className="text-[10px] text-muted-foreground">
                      {new Date(task.dueDate).toLocaleDateString()}
                    </span>
                  )}
                  <Badge
                    variant={
                      task.status === "overdue"
                        ? "destructive"
                        : task.status === "open" || task.status === "todo"
                        ? "outline"
                        : "secondary"
                    }
                    className="text-[10px]"
                  >
                    {task.status}
                  </Badge>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity text-green-600 hover:text-green-700 hover:bg-green-50"
                    onClick={(e) => {
                      e.stopPropagation();
                      completeTask.mutate({
                        taskId: task.id,
                        section: task.section as "Inbox" | "Construction" | "Procurement",
                      });
                    }}
                    title="Mark complete"
                  >
                    <Check className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground py-4 text-center">
            No assigned tasks
          </p>
        )}
      </CardContent>
    </Card>
  );
}
