import { useAuth } from "@/_core/hooks/useAuth";
import { useLocation } from "wouter";
import { normalizeUserRole, type UserRole } from "@shared/const";
import { getDefaultNavigationSettings } from "@shared/navigation-config";
import { trpc } from "@/lib/trpc";
import { useState, useCallback, useEffect } from "react";
import { OnboardingTour, isTourCompleted, TourHelpButton, type TourStep } from "@/components/OnboardingTour";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import {
  APP_SECTIONS,
  getReadableTextColor,
  getSectionAccentHex,
  getVisibleSections,
} from "@/lib/appSections";
import { useEffectivePermissions } from "@/hooks/useEffectivePermissions";

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
];

export default function AppCentral() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
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

  const role = normalizeUserRole(user?.role) as UserRole;
  const { canAccessPath } = useEffectivePermissions();
  const { data: navigationSettings } = trpc.globalSettings.getNavigationSettings.useQuery(undefined, {
    enabled: Boolean(user),
    staleTime: 60_000,
  });
  const roleNavigationSettings = (navigationSettings ?? getDefaultNavigationSettings()).roles[role]
    ?? getDefaultNavigationSettings().roles.user;
  const visibleSections = getVisibleSections(role, canAccessPath, roleNavigationSettings.appCentralSectionIds);

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
  const { data: colourScheme } = trpc.globalSettings.getColourScheme.useQuery();

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
        </div>
        </div>
      </div>

      {/* Section Grid */}
      <TooltipProvider delayDuration={300}>
      <div data-tour="section-grid" className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3" style={{ gridAutoRows: '1fr' }}>
        {visibleSections.map((section) => {
          const isInbox = section.id === "inbox";
          const accentHex = getSectionAccentHex(section, colourScheme);
          const iconTextColor = getReadableTextColor(accentHex);
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
                <div className="relative h-16 w-16 flex items-center justify-center group-hover:shadow-lg transition-shadow" style={{ backgroundColor: accentHex, color: iconTextColor, borderRadius: '18px', boxShadow: '0 4px 12px rgba(0,0,0,.12)' }}>
                  <section.icon className="h-7 w-7" />
                  {isInbox && totalUnread > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 flex items-center justify-center rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold leading-none shadow-sm">
                      {totalUnread > 99 ? "99+" : totalUnread}
                    </span>
                  )}
                </div>
                <div className="text-center">
                  <p className="text-[#1F2937] leading-tight font-semibold text-[16px] sm:text-[18px]">{section.label}</p>
                  <span className="block mx-auto mt-1 h-[2px] rounded-full transition-all duration-200 w-8 group-hover:w-12" style={{ backgroundColor: accentHex }} />
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
