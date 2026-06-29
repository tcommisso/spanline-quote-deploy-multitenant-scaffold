import { useTradePortal } from "@/contexts/TradePortalContext";
import { useLocation, Link, Redirect } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import {
  LayoutDashboard, CalendarDays, CalendarCheck, User, Receipt,
  FileUp, Newspaper, Camera, MessageSquare, MessagesSquare, LogOut, Menu, X, ChevronRight, FileSignature, FileText,
  ClipboardCheck, ShieldCheck, Briefcase,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import PWAInstallPrompt from "@/components/PWAInstallPrompt";
import { PushNotificationOptIn } from "@/components/PushNotificationOptIn";

type TradeNavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
};

type TradeNavGroup = {
  label: string | null;
  items: TradeNavItem[];
};

const primaryNavItems: TradeNavItem[] = [
  { href: "/trade-portal/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/trade-portal/schedule", label: "Schedule", icon: CalendarDays },
  { href: "/trade-portal/jobs", label: "Job Details", icon: Briefcase },
  { href: "/trade-portal/invoices", label: "Invoices", icon: FileUp },
  { href: "/trade-portal/news", label: "News", icon: Newspaper },
  { href: "/trade-portal/photos", label: "Photos", icon: Camera },
  { href: "/trade-portal/messages", label: "Messages", icon: MessageSquare },
  { href: "/trade-portal/chat", label: "Team Chat", icon: MessagesSquare },
];

const profileNavItems: TradeNavItem[] = [
  { href: "/trade-portal/availability", label: "Availability", icon: CalendarCheck },
  { href: "/trade-portal/contact", label: "Contact", icon: User },
];

const resourceNavItems: TradeNavItem[] = [
  { href: "/trade-portal/remittances", label: "Remittances", icon: Receipt },
  { href: "/trade-portal/contracts", label: "My Contracts", icon: FileSignature },
  { href: "/trade-portal/inductions", label: "Inductions", icon: ClipboardCheck },
];

const flashingOrdersNavItem: TradeNavItem = { href: "/trade-portal/flashing-orders", label: "Flashing Orders", icon: FileText };
const whsNavItem: TradeNavItem = { href: "/trade-portal/whs", label: "WH&S", icon: ShieldCheck };

// Bottom nav shows the 5 most important items on mobile
const bottomNavItems = [
  { href: "/trade-portal/dashboard", label: "Home", icon: LayoutDashboard },
  { href: "/trade-portal/schedule", label: "Schedule", icon: CalendarDays },
  { href: "/trade-portal/news", label: "News", icon: Newspaper },
  { href: "/trade-portal/chat", label: "Chat", icon: MessagesSquare },
  { href: "/trade-portal/photos", label: "Photos", icon: Camera },
];

