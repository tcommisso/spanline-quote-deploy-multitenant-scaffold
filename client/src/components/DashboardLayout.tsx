import { useAuth } from "@/_core/hooks/useAuth";
import { TermsAcceptanceGate } from "@/components/TermsAcceptanceGate";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "@/components/ui/collapsible";
import { getLoginUrl } from "@/const";
import { GlobalSearch } from "@/components/GlobalSearch";
import { useIsMobile } from "@/hooks/useMobile";
import {
  Bell,
  LayoutDashboard,
  LayoutGrid,
  FileText,
  Database,
  LogOut,
  PanelLeft,
  Menu,
  Shield,
  ChevronRight,
  ChevronDown,
  BarChart3,
  Fence,
  Sun,
  Users,
  Contact,
  ClipboardList,
  Layers,
  Mail,
  Send,
  Building2,
  HardHat,
  CalendarDays,
  KanbanSquare,
  DollarSign,
  Link2,
  Globe,
  CreditCard,
  Inbox,
  HelpCircle,
  Wrench,
  Star,
  Package,
  ShoppingCart,
  Cloud,
  CloudRain,
  CloudSnow,
  CloudSun,
  CloudDrizzle,
  CloudLightning,
  CloudFog,
  Thermometer,
  History,
  Receipt,
  Palette,
  Sparkles,
  BookOpen,
  Brain,
  ShieldCheck,
  ClipboardCheck,
  Settings,
  Library,
  Landmark,
  MapPin,
  FileCheck,
  User,
  Building,
  Factory,
  Truck,
  QrCode,
  TrendingUp,
  Warehouse,
  ArrowDownUp,
  ArrowRightLeft,
  AlertTriangle,
  ThumbsUp,
  Clock,
  MessageSquare,
  Bug,
  Lightbulb,
  Wallet,
  ListChecks,
  Cog,
  Crosshair,
  Files,
  Phone,
  type LucideIcon,
} from "lucide-react";
import { CSSProperties, useCallback, useEffect, useMemo, useRef, useState, type TouchEvent as ReactTouchEvent } from "react";
import { useLocation, Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { DashboardLayoutSkeleton } from "./DashboardLayoutSkeleton";
import { getSectionForPath, APP_SECTIONS } from "@/lib/appSections";
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "./ui/button";
import { isAdminRole, ROLE_LABELS, type UserRole } from "@shared/const";
import { loadCustomLogo, loadAppIcon } from "@/lib/proposalStore";
import { OverdueAlerts } from "@/components/OverdueAlerts";
import { ScrollToTop } from "@/components/ScrollToTop";
import { useSettingsSync } from "@/hooks/useSettingsSync";
import PWAInstallPrompt from "@/components/PWAInstallPrompt";
import { PushNotificationOptIn } from "@/components/PushNotificationOptIn";
import { QuickActions } from "@/components/QuickActions";
import { QuickCompose } from "@/components/QuickCompose";
import { useUnreadNotification } from "@/hooks/useUnreadNotification";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";

// ─── Menu item type ───────────────────────────────────────────────────────────────
type MenuItem = { icon: LucideIcon; label: string; path: string; badge?: number };

const crmItems: MenuItem[] = [
  { icon: Contact, label: "CRM Dashboard", path: "/crm" },
  { icon: ClipboardList, label: "Pipeline & Clients", path: "/crm/leads" },
  { icon: Phone, label: "Call Logs", path: "/calls" },
];

const salesItems: MenuItem[] = [
  { icon: LayoutDashboard, label: "Sales Dashboard", path: "/sales" },
  { icon: FileText, label: "Structure Quotes", path: "/quotes" },
  { icon: Fence, label: "Deck Quotes", path: "/deck-quotes" },
  { icon: Sun, label: "Eclipse Quotes", path: "/eclipse-quotes" },
  { icon: ShieldCheck, label: "Screen Quotes", path: "/security-screens" },
  { icon: Layers, label: "Blinds Quotes", path: "/blinds" },
  { icon: Send, label: "Proposals", path: "/proposals" },
  { icon: Palette, label: "Patio Planner", path: "/patio-planner" },
];

const constructionItems: MenuItem[] = [
  { icon: Users, label: "Active Jobs", path: "/construction/clients" },
  { icon: HardHat, label: "Construction Dashboard", path: "/construction" },
  { icon: CalendarDays, label: "Work Schedule", path: "/construction/schedule" },
  { icon: CalendarDays, label: "Calendar Availability", path: "/calendar-availability" },
  { icon: KanbanSquare, label: "Project Plan", path: "/construction/project-plan" },


  { icon: Receipt, label: "Purchase Orders", path: "/construction/purchase-orders" },
  { icon: History, label: "Weather History", path: "/construction/weather-history" },
  { icon: CloudRain, label: "Rain Days", path: "/construction/rain-days" },
  { icon: FileText, label: "Invoice Review", path: "/admin/invoice-review" },
  { icon: ShoppingCart, label: "Component Orders", path: "/construction/component-orders" },
  { icon: MapPin, label: "Live Tracking", path: "/construction/live-tracking" },
  { icon: MessageSquare, label: "Team Chat", path: "/construction/chat" },
  { icon: FileText, label: "Plan Converter", path: "/plan-converter" },
];

const manufacturingItems: MenuItem[] = [
  { icon: Factory, label: "Manufacturing Dashboard", path: "/manufacturing" },
  { icon: ClipboardList, label: "Orders", path: "/manufacturing/orders" },
  { icon: CalendarDays, label: "Calendar", path: "/manufacturing/calendar" },
  { icon: BarChart3, label: "Reports", path: "/manufacturing/reports" },
  { icon: Receipt, label: "Purchase Orders", path: "/manufacturing/purchase-orders" },
  { icon: Building2, label: "Supplier Directory", path: "/manufacturing/suppliers" },
  { icon: FileText, label: "Procurement", path: "/manufacturing/procurement" },
  { icon: Truck, label: "Dispatch", path: "/manufacturing/dispatch" },
  { icon: Users, label: "Drivers", path: "/manufacturing/drivers" },
  { icon: CalendarDays, label: "Delivery Calendar", path: "/manufacturing/delivery-calendar" },
  { icon: QrCode, label: "QR Codes", path: "/manufacturing/qr-codes" },

];

const inventoryItems: MenuItem[] = [
  { icon: LayoutDashboard, label: "Dashboard", path: "/inventory/dashboard" },
  { icon: Warehouse, label: "Stock Items", path: "/inventory/stock-items" },
  { icon: ArrowDownUp, label: "Movements", path: "/inventory/movements" },
  { icon: ArrowRightLeft, label: "Transfers", path: "/inventory/transfers" },
  { icon: ClipboardCheck, label: "Stocktake", path: "/inventory/stocktake" },
  { icon: Package, label: "Warehouse Receiving", path: "/inventory/warehouse-receiving" },
  { icon: AlertTriangle, label: "Low Stock Alerts", path: "/inventory/low-stock-alerts" },
  { icon: BarChart3, label: "Reports", path: "/inventory/reports" },
];

const approvalsItems: MenuItem[] = [
  { icon: LayoutDashboard, label: "Approvals Dashboard", path: "/approvals" },
  { icon: FileText, label: "Projects", path: "/approvals/projects" },
  { icon: ClipboardList, label: "Tasks", path: "/approvals/tasks" },
  { icon: FileCheck, label: "Documents", path: "/approvals/documents" },
  { icon: AlertTriangle, label: "RFIs & Conditions", path: "/approvals/rfis" },
  { icon: ShieldCheck, label: "Inspections", path: "/approvals/inspections" },

  { icon: Cog, label: "Workflow Templates", path: "/approvals/workflow-templates" },
  { icon: LayoutDashboard, label: "HBCF Dashboard", path: "/approvals/hbcf/dashboard" },
  { icon: Files, label: "HBCF Certificates", path: "/approvals/hbcf/certificates" },
  { icon: Crosshair, label: "HBCF Competitors", path: "/approvals/hbcf/competitors" },
  { icon: Shield, label: "HBCF Builder Profile", path: "/approvals/hbcf/builder-profile" },
];

const daTrackerItems: MenuItem[] = [
  { icon: MapPin, label: "DA Map", path: "/da-tracker" },
  { icon: FileText, label: "DA List", path: "/da-tracker/list" },
  { icon: Building2, label: "NSW DAs", path: "/da-tracker/nsw" },
  { icon: Crosshair, label: "Competitor Intel", path: "/da-tracker/competitors" },
  { icon: Bell, label: "Subscriptions", path: "/da-tracker/subscriptions" },
];

const inboxItems: MenuItem[] = [
  { icon: Inbox, label: "Inbox", path: "/inbox" },
];

const financeItems: MenuItem[] = [
  { icon: DollarSign, label: "Construction Overview", path: "/construction/financials" },
  { icon: DollarSign, label: "DA Commissions", path: "/admin/da-commissions" },
  { icon: FileCheck, label: "DA Invoice Approval", path: "/admin/da-invoices" },
  { icon: CreditCard, label: "Subscriptions", path: "/admin/subscriptions" },
  { icon: CreditCard, label: "SaaS Billing", path: "/admin/saas-billing" },
  { icon: Sparkles, label: "Render Costs", path: "/admin/render-costs" },
  { icon: Building2, label: "Construction Suppliers", path: "/admin/suppliers" },
  { icon: ThumbsUp, label: "Supplier Feedback", path: "/admin/supplier-feedback" },
];

const reportingItems: MenuItem[] = [
  { icon: BarChart3, label: "Sales Analytics", path: "/analytics" },
  { icon: BarChart3, label: "Construction Analytics", path: "/construction/analytics" },
  { icon: TrendingUp, label: "Manufacturing KPIs", path: "/manufacturing/kpi" },
  { icon: BarChart3, label: "CRM Reports", path: "/crm/reports" },
];

// ─── Admin groups ─────────────────────────────────────────────────────────────
type AdminGroup = { label: string; icon: LucideIcon; items: MenuItem[] };

const adminGroups: AdminGroup[] = [
  {
    label: "Settings",
    icon: Settings,
    items: [
      { icon: Building2, label: "Company Settings", path: "/admin/company-settings" },
      { icon: Shield, label: "Proposal & Notifications", path: "/admin/settings" },
      { icon: Bell, label: "Notification Log", path: "/admin/notification-log" },
      { icon: Inbox, label: "Inbox Settings", path: "/admin/inbox-settings" },
      { icon: Globe, label: "API Health", path: "/admin/api-health" },
      { icon: Link2, label: "Xero Integration", path: "/xero-settings" },
      { icon: Star, label: "Climbo / Reviews", path: "/admin/climbo-settings" },
      { icon: MapPin, label: "Territory Management", path: "/admin/territories" },
      { icon: BarChart3, label: "Territory Coverage", path: "/admin/territory-coverage" },
      { icon: CalendarDays, label: "Calendar Views", path: "/admin/calendar-views" },
      { icon: Palette, label: "Colour Scheme", path: "/admin/colour-scheme" },
      { icon: Phone, label: "VOCPhone Recordings", path: "/admin/extensions" },
    ],
  },
  {
    label: "Data & Pricing",
    icon: Database,
    items: [
      { icon: Database, label: "Sales Data", path: "/admin/master-data" },
      { icon: Package, label: "Construction Data", path: "/admin/component-catalogue" },
      { icon: Factory, label: "Manufacturing Data", path: "/admin/manufacturing-data" },
      { icon: ShieldCheck, label: "Security Screen Data", path: "/admin/security-screens" },
      { icon: Layers, label: "Blinds Data", path: "/admin/blinds" },
      { icon: Layers, label: "Order Templates", path: "/admin/order-templates" },
      { icon: Sparkles, label: "AI Render Pricing", path: "/admin/ai-render-pricing" },
      { icon: History, label: "Import History", path: "/admin/import-history" },
      { icon: Files, label: "Templates & Documents", path: "/admin/master-data/general/descriptions-of-work" },
      { icon: Settings, label: "General", path: "/admin/master-data/general/colour" },
    ],
  },
  {
    label: "Libraries & Compliance",
    icon: Library,
    items: [
      { icon: BookOpen, label: "Technical Library", path: "/admin/tech-library" },
      { icon: Brain, label: "Engini Knowledge", path: "/admin/engini-knowledge" },
      { icon: Cog, label: "AI Settings", path: "/admin/ai-settings" },
      { icon: ShieldCheck, label: "WH&S Documents", path: "/admin/whs" },
      { icon: Package, label: "Equipment", path: "/admin/equipment" },
    ],
  },
  {
    label: "Portals & People",
    icon: Landmark,
    items: [
      { icon: Users, label: "People", path: "/admin/people" },
      { icon: Globe, label: "Client Portal", path: "/admin/portal-management" },
      { icon: HardHat, label: "Trade Portal", path: "/admin/trade-portal-content" },
      { icon: History, label: "Impersonation Log", path: "/admin/impersonation-log" },
    ],
  },
];

// Flat list of all admin items (for favourites lookup)
const adminItems: MenuItem[] = adminGroups.flatMap(g => g.items);

// Help is available to all users, not just admins
const helpItems: MenuItem[] = [
  { icon: HelpCircle, label: "Help Guide", path: "/help" },
  { icon: Layers, label: "Process Flows", path: "/process-flows" },
  { icon: Bug, label: "Report a Bug", path: "/support/bug" },
  { icon: Lightbulb, label: "Make a Suggestion", path: "/support/suggestion" },
  { icon: ClipboardList, label: "Manage Submissions", path: "/admin/support-submissions" },
];

// All menu items for favourites lookup
const allMenuItems: MenuItem[] = [
  ...crmItems, ...salesItems, ...constructionItems, ...approvalsItems, ...daTrackerItems, ...manufacturingItems, ...inventoryItems, ...inboxItems, ...financeItems, ...reportingItems, ...adminItems, ...helpItems,
];

// ─── Favourites persistence ─────────────────────────────────────────────────
const FAVOURITES_KEY = "sidebar-favourites";

function loadFavourites(): string[] {
  try {
    const saved = localStorage.getItem(FAVOURITES_KEY);
    return saved ? JSON.parse(saved) : [];
  } catch { return []; }
}

function saveFavourites(paths: string[]) {
  localStorage.setItem(FAVOURITES_KEY, JSON.stringify(paths));
}

// ─── Recently Visited persistence ──────────────────────────────────────────
const RECENT_KEY = "sidebar-recently-visited";
const MAX_RECENT = 5;

function loadRecentlyVisited(): string[] {
  try {
    const saved = localStorage.getItem(RECENT_KEY);
    return saved ? JSON.parse(saved) : [];
  } catch { return []; }
}

function saveRecentlyVisited(paths: string[]) {
  localStorage.setItem(RECENT_KEY, JSON.stringify(paths.slice(0, MAX_RECENT)));
}

// ─── Weather helpers ────────────────────────────────────────────────────────
type DayForecast = {
  date: string;
  tempMax: number;
  tempMin: number;
  precipitation: number;
  windSpeedMax: number;
  weatherCode: number;
};

type WeatherData = {
  temperature: number;
  weatherCode: number;
  windSpeed: number;
  daily: DayForecast[];
};

function getWeatherIcon(code: number): LucideIcon {
  if (code === 0 || code === 1) return Sun;
  if (code === 2) return CloudSun;
  if (code === 3) return Cloud;
  if (code >= 45 && code <= 48) return CloudFog;
  if (code >= 51 && code <= 55) return CloudDrizzle;
  if (code >= 56 && code <= 57) return CloudDrizzle;
  if (code >= 61 && code <= 65) return CloudRain;
  if (code >= 66 && code <= 67) return CloudRain;
  if (code >= 71 && code <= 77) return CloudSnow;
  if (code >= 80 && code <= 82) return CloudRain;
  if (code >= 85 && code <= 86) return CloudSnow;
  if (code >= 95 && code <= 99) return CloudLightning;
  return Cloud;
}

function getWeatherLabel(code: number): string {
  if (code === 0) return "Clear";
  if (code === 1) return "Mostly Clear";
  if (code === 2) return "Partly Cloudy";
  if (code === 3) return "Overcast";
  if (code >= 45 && code <= 48) return "Foggy";
  if (code >= 51 && code <= 55) return "Drizzle";
  if (code >= 56 && code <= 57) return "Freezing Drizzle";
  if (code >= 61 && code <= 65) return "Rain";
  if (code >= 66 && code <= 67) return "Freezing Rain";
  if (code >= 71 && code <= 77) return "Snow";
  if (code >= 80 && code <= 82) return "Showers";
  if (code >= 85 && code <= 86) return "Snow Showers";
  if (code >= 95 && code <= 99) return "Thunderstorm";
  return "Unknown";
}

function getShortDay(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-AU", { weekday: "short" });
}

function appSectionIdFromSidebarSection(sectionKey: string | null) {
  if (sectionKey === "communications") return "inbox";
  if (sectionKey === "daTracker") return "da_tracker";
  if (sectionKey === "support") return null;
  return sectionKey;
}

function useWeather(): WeatherData | null {
  const { data } = trpc.weather.getForecast.useQuery(undefined, {
    staleTime: 30 * 60 * 1000, // 30 min
    refetchOnWindowFocus: false,
  });

  if (!data?.current) return null;
  return {
    temperature: data.current.temperature,
    weatherCode: data.current.weatherCode,
    windSpeed: data.current.windSpeed,
    daily: data.daily ?? [],
  };
}

// ─── Sidebar width persistence ──────────────────────────────────────────────
const SIDEBAR_WIDTH_KEY = "sidebar-width";
const DEFAULT_WIDTH = 260;
const MIN_WIDTH = 200;
const MAX_WIDTH = 400;

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = localStorage.getItem(SIDEBAR_WIDTH_KEY);
    return saved ? parseInt(saved, 10) : DEFAULT_WIDTH;
  });
  const { loading, user } = useAuth();
  useSettingsSync(); // Sync settings from server on mount (ensures logo/icon/company details are consistent across devices)

    useEffect(() => {
    localStorage.setItem(SIDEBAR_WIDTH_KEY, sidebarWidth.toString());
  }, [sidebarWidth]);

  const { data: loginBg } = trpc.globalSettings.getLoginBackground.useQuery(undefined, {
    enabled: !user && !loading,
    staleTime: 10 * 60_000, // cache 10 min
  });
  const { data: loginTagline } = trpc.globalSettings.getLoginTagline.useQuery(undefined, {
    enabled: !user && !loading,
    staleTime: 10 * 60_000,
  });
  const tagHeadline = loginTagline?.headline || "Elevate Every Build";
  const tagSubtitle = loginTagline?.subtitle || "The operating platform for outdoor living builders.";
  const tagSignInPrompt = loginTagline?.signInPrompt || "Sign in to access your project dashboard.";

  if (loading) return <DashboardLayoutSkeleton />;

  if (!user) {
    const appLogo = import.meta.env.VITE_APP_LOGO;
    const bgUrl = loginBg?.url || "/manus-storage/altaspan-login-bg_c3c1a799.jpg";
    return (
      <div className="flex min-h-screen relative animate-[fadeIn_0.6s_ease-out]">
        {/* Mobile background image (visible on small screens) */}
        <div className="absolute inset-0 lg:hidden">
          <img
            src={bgUrl}
            alt="Outdoor living"
            className="absolute inset-0 w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-[#06162D]/70 via-[#06162D]/60 to-[#06162D]/90" />
        </div>
        {/* Left side - branding image (desktop only) */}
        <div className="hidden lg:flex lg:w-1/2 relative">
          <img
            src={bgUrl}
            alt="Outdoor living"
            className="absolute inset-0 w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#06162D]/80 via-[#06162D]/40 to-transparent" />
          <div className="absolute bottom-12 left-12 right-12">
            <h2 className="text-3xl font-semibold text-white tracking-tight">{tagHeadline}</h2>
            <p className="text-sm text-[#F2EDE6]/80 mt-2">{tagSubtitle}</p>
          </div>
        </div>
        {/* Right side - login form */}
        <div className="flex-1 flex items-center justify-center bg-[#06162D] lg:bg-[#06162D] bg-transparent relative z-10 p-8">
          <div className="flex flex-col items-center gap-8 max-w-sm w-full animate-[fadeInUp_0.8s_ease-out_0.2s_both]">
            <div className="flex flex-col items-center gap-4">
              {appLogo ? (
                <img src={appLogo} alt="Altaspan" className="h-16 w-auto object-contain mb-2" />
              ) : (
                <div className="flex flex-col items-center gap-2">
                  <div className="h-14 w-14 rounded-xl bg-[#C9AB57]/10 flex items-center justify-center mb-1">
                    <svg viewBox="0 0 40 40" className="h-8 w-8" fill="none">
                      <path d="M20 4L4 36h8l8-18 8 18h8L20 4z" fill="#C9AB57" />
                      <path d="M20 14l-6 14h12l-6-14z" fill="#06162D" />
                    </svg>
                  </div>
                  <span className="text-2xl font-semibold text-white tracking-wide">ALTASPAN</span>
                </div>
              )}
              <p className="text-sm text-[#F2EDE6]/60 text-center">
                {tagSignInPrompt}
              </p>
            </div>
            {/* Tagline - visible on mobile, hidden on desktop (shown in left panel instead) */}
            <div className="lg:hidden text-center">
              <h2 className="text-2xl font-semibold text-white tracking-tight">{tagHeadline}</h2>
              <p className="text-sm text-[#F2EDE6]/70 mt-1">{tagSubtitle}</p>
            </div>
            <Button
              onClick={() => { window.location.href = getLoginUrl(); }}
              size="lg"
              className="w-full bg-[#C9AB57] hover:bg-[#C9AB57]/90 text-[#06162D] font-semibold"
            >
              Sign in to continue
            </Button>
            <p className="text-xs text-[#F2EDE6]/40 text-center">
              One platform. Every stage. From lead to lifetime.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <TermsAcceptanceGate>
      <SidebarProvider
        style={{ "--sidebar-width": `${sidebarWidth}px` } as CSSProperties}
      >
        <DashboardLayoutContent setSidebarWidth={setSidebarWidth}>
          {children}
        </DashboardLayoutContent>
      </SidebarProvider>
    </TermsAcceptanceGate>
  );
}

function DashboardLayoutContent({
  children,
  setSidebarWidth,
}: {
  children: React.ReactNode;
  setSidebarWidth: (width: number) => void;
}) {
  const { user, logout } = useAuth();
  const [location, setLocation] = useLocation();
  const { state, toggleSidebar } = useSidebar();
  const isCollapsed = state === "collapsed";
  const [isResizing, setIsResizing] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const sidebarContentRef = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile();
  const isAdmin = isAdminRole(user?.role || "");
  const isOfficeOrAdmin = isAdmin || user?.role === "office_user";
  const weather = useWeather();

  // ─── Close mobile sidebar on route change (with brief delay for slide-out animation) ──
  const { setOpenMobile, openMobile } = useSidebar();
  const prevLocationRef = useRef(location);
  useEffect(() => {
    if (prevLocationRef.current !== location) {
      prevLocationRef.current = location;
      if (isMobile && openMobile) {
        // Small delay lets the user see the tap feedback before the sheet slides out
        const timer = setTimeout(() => setOpenMobile(false), 120);
        return () => clearTimeout(timer);
      }
    }
  }, [location]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Swipe-to-open sidebar gesture ─────────────────────────────────────────
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);

  useEffect(() => {
    if (!isMobile) return;

    const EDGE_ZONE = 30; // px from left edge
    const MIN_SWIPE = 50; // min horizontal distance

    const handleTouchStart = (e: globalThis.TouchEvent) => {
      const touch = e.touches[0];
      if (touch.clientX <= EDGE_ZONE && !openMobile) {
        // Swipe-to-open: start from left edge when closed
        touchStartX.current = touch.clientX;
        touchStartY.current = touch.clientY;
      } else if (openMobile) {
        // Swipe-to-close: start anywhere when open
        touchStartX.current = touch.clientX;
        touchStartY.current = touch.clientY;
      } else {
        touchStartX.current = null;
        touchStartY.current = null;
      }
    };

    const handleTouchEnd = (e: globalThis.TouchEvent) => {
      if (touchStartX.current === null || touchStartY.current === null) return;
      const touch = e.changedTouches[0];
      const dx = touch.clientX - touchStartX.current;
      const dy = Math.abs(touch.clientY - touchStartY.current);
      if (!openMobile && dx > MIN_SWIPE && dy < dx * 0.7) {
        // Swipe right to open
        setOpenMobile(true);
      } else if (openMobile && dx < -MIN_SWIPE && dy < Math.abs(dx) * 0.7) {
        // Swipe left to close
        setOpenMobile(false);
      }
      touchStartX.current = null;
      touchStartY.current = null;
    };

    document.addEventListener("touchstart", handleTouchStart, { passive: true });
    document.addEventListener("touchend", handleTouchEnd, { passive: true });
    return () => {
      document.removeEventListener("touchstart", handleTouchStart);
      document.removeEventListener("touchend", handleTouchEnd);
    };
  }, [isMobile, openMobile, setOpenMobile]);

   // ─── Inbox unread count for sidebar + bottom nav badge ────────────────────
  const unreadQuery = trpc.inbox.unreadCount.useQuery(undefined, {
    refetchInterval: 30000,
  });
  const unreadCount = (typeof unreadQuery.data === "number" ? unreadQuery.data : 0);

  // ─── Overdue jobs count for sidebar badge ──────────────────────────────
  const overdueQuery = trpc.construction.jobs.overdueCount.useQuery(undefined, {
    refetchInterval: 60000,
  });
  const overdueCount = overdueQuery.data?.count || 0;
  const { data: colourScheme } = trpc.globalSettings.getColourScheme.useQuery();

  // ─── Chat unread count for sidebar badge ──────────────────────────────
  const chatUnreadQuery = trpc.chat.getUnreadTotal.useQuery(undefined, {
    refetchInterval: 15000,
  });
  const chatUnreadCount = chatUnreadQuery.data?.total || 0;

  // ─── Notification sound/vibration on unread increase ──────────────────────
  useUnreadNotification(unreadCount + chatUnreadCount);

  // ─── Quick compose popover state ──────────────────────────────────────────
  const [quickComposeOpen, setQuickComposeOpen] = useState(false);

  // ─── Sidebar scroll position persistence ──────────────────────────────────
  const SCROLL_KEY = "sidebar-scroll-position";
  useEffect(() => {
    const el = sidebarContentRef.current;
    if (!el) return;
    // Restore saved scroll position
    const saved = sessionStorage.getItem(SCROLL_KEY);
    if (saved) el.scrollTop = parseInt(saved, 10);
    // Save scroll position on scroll (debounced)
    let timer: ReturnType<typeof setTimeout>;
    const handleScroll = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        sessionStorage.setItem(SCROLL_KEY, String(el.scrollTop));
      }, 100);
    };
    el.addEventListener("scroll", handleScroll, { passive: true });
    return () => { el.removeEventListener("scroll", handleScroll); clearTimeout(timer); };
  }, []);

  // ─── Collapsible section state (accordion: only one open at a time) ────────
  const SECTION_KEY = "sidebar-expanded-section";
  const sectionForPath = useCallback((path: string): string | null => {
    if (financeItems.some(i => path === i.path || (i.path !== "/" && path.startsWith(i.path)))) return "finance";
    if (reportingItems.some(i => path === i.path || (i.path !== "/" && path.startsWith(i.path)))) return "reporting";
    if (crmItems.some(i => path === i.path || (i.path !== "/" && path.startsWith(i.path)))) return "crm";
    if (path === "/sales" || salesItems.some(i => i.path !== "/" && i.path !== "/sales" && path.startsWith(i.path))) return "sales";
    if (approvalsItems.some(i => path === i.path || (i.path !== "/" && path.startsWith(i.path)))) return "approvals";
    if (daTrackerItems.some(i => path === i.path || (i.path !== "/" && path.startsWith(i.path))) || path.startsWith("/da-tracker")) return "daTracker";
    if (constructionItems.some(i => path === i.path || (i.path !== "/" && path.startsWith(i.path)))) return "construction";
    if (manufacturingItems.some(i => path === i.path || (i.path !== "/" && path.startsWith(i.path)))) return "manufacturing";
    if (inventoryItems.some(i => path === i.path || (i.path !== "/" && path.startsWith(i.path)))) return "inventory";
    if (inboxItems.some(i => path === i.path || (i.path !== "/" && path.startsWith(i.path)))) return "communications";
    if (helpItems.some(i => path === i.path || (i.path !== "/" && path.startsWith(i.path)))) return "support";
    if (adminItems.some(i => path === i.path || (i.path !== "/" && path.startsWith(i.path)))) return "admin";
    return null;
  }, []);

  // ─── Scoped sidebar mode: only show the active section's menu ─────────────
  const activeSection = useMemo(() => sectionForPath(location), [location, sectionForPath]);
  const isOnAppCentral = location === "/";
  const scopedMode = !isOnAppCentral && activeSection !== null;
  const activeAppSectionId = appSectionIdFromSidebarSection(activeSection);
  const activeAppSection = activeAppSectionId
    ? APP_SECTIONS.find(section => section.id === activeAppSectionId)
    : null;
  const sidebarNavColor = "#FFFFFF";
  const sidebarSectionHeaderFontSize = Math.min(16, Math.max(10, Number(colourScheme?.sidebarSectionHeaderFontSize || 12)));

  const [expandedSection, setExpandedSection] = useState<string | null>(() => {
    // Auto-expand section for current path, or restore from localStorage
    const fromPath = sectionForPath(location);
    if (fromPath) return fromPath;
    try {
      return localStorage.getItem(SECTION_KEY) || "sales";
    } catch { return "sales"; }
  });

  // Auto-expand section when navigating, collapse all when on App Central
  useEffect(() => {
    if (location === "/") {
      setExpandedSection(null);
      return;
    }
    const section = sectionForPath(location);
    if (section && section !== expandedSection) {
      setExpandedSection(section);
    }
  }, [location, sectionForPath]);

  // Persist expanded section
  useEffect(() => {
    if (expandedSection) {
      localStorage.setItem(SECTION_KEY, expandedSection);
    }
  }, [expandedSection]);

  const toggleSection = useCallback((section: string) => {
    setExpandedSection(prev => prev === section ? null : section);
  }, []);

  // Admin section uses expandedSection === "admin"
  const adminExpanded = expandedSection === "admin";
  const setAdminExpanded = useCallback((val: boolean) => {
    setExpandedSection(val ? "admin" : null);
  }, []);

  // Track which admin subgroups are expanded (auto-expand group containing active path)
  const [expandedAdminGroups, setExpandedAdminGroups] = useState<string[]>(() => {
    const activeGroup = adminGroups.find(g => g.items.some(i => location.startsWith(i.path)));
    return activeGroup ? [activeGroup.label] : [];
  });

  const toggleAdminGroup = useCallback((label: string) => {
    setExpandedAdminGroups(prev =>
      prev.includes(label) ? prev.filter(l => l !== label) : [...prev, label]
    );
  }, []);

  // Favourites
  const [favourites, setFavourites] = useState<string[]>(loadFavourites);

  const toggleFavourite = useCallback((path: string) => {
    setFavourites(prev => {
      const next = prev.includes(path) ? prev.filter(p => p !== path) : [...prev, path];
      saveFavourites(next);
      return next;
    });
  }, []);

  const favouriteItems = useMemo(() => {
    return favourites
      .map(path => allMenuItems.find(item => item.path === path))
      .filter(Boolean) as MenuItem[];
  }, [favourites]);

  // ─── Recently Visited (mobile sidebar) ─────────────────────────────────────
  const [recentlyVisited, setRecentlyVisited] = useState<string[]>(loadRecentlyVisited);

  useEffect(() => {
    if (location === "/") return; // Don't track App Central itself
    setRecentlyVisited(prev => {
      const filtered = prev.filter(p => p !== location);
      const next = [location, ...filtered].slice(0, MAX_RECENT);
      saveRecentlyVisited(next);
      return next;
    });
  }, [location]);

  const recentItems = useMemo(() => {
    return recentlyVisited
      .map(path => allMenuItems.find(item => item.path === path))
      .filter(Boolean) as MenuItem[];
  }, [recentlyVisited]);

  // ─── Push notification mutations ─────────────────────────────────────────
  const pushSubscribeMutation = trpc.push.subscribe.useMutation();
  const pushUnsubscribeMutation = trpc.push.unsubscribe.useMutation();

  // ─── Dynamic page title ─────────────────────────────────────────────────
  useEffect(() => {
    const matchedItem = allMenuItems.find(item =>
      location === item.path || (item.path !== "/" && location.startsWith(item.path))
    );
    const pageName = matchedItem?.label || "Dashboard";
    document.title = `AltaSpan | ${pageName}`;
  }, [location]);


  useEffect(() => {
    if (isCollapsed) setIsResizing(false);
  }, [isCollapsed]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;
      const sidebarLeft = sidebarRef.current?.getBoundingClientRect().left ?? 0;
      const newWidth = e.clientX - sidebarLeft;
      if (newWidth >= MIN_WIDTH && newWidth <= MAX_WIDTH) setSidebarWidth(newWidth);
    };
    const handleMouseUp = () => setIsResizing(false);
    if (isResizing) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    }
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [isResizing, setSidebarWidth]);

  const isActive = (path: string) => {
    if (path === "/") return location === "/";
    if (path === "/sales") return location === "/sales";
    return location.startsWith(path);
  };

  // Render a single menu item with optional favourite star
  const renderMenuItem = (item: MenuItem, showFavStar: boolean) => {
    const active = isActive(item.path);
    const isFav = favourites.includes(item.path);
    return (
      <SidebarMenuItem key={item.path}>
        <div className="relative group/fav">
          <SidebarMenuButton
            isActive={active}
            onClick={() => { if (isMobile && navigator.vibrate) navigator.vibrate(10); setLocation(item.path); if (isMobile) setOpenMobile(false); }}
            tooltip={item.label}
            className="h-9 text-[13px] font-normal pr-8"
          >
            <div className="relative">
              <item.icon className={`h-4 w-4 ${active ? "text-white" : "text-sidebar-foreground/60"}`} />
              {item.badge != null && item.badge > 0 && isCollapsed && (
                <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-1 flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold leading-none">
                  {item.badge > 99 ? "99+" : item.badge}
                </span>
              )}
            </div>
            <span>{item.label}</span>
            {item.badge != null && item.badge > 0 && !isCollapsed && (
              <span className="ml-auto min-w-[20px] h-5 px-1.5 flex items-center justify-center rounded-full bg-red-500 text-white text-[11px] font-bold leading-none">
                {item.badge > 99 ? "99+" : item.badge}
              </span>
            )}
          </SidebarMenuButton>
          {showFavStar && !isCollapsed && (
            <button
              onClick={(e) => { e.stopPropagation(); toggleFavourite(item.path); }}
              className={`absolute right-1.5 top-1/2 -translate-y-1/2 h-6 w-6 flex items-center justify-center rounded transition-all ${
                isFav
                  ? "text-white opacity-100"
                  : "text-sidebar-foreground/30 opacity-0 group-hover/fav:opacity-100 hover:text-white"
              }`}
              title={isFav ? "Remove from favourites" : "Add to favourites"}
            >
              <Star className={`h-3.5 w-3.5 ${isFav ? "fill-white" : ""}`} />
            </button>
          )}
        </div>
      </SidebarMenuItem>
    );
  };

  // Compute section badge counts
  const sectionBadges = useMemo(() => {
    const badges: Record<string, number> = {};
    if (overdueCount > 0) badges["construction"] = overdueCount;
    if (unreadCount > 0) badges["communications"] = unreadCount;
    return badges;
  }, [overdueCount, unreadCount]);

  // Render a collapsible section of menu items
  const renderCollapsibleSection = (sectionKey: string, label: string, items: MenuItem[], icon: LucideIcon) => {
    const isOpen = expandedSection === sectionKey;
    const hideSectionHeader = scopedMode && activeSection === sectionKey && !isCollapsed;
    const hasActive = items.some(i => isActive(i.path));
    const badge = sectionBadges[sectionKey];
    const SectionIcon = icon;
    const sectionHeaderAccent = sidebarNavColor;
    return (
      <div className="mb-0.5">
        {hideSectionHeader ? null : !isCollapsed ? (
          <button
            onClick={() => toggleSection(sectionKey)}
            className={`flex items-center justify-between w-full px-3 py-2 group/section hover:bg-sidebar-accent/30 rounded-md transition-colors ${
              hasActive && !isOpen ? "bg-sidebar-accent/20" : ""
            }`}
          >
            <div className="flex items-center gap-2">
              <SectionIcon
                className="h-3.5 w-3.5"
                style={{ color: sectionHeaderAccent }}
              />
              <p
                className="font-medium uppercase tracking-wider"
                style={{ color: sectionHeaderAccent, fontSize: `${sidebarSectionHeaderFontSize}px` }}
              >
                {label}
              </p>
              {badge != null && badge > 0 && !isOpen && (
                <span className="min-w-[16px] h-4 px-1 flex items-center justify-center rounded-full bg-red-500 text-white text-[9px] font-bold leading-none">
                  {badge > 99 ? "99+" : badge}
                </span>
              )}
            </div>
            <ChevronRight
              className={`h-3 w-3 transition-transform duration-200 ${isOpen ? "rotate-90" : ""}`}
              style={{ color: sectionHeaderAccent }}
            />
          </button>
        ) : (
          <div className="flex justify-center py-1.5 relative" title={label}>
            <SectionIcon
              className="h-4 w-4"
              style={{ color: sectionHeaderAccent }}
            />
            {badge != null && badge > 0 && (
              <span className="absolute top-0.5 right-1 min-w-[14px] h-3.5 px-0.5 flex items-center justify-center rounded-full bg-red-500 text-white text-[8px] font-bold leading-none">
                {badge > 9 ? "9+" : badge}
              </span>
            )}
          </div>
        )}
        {(hideSectionHeader || isOpen || isCollapsed) && (
          <SidebarMenu>
            {items.map(item => renderMenuItem(item, true))}
          </SidebarMenu>
        )}
      </div>
    );
  };

  const adminHasActive = adminItems.some(i => isActive(i.path));
  const adminHeaderAccent = sidebarNavColor;
  const hideAdminHeader = scopedMode && activeSection === "admin" && !isCollapsed;

  const WeatherIcon = weather ? getWeatherIcon(weather.weatherCode) : Thermometer;

  return (
    <>
      <div className="relative" ref={sidebarRef}>
        <Sidebar collapsible="icon" className="border-r-0" disableTransition={isResizing}>
          <SidebarHeader className="min-h-[4.5rem] justify-center">
            <div className="flex items-center gap-3 px-3 py-2 transition-all w-full">
              {(() => {
                const logo = loadCustomLogo();
                const appIconData = loadAppIcon();
                if (isCollapsed) {
                  return (
                    <button
                      onClick={() => { if (isMobile && navigator.vibrate) navigator.vibrate(10); setLocation("/"); }}
                      className="h-9 w-9 flex items-center justify-center hover:bg-sidebar-accent rounded-lg transition-colors focus:outline-none shrink-0"
                      title="App Central"
                    >
                      {appIconData ? (
                        <img src={appIconData.dataUrl} alt="App Logo" className="h-8 w-8 object-contain rounded" />
                      ) : logo ? (
                        <img src={logo.dataUrl} alt="Logo" className="h-8 w-8 object-contain rounded" />
                      ) : import.meta.env.VITE_APP_LOGO ? (
                        <img src={import.meta.env.VITE_APP_LOGO} alt="Altaspan" className="h-8 w-8 object-contain rounded" />
                      ) : (
                        <LayoutGrid className="h-4 w-4 text-sidebar-foreground/60" />
                      )}
                    </button>
                  );
                }
                return (
                    <button
                    onClick={() => { if (isMobile && navigator.vibrate) navigator.vibrate(10); setLocation("/"); }}
                    className="flex items-center justify-center hover:bg-sidebar-accent rounded-lg transition-colors focus:outline-none p-1"
                    title="App Central"
                  >
                    {appIconData ? (
                      <img src={appIconData.dataUrl} alt="App Logo" className="h-12 w-auto max-w-[180px] object-contain" />
                    ) : logo ? (
                      <img src={logo.dataUrl} alt="Logo" className="h-12 w-auto max-w-[180px] object-contain" />
                    ) : import.meta.env.VITE_APP_LOGO ? (
                      <img src={import.meta.env.VITE_APP_LOGO} alt="Altaspan" className="h-12 w-auto max-w-[180px] object-contain" />
                    ) : (
                      <LayoutGrid className="h-5 w-5 text-sidebar-foreground/60" />
                    )}
                  </button>
                );
              })()}
            </div>
          </SidebarHeader>

          <SidebarContent ref={sidebarContentRef} className="gap-0 px-2">
            {/* ─── Sticky section header (shows current section when scoped) ─── */}
            {scopedMode && activeSection && !isCollapsed && (
              <div className="sticky top-0 z-10 -mx-2 px-4 py-1.5 bg-sidebar/95 backdrop-blur-sm border-b border-sidebar-border/50 mb-1">
                <p
                  className="font-semibold uppercase tracking-widest"
                  style={{ color: sidebarNavColor, fontSize: `${sidebarSectionHeaderFontSize}px` }}
                >
                  {activeAppSection?.label || (activeSection === "crm" ? "CRM" : activeSection.charAt(0).toUpperCase() + activeSection.slice(1))}
                </p>
              </div>
            )}

            {/* ─── Favourites Section ─── */}
            {favouriteItems.length > 0 && !isCollapsed && (
              <div className="mb-1">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-white px-3 py-2 flex items-center gap-1">
                  <Star className="h-3 w-3 fill-white" />
                  Favourites
                </p>
                <SidebarMenu>
                  {favouriteItems.map(item => {
                    const active = isActive(item.path);
                    return (
                      <SidebarMenuItem key={`fav-${item.path}`}>
                        <div className="relative group/fav">
                          <SidebarMenuButton
                            isActive={active}
                            onClick={() => setLocation(item.path)}
                            tooltip={item.label}
                            className="h-9 text-[13px] font-normal pr-8"
                          >
                            <item.icon className={`h-4 w-4 ${active ? "text-white" : "text-sidebar-foreground/60"}`} />
                            <span>{item.label}</span>
                          </SidebarMenuButton>
                          <button
                            onClick={(e) => { e.stopPropagation(); toggleFavourite(item.path); }}
                            className="absolute right-1.5 top-1/2 -translate-y-1/2 h-6 w-6 flex items-center justify-center rounded text-white opacity-70 hover:opacity-100 transition-opacity"
                            title="Remove from favourites"
                          >
                            <Star className="h-3.5 w-3.5 fill-white" />
                          </button>
                        </div>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </div>
            )}

            {/* ─── Recently Visited (mobile only) ─── */}
            {isMobile && recentItems.length > 0 && !isCollapsed && (
              <div className="mb-1">
                <div className="flex items-center justify-between px-3 py-2">
                  <p className="text-[10px] font-medium uppercase tracking-wider text-sidebar-foreground/40 flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    Recently Visited
                  </p>
                  <button
                    onClick={() => { setRecentlyVisited([]); saveRecentlyVisited([]); }}
                    className="text-[9px] text-sidebar-foreground/30 hover:text-sidebar-foreground/60 transition-colors"
                    title="Clear history"
                  >
                    Clear
                  </button>
                </div>
                <SidebarMenu>
                  {recentItems.map(item => {
                    const active = location === item.path || (item.path !== "/" && location.startsWith(item.path));
                    return (
                      <SidebarMenuItem key={`recent-${item.path}`}>
                        <SidebarMenuButton
                          isActive={active}
                          onClick={() => { if (navigator.vibrate) navigator.vibrate(10); setLocation(item.path); }}
                          tooltip={item.label}
                          className="h-8 text-[12px] font-normal"
                        >
                          <item.icon className={`h-3.5 w-3.5 ${active ? "text-white" : "text-sidebar-foreground/50"}`} />
                          <span className="truncate">{item.label}</span>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </div>
            )}

            {/* ─── Scoped Sidebar: show only active section when inside a section ─── */}
            {(!scopedMode || activeSection === "crm") && (
              <>{/* ─── CRM ─── */}
              {renderCollapsibleSection("crm", "CRM", crmItems, Contact)}
              </>
            )}

            {(!scopedMode || activeSection === "sales") && (
              <>{/* ─── Sales ─── */}
              {renderCollapsibleSection("sales", "Sales", salesItems, LayoutDashboard)}
              </>
            )}

            {(!scopedMode || activeSection === "construction") && (
              <>{/* ─── Construction ─── */}
              {renderCollapsibleSection("construction", "Construction", constructionItems.map(item => {
                if (item.path === "/construction" && overdueCount > 0) return { ...item, badge: overdueCount };
                if (item.path === "/construction/chat" && chatUnreadCount > 0) return { ...item, badge: chatUnreadCount };
                return item;
              }), HardHat)}
              </>
            )}

            {(!scopedMode || activeSection === "approvals") && (
              <>{/* ─── Approvals ─── */}
              {renderCollapsibleSection("approvals", "Approvals", approvalsItems, ClipboardCheck)}
              </>
            )}

            {(!scopedMode || activeSection === "daTracker") && (
              <>{/* ─── DA Tracker ─── */}
              {renderCollapsibleSection("daTracker", "DA Tracker", daTrackerItems, MapPin)}
              </>
            )}

            {(!scopedMode || activeSection === "manufacturing") && (
              <>{/* ─── Manufacturing ─── */}
              {renderCollapsibleSection("manufacturing", "Manufacturing", manufacturingItems, Factory)}
              </>
            )}

            {(!scopedMode || activeSection === "inventory") && (
              <>{/* ─── Inventory ─── */}
              {renderCollapsibleSection("inventory", "Inventory", inventoryItems, Warehouse)}
              </>
            )}

            {isOfficeOrAdmin && (!scopedMode || activeSection === "finance") && (
              <>{/* ─── Finance ─── */}
              {renderCollapsibleSection("finance", "Finance", financeItems, Wallet)}
              </>
            )}

            {isOfficeOrAdmin && (!scopedMode || activeSection === "reporting") && (
              <>{/* ─── Reporting ─── */}
              {renderCollapsibleSection("reporting", "Reporting", reportingItems, BarChart3)}
              </>
            )}

            {(!scopedMode || activeSection === "communications") && (
              <>{/* ─── Communications ─── */}
              {renderCollapsibleSection("communications", "Communications", inboxItems.map(item =>
                item.path === "/inbox" && unreadCount > 0
                  ? { ...item, badge: unreadCount }
                  : item
              ), Mail)}
              </>
            )}

            {(!scopedMode || activeSection === "support") && (
              <>{/* ─── Help (available to all users) ─── */}
              {renderCollapsibleSection("support", "Support", helpItems, HelpCircle)}
              </>
            )}

            {/* ─── Admin (collapsible with grouped submenus) ─── */}
            {isAdmin && (!scopedMode || activeSection === "admin") && (
              <div className="mb-0.5">
                {hideAdminHeader ? null : !isCollapsed ? (
                  <button
                    onClick={() => setAdminExpanded(!adminExpanded)}
                    className={`flex items-center justify-between w-full px-3 py-2 group/admin hover:bg-sidebar-accent/30 rounded-md transition-colors ${
                      adminHasActive && !adminExpanded ? "bg-sidebar-accent/20" : ""
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Shield
                        className="h-3.5 w-3.5"
                        style={{ color: adminHeaderAccent }}
                      />
                      <p
                        className="font-medium uppercase tracking-wider"
                        style={{ color: adminHeaderAccent, fontSize: `${sidebarSectionHeaderFontSize}px` }}
                      >
                        Admin
                      </p>
                    </div>
                    <ChevronRight
                      className={`h-3 w-3 transition-transform duration-200 ${adminExpanded ? "rotate-90" : ""}`}
                      style={{ color: adminHeaderAccent }}
                    />
                  </button>
                ) : (
                  <div className="flex justify-center py-1.5" title="Admin">
                    <Shield
                      className="h-4 w-4"
                      style={{ color: adminHeaderAccent }}
                    />
                  </div>
                )}
                {(hideAdminHeader || adminExpanded || isCollapsed) && (
                  <SidebarMenu>
                    {adminGroups.map(group => {
                      const groupExpanded = expandedAdminGroups.includes(group.label);
                      const groupHasActive = group.items.some(i => isActive(i.path));
                      return (
                        <Collapsible
                          key={group.label}
                          open={groupExpanded}
                          onOpenChange={() => toggleAdminGroup(group.label)}
                          className="group/collapsible"
                        >
                          <SidebarMenuItem>
                            <CollapsibleTrigger asChild>
                              <SidebarMenuButton
                                tooltip={group.label}
                                className={`h-9 text-[13px] font-normal ${
                                  groupHasActive ? "text-white font-medium" : ""
                                }`}
                              >
                                <group.icon className={`h-4 w-4 ${
                                  groupHasActive ? "text-white" : "text-sidebar-foreground/80"
                                }`} />
                                <span className="flex-1">{group.label}</span>
                                <ChevronRight className={`h-3 w-3 text-sidebar-foreground/70 transition-transform duration-200 ${
                                  groupExpanded ? "rotate-90" : ""
                                }`} />
                              </SidebarMenuButton>
                            </CollapsibleTrigger>
                            <CollapsibleContent>
                              <SidebarMenuSub>
                                {group.items.map(item => {
                                  const active = isActive(item.path);
                                  const isFav = favourites.includes(item.path);
                                  return (
                                    <SidebarMenuSubItem key={item.path}>
                                      <div className="relative group/fav">
                                        <SidebarMenuSubButton
                                          size="sm"
                                          isActive={active}
                                          onClick={() => {
                                            if (isMobile && navigator.vibrate) navigator.vibrate(10);
                                            setLocation(item.path);
                                            if (isMobile) setOpenMobile(false);
                                          }}
                                          className="cursor-pointer pr-7"
                                        >
                                          <item.icon className={`h-3.5 w-3.5 ${
                                            active ? "text-white" : "text-sidebar-foreground/50"
                                          }`} />
                                          <span>{item.label}</span>
                                        </SidebarMenuSubButton>
                                        {!isCollapsed && (
                                          <button
                                            onClick={(e) => { e.stopPropagation(); toggleFavourite(item.path); }}
                                            className={`absolute right-1 top-1/2 -translate-y-1/2 h-5 w-5 flex items-center justify-center rounded transition-all ${
                                              isFav
                                                ? "text-white opacity-100"
                                                : "text-sidebar-foreground/30 opacity-0 group-hover/fav:opacity-100 hover:text-white"
                                            }`}
                                            title={isFav ? "Remove from favourites" : "Add to favourites"}
                                          >
                                            <Star className={`h-3 w-3 ${isFav ? "fill-white" : ""}`} />
                                          </button>
                                        )}
                                      </div>
                                    </SidebarMenuSubItem>
                                  );
                                })}
                              </SidebarMenuSub>
                            </CollapsibleContent>
                          </SidebarMenuItem>
                        </Collapsible>
                      );
                    })}
                  </SidebarMenu>
                )}
              </div>
            )}
          </SidebarContent>

          <SidebarFooter className="p-3">
            {/* ─── Weather Widget with 7-day forecast ─── */}
            {weather && !isCollapsed && (
              <div className="mb-2 px-2 py-2 rounded-lg bg-sidebar-accent/30">
                <div className="flex items-center gap-2.5 mb-2">
                  <WeatherIcon className="h-5 w-5 text-sidebar-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium text-sidebar-foreground leading-none">
                      {weather.temperature}°C
                    </p>
                    <p className="text-[10px] text-sidebar-foreground/80 mt-0.5 truncate">
                      {getWeatherLabel(weather.weatherCode)} · {weather.windSpeed} km/h
                    </p>
                  </div>
                  <span className="text-[9px] text-sidebar-foreground/70 shrink-0">Canberra</span>
                </div>
                {weather.daily.length > 0 && (
                  <div className="grid grid-cols-7 gap-0.5 pt-1.5 border-t border-sidebar-border/30">
                    {weather.daily.slice(0, 7).map((day) => {
                      const DayIcon = getWeatherIcon(day.weatherCode);
                      return (
                        <div key={day.date} className="flex flex-col items-center gap-0.5 py-1">
                          <span className="text-[8px] text-sidebar-foreground/70 leading-none">{getShortDay(day.date)}</span>
                          <DayIcon className="h-3 w-3 text-sidebar-foreground/90" />
                          <span className="text-[8px] font-medium text-sidebar-foreground leading-none">{day.tempMax}°</span>
                          <span className="text-[8px] text-sidebar-foreground/60 leading-none">{day.tempMin}°</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
            {weather && isCollapsed && (
              <div className="flex justify-center mb-2" title={`${weather.temperature}°C ${getWeatherLabel(weather.weatherCode)}`}>
                <WeatherIcon className="h-4 w-4 text-sidebar-foreground" />
              </div>
            )}

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-3 rounded-lg px-1 py-1.5 hover:bg-sidebar-accent/50 transition-colors w-full text-left group-data-[collapsible=icon]:justify-center focus:outline-none">
                  <Avatar className="h-8 w-8 border border-sidebar-border shrink-0">
                    <AvatarFallback className="text-xs font-medium bg-sidebar-primary/20 text-sidebar-primary">
                      {user?.name?.charAt(0).toUpperCase() || "?"}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0 group-data-[collapsible=icon]:hidden">
                    <p className="text-[13px] font-medium truncate leading-none text-sidebar-foreground">
                      {user?.name || "User"}
                    </p>
                    <p className="text-[11px] text-sidebar-foreground/50 truncate mt-1">
                      {ROLE_LABELS[(user?.role || "user") as UserRole] || user?.role}
                    </p>
                  </div>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem className="text-xs text-muted-foreground cursor-default">
                  {user?.email || "No email"}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => window.location.href = "/profile"}
                  className="cursor-pointer"
                >
                  <User className="mr-2 h-4 w-4" />
                  My Profile
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={logout}
                  className="cursor-pointer text-destructive focus:text-destructive"
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            {!isCollapsed && (
              <p className="text-[9px] text-sidebar-foreground/30 text-center mt-2 select-none">
                © Anthony Commisso 2026. All rights reserved.
              </p>
            )}
          </SidebarFooter>
        </Sidebar>
        <div
          className={`absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-sidebar-primary/20 transition-colors ${isCollapsed ? "hidden" : ""}`}
          onMouseDown={() => { if (!isCollapsed) setIsResizing(true); }}
          style={{ zIndex: 50 }}
        />
      </div>

      <SidebarInset>
        <div className="flex border-b h-14 items-center justify-between bg-background/95 px-2 sm:px-4 backdrop-blur sticky top-0 z-40">
          <div className="flex items-center gap-2">
            {isMobile ? (
              <button
                onClick={toggleSidebar}
                className="h-9 w-9 flex items-center justify-center rounded-lg hover:bg-accent transition-colors"
                aria-label="Open menu"
              >
                <Menu className="h-5 w-5 text-muted-foreground" />
              </button>
            ) : (
              <button
                onClick={toggleSidebar}
                className="h-9 w-9 flex items-center justify-center rounded-lg hover:bg-accent transition-colors"
                title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              >
                <PanelLeft className={`h-4 w-4 text-muted-foreground transition-transform ${isCollapsed ? "rotate-180" : ""}`} />
              </button>
            )}
            {/* All Apps button */}
            <button
              onClick={() => { if (isMobile && navigator.vibrate) navigator.vibrate(10); setLocation("/"); }}
              className="h-8 px-2.5 flex items-center gap-1.5 rounded-md hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
              title="All Apps"
            >
              <LayoutGrid className="h-4 w-4" />
              <span className="text-xs font-medium hidden sm:inline">All Apps</span>
            </button>
            {/* Breadcrumb */}
            {(() => {
              const sectionId = getSectionForPath(location);
              const section = sectionId ? APP_SECTIONS.find(s => s.id === sectionId) : null;
              const matchedPage = allMenuItems.find(item =>
                location === item.path || (item.path !== "/" && location.startsWith(item.path))
              );
              if (!section && location === "/") return null;
              return (
                <Breadcrumb className="hidden sm:flex">
                  <BreadcrumbList className="text-xs">
                    <BreadcrumbItem>
                      <BreadcrumbLink
                        href="/"
                        onClick={(e) => { e.preventDefault(); setLocation("/"); }}
                        className="text-muted-foreground hover:text-foreground cursor-pointer"
                      >
                        App Central
                      </BreadcrumbLink>
                    </BreadcrumbItem>
                    {section && (
                      <>
                        <BreadcrumbSeparator />
                        {matchedPage && matchedPage.label !== section.label ? (
                          <BreadcrumbItem>
                            <BreadcrumbLink
                              href={section.path}
                              onClick={(e) => { e.preventDefault(); setLocation(section.path); }}
                              className="text-muted-foreground hover:text-foreground cursor-pointer"
                            >
                              {section.label}
                            </BreadcrumbLink>
                          </BreadcrumbItem>
                        ) : (
                          <BreadcrumbItem>
                            <BreadcrumbPage>{section.label}</BreadcrumbPage>
                          </BreadcrumbItem>
                        )}
                      </>
                    )}
                    {matchedPage && section && matchedPage.label !== section.label && (
                      <>
                        <BreadcrumbSeparator />
                        <BreadcrumbItem>
                          <BreadcrumbPage>{matchedPage.label}</BreadcrumbPage>
                        </BreadcrumbItem>
                      </>
                    )}
                  </BreadcrumbList>
                </Breadcrumb>
              );
            })()}
          </div>
          <div className="flex-1 max-w-md mx-2 sm:mx-4">
            <GlobalSearch />
          </div>
          <div className="flex items-center gap-1">
            {/* Messages icon with unread badge */}
            <button
              onClick={() => setLocation("/inbox")}
              className="relative h-9 w-9 flex items-center justify-center rounded-lg hover:bg-accent transition-colors"
              title="Messages"
              aria-label="Messages"
            >
              <MessageSquare className="h-5 w-5 text-muted-foreground" />
              {(unreadCount + chatUnreadCount) > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 flex items-center justify-center rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold leading-none">
                  {(unreadCount + chatUnreadCount) > 99 ? "99+" : (unreadCount + chatUnreadCount)}
                </span>
              )}
            </button>
            <OverdueAlerts />
          </div>
        </div>
        {/* Push Notification Opt-In */}
        <PushNotificationOptIn
          vapidPublicKey={import.meta.env.VITE_VAPID_PUBLIC_KEY}
          onSubscribe={async (params) => {
            await pushSubscribeMutation.mutateAsync(params);
          }}
          onUnsubscribe={async (params) => {
            await pushUnsubscribeMutation.mutateAsync(params);
          }}
        />
        <QuickActions />
        <main className="flex-1 p-4 sm:p-6 pb-20 md:pb-6">{children}</main>
        <ScrollToTop />

        {/* ─── Floating Chat Icon with Quick Compose (desktop only) ─── */}
        {!isMobile && (unreadCount + chatUnreadCount) >= 0 && (
          <div className="fixed bottom-6 right-6 z-50">
            <Popover open={quickComposeOpen} onOpenChange={setQuickComposeOpen}>
              <PopoverTrigger asChild>
                <button
                  className="relative h-14 w-14 rounded-full bg-primary text-primary-foreground shadow-lg hover:shadow-xl hover:scale-105 transition-all flex items-center justify-center"
                  title="Quick Compose"
                  aria-label="Quick compose email"
                  onClick={(e) => {
                    // Right-click or long-press navigates to inbox
                    if (e.ctrlKey || e.metaKey) {
                      e.preventDefault();
                      setLocation("/inbox");
                    }
                  }}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setLocation("/inbox");
                  }}
                >
                  <MessageSquare className="h-6 w-6" />
                  {(unreadCount + chatUnreadCount) > 0 && (
                    <span className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1.5 flex items-center justify-center rounded-full bg-destructive text-destructive-foreground text-[11px] font-bold leading-none shadow-sm">
                      {(unreadCount + chatUnreadCount) > 99 ? "99+" : (unreadCount + chatUnreadCount)}
                    </span>
                  )}
                </button>
              </PopoverTrigger>
              <PopoverContent side="top" align="end" sideOffset={12} className="w-auto p-4">
                <QuickCompose onClose={() => setQuickComposeOpen(false)} />
              </PopoverContent>
            </Popover>
            {/* Link to full inbox below the button */}
            <button
              onClick={() => setLocation("/inbox")}
              className="absolute -bottom-6 left-1/2 -translate-x-1/2 text-[10px] text-muted-foreground hover:text-foreground transition-colors whitespace-nowrap"
            >
              Open Inbox
            </button>
          </div>
        )}

        {/* ─── Mobile Bottom Navigation Bar ─── */}
        {isMobile && (
          <nav className="fixed bottom-0 left-0 right-0 z-50 bg-background/95 backdrop-blur border-t md:hidden" style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
            <div className="flex items-center justify-around h-14">
              {[
                { href: "/", label: "App Central", icon: LayoutDashboard },
                { href: "/construction/clients", label: "Active Jobs", icon: Users },
                { href: "/construction", label: "Construction", icon: HardHat },
                { href: "/inbox", label: "Inbox", icon: Inbox },
              ].map((item) => {
                const active = item.href === "/" ? location === "/" : location.startsWith(item.href);
                const showBadge = item.label === "Inbox" && unreadCount > 0;
                return (
                  <Link key={item.href} href={item.href}>
                    <div className={`flex flex-col items-center gap-0.5 px-3 py-1 cursor-pointer relative transition-colors ${
                      active ? "text-[#C9AB57]" : "text-muted-foreground"
                    }`}>
                      {active && <span className="absolute top-0 left-1/2 -translate-x-1/2 w-6 h-[3px] rounded-full bg-[#C9AB57]" />}
                      <item.icon className="h-5 w-5" />
                      <span className="text-[10px] font-medium">{item.label}</span>
                      {showBadge && (
                        <span className="absolute -top-0.5 right-0.5 w-4 h-4 bg-destructive text-destructive-foreground text-[9px] rounded-full flex items-center justify-center font-bold">
                          {unreadCount > 9 ? "9+" : unreadCount}
                        </span>
                      )}
                    </div>
                  </Link>
                );
              })}
            </div>
          </nav>
        )}
      </SidebarInset>

      {/* PWA Install Prompt */}
      <PWAInstallPrompt />
    </>
  );
}