export default function TradePortalLayout({ children }: { children: ReactNode }) {
  const { user, isLoading, isAuthenticated, sessionToken, logout } = useTradePortal();
  const [location] = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const unreadQuery = trpc.tradePortal.getUnreadCount.useQuery(undefined, {
    refetchInterval: 30000,
  });
  const chatUnreadQuery = trpc.tradePortal.chatUnreadTotal.useQuery(undefined, {
    refetchInterval: 15000,
  });
  const chatUnreadCount = chatUnreadQuery.data?.total || 0;
  const { data: whsDocs } = trpc.whs.tradePortalDocs.useQuery();
  const { data: branding } = trpc.tradePortal.getBranding.useQuery();
  const flashingAccessQuery = trpc.tradePortal.getFlashingOrderAccess.useQuery(undefined, {
    enabled: !!sessionToken,
    retry: false,
  });

  const navGroups = useMemo<TradeNavGroup[]>(() => {
    const primaryItems = [...primaryNavItems];
    if (flashingAccessQuery.data?.enabled) {
      const insertAfterJobs = primaryItems.findIndex(i => i.href === "/trade-portal/jobs");
      primaryItems.splice(insertAfterJobs >= 0 ? insertAfterJobs + 1 : primaryItems.length, 0, flashingOrdersNavItem);
    }
    const resources = [...resourceNavItems];
    if (whsDocs && whsDocs.length > 0) {
      resources.push(whsNavItem);
    }
    return [
      { label: null, items: primaryItems },
      { label: "Profile", items: profileNavItems },
      { label: "Resources", items: resources },
    ];
  }, [flashingAccessQuery.data?.enabled, whsDocs]);

  const navItems = useMemo(() => navGroups.flatMap(group => group.items), [navGroups]);

  // Set dynamic page title
  useEffect(() => {
    const currentNav = navItems.find(i => i.href === location);
    const pageName = currentNav?.label || "Trade Portal";
    const company = branding?.companyName || "Trade Portal";
    document.title = `${company} | ${pageName}`;
  }, [location, branding?.companyName, navItems]);

  // Set favicon from company app icon
  useEffect(() => {
    if (branding?.appIconUrl) {
      let link = document.querySelector("link[rel='icon']") as HTMLLinkElement | null;
      if (!link) {
        link = document.createElement("link");
        link.rel = "icon";
        document.head.appendChild(link);
      }
      link.href = branding.appIconUrl;
      // Also set apple-touch-icon
      let appleLink = document.querySelector("link[rel='apple-touch-icon']") as HTMLLinkElement | null;
      if (!appleLink) {
        appleLink = document.createElement("link");
        appleLink.rel = "apple-touch-icon";
        document.head.appendChild(appleLink);
      }
      appleLink.href = branding.appIconUrl;
    }
  }, [branding?.appIconUrl]);

  // Mark news as viewed when navigating to news page
  useEffect(() => {
    if (location === "/trade-portal/news" && unreadNewsCount > 0) {
      markNewsViewed.mutate();
    }
  }, [location]);

  const unreadCount = unreadQuery.data?.count || 0;
  const unreadNewsCount = unreadQuery.data?.news || 0;
  const pushSubscribeMutation = trpc.tradePortal.pushSubscribe.useMutation();
  const pushUnsubscribeMutation = trpc.tradePortal.pushUnsubscribe.useMutation();
  const markNewsViewed = trpc.tradePortal.markNewsViewed.useMutation({
    onSuccess: () => unreadQuery.refetch(),
  });

  // Redirect to login if not authenticated and not loading
  if (!isLoading && !isAuthenticated && !sessionToken) {
    return <Redirect to="/trade-portal/login" />;
  }

  const displayName = branding?.companyName || "Trade Portal";
  const logoUrl = branding?.logoUrl || null;
  const isNavItemActive = (href: string) => location === href || (href !== "/trade-portal/dashboard" && location.startsWith(`${href}/`));
  const getNavBadgeCount = (label: string) => {
    if (label === "Messages") return unreadCount;
    if (label === "News") return unreadNewsCount;
    if (label === "Team Chat") return chatUnreadCount;
    return 0;
  };

  return (
    <div className="min-h-screen bg-background pb-16 md:pb-0">
      {/* Header */}
      <header className="bg-card border-b border-border sticky top-0 z-50">
        <div className="flex items-center justify-between h-14 px-4 max-w-7xl mx-auto">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </Button>
            <Link href="/trade-portal/dashboard">
              <span className="flex items-center gap-2 cursor-pointer">
                {logoUrl ? (
                  <img src={logoUrl} alt={displayName} className="h-8 w-auto max-w-[140px] object-contain" />
                ) : (
                  <span className="font-bold text-lg text-primary">{displayName}</span>
                )}
              </span>
            </Link>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <span className="text-sm text-muted-foreground hidden sm:inline truncate max-w-[150px]">
              {user?.installerName}
            </span>
            {user?.tradeType && (
              <Badge variant="outline" className="hidden lg:inline-flex border-primary/30 text-primary bg-primary/5">
                {user.tradeType}
              </Badge>
            )}
            <Button variant="ghost" size="sm" onClick={logout} className="text-xs sm:text-sm">
              <LogOut className="w-4 h-4 sm:mr-1" />
              <span className="hidden sm:inline">Logout</span>
            </Button>
          </div>
        </div>
      </header>

      {/* Mobile Slide-over Navigation (Sheet overlay) */}
      <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
        <SheetContent side="left" className="w-72 p-0 [&>button]:hidden">
          <SheetHeader className="sr-only">
            <SheetTitle>Navigation</SheetTitle>
            <SheetDescription>Trade portal navigation menu</SheetDescription>
          </SheetHeader>
          {/* Company branding + user info in mobile menu */}
          <div className="p-4 border-b bg-primary/5">
            {logoUrl ? (
              <img src={logoUrl} alt={displayName} className="h-8 w-auto max-w-[160px] object-contain mb-2" />
            ) : (
              <p className="font-bold text-sm text-primary mb-1">{displayName}</p>
            )}
            <p className="font-medium text-sm text-foreground truncate">{user?.installerName}</p>
            {user?.tradeType && (
              <p className="text-xs text-muted-foreground mt-0.5">{user.tradeType}</p>
            )}
          </div>
          <div className="p-3 overflow-y-auto flex-1">
            {navGroups.map((group) => (
              <div key={group.label || "primary"} className={group.label ? "mt-4" : ""}>
                {group.label && (
                  <div className="px-3 pb-1 text-xs font-semibold uppercase text-muted-foreground">
                    {group.label}
                  </div>
                )}
                <div className="space-y-0.5">
                  {group.items.map((item) => {
                    const badgeCount = getNavBadgeCount(item.label);
                    const isActive = isNavItemActive(item.href);
                    return (
                      <Link key={item.href} href={item.href}>
                        <div
                          className={`flex items-center gap-3 px-3 py-3 rounded-lg text-sm cursor-pointer transition-colors ${
                            isActive
                              ? "bg-primary/10 text-primary font-medium"
                              : "text-muted-foreground hover:bg-muted active:bg-accent"
                          }`}
                          onClick={() => { setMobileMenuOpen(false); if (navigator.vibrate) navigator.vibrate(10); }}
                        >
                          <item.icon className="w-5 h-5 shrink-0" />
                          <span className="flex-1">{item.label}</span>
                          {badgeCount > 0 && (
                            <Badge className="bg-primary text-primary-foreground text-xs px-1.5 py-0">
                              {badgeCount}
                            </Badge>
                          )}
                          <ChevronRight className="w-4 h-4 text-muted-foreground" />
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </SheetContent>
      </Sheet>

      {/* Desktop Layout */}
      <div className="max-w-7xl mx-auto px-4 py-4 md:py-6 flex gap-6">
        {/* Desktop Sidebar */}
        <nav className="hidden md:block w-56 shrink-0" data-tour="trade-nav">
          <div className="sticky top-20">
            {navGroups.map((group) => (
              <div key={group.label || "primary"} className={group.label ? "mt-5" : ""}>
                {group.label && (
                  <div className="px-3 pb-1.5 text-xs font-semibold uppercase text-muted-foreground">
                    {group.label}
                  </div>
                )}
                <div className="space-y-1">
                  {group.items.map((item) => {
                    const badgeCount = getNavBadgeCount(item.label);
                    const isActive = isNavItemActive(item.href);
                    return (
                      <Link key={item.href} href={item.href}>
                        <div
                          className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm cursor-pointer transition-colors ${
                            isActive
                              ? "bg-primary/10 text-primary font-medium"
                              : "text-muted-foreground hover:bg-muted"
                          }`}
                        >
                          <item.icon className="w-4 h-4 shrink-0" />
                          <span className="flex-1">{item.label}</span>
                          {badgeCount > 0 && (
                            <Badge className="ml-auto bg-primary text-primary-foreground text-xs px-1.5 py-0">
                              {badgeCount}
                            </Badge>
                          )}
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </nav>

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

        {/* Main Content */}
        <main className="flex-1 min-w-0">
          {children}
        </main>
      </div>

      {/* Mobile Bottom Navigation Bar */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 bg-card border-t border-border md:hidden safe-area-bottom">
        <div className="flex items-center justify-around h-16">
          {bottomNavItems.map((item) => {
            const isActive = location === item.href;
            const showBadge = (item.label === "Messages" && unreadCount > 0) || (item.label === "News" && unreadNewsCount > 0) || (item.label === "Chat" && chatUnreadCount > 0);
            return (
              <Link key={item.href} href={item.href}>
                <div className={`flex flex-col items-center gap-0.5 px-3 py-1 cursor-pointer relative ${
                  isActive ? "text-accent-foreground" : "text-muted-foreground"
                }`}>
                  {isActive && (
                    <span className="absolute -top-px left-1/2 -translate-x-1/2 w-8 h-0.5 bg-accent rounded-full" />
                  )}
                  <item.icon className={`w-5 h-5 ${isActive ? "text-accent" : ""}`} />
                  <span className={`text-[10px] font-medium ${isActive ? "text-accent" : ""}`}>{item.label}</span>
                  {showBadge && (
                    <span className="absolute -top-0.5 right-0.5 w-4 h-4 bg-primary text-primary-foreground text-[9px] rounded-full flex items-center justify-center font-bold">
                      {item.label === "News"
                        ? (unreadNewsCount > 9 ? "9+" : unreadNewsCount)
                        : item.label === "Chat"
                        ? (chatUnreadCount > 9 ? "9+" : chatUnreadCount)
                        : (unreadCount > 9 ? "9+" : unreadCount)}
                    </span>
                  )}
                </div>
              </Link>
            );
          })}
          {/* More button to open full menu */}
          <div
            className="flex flex-col items-center gap-0.5 px-3 py-1 cursor-pointer text-muted-foreground"
            onClick={() => setMobileMenuOpen(true)}
          >
            <Menu className="w-5 h-5" />
            <span className="text-[10px] font-medium">More</span>
          </div>
        </div>
      </nav>

      {/* PWA Install Prompt */}
      <PWAInstallPrompt />
    </div>
  );
}
