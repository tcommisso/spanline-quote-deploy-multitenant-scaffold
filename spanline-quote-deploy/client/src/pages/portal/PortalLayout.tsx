import { usePortal } from "@/contexts/PortalContext";
import { useLocation, Link, Redirect } from "wouter";
import { Button } from "@/components/ui/button";
import {
  Home, FileText, DollarSign, Users, ClipboardList,
  AlertTriangle, Wrench, CheckCircle2, Newspaper, ShoppingBag, LogOut, Menu, X, MessageSquare, Settings, ChevronRight, ImageIcon, PenTool
} from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { trpc } from "@/lib/trpc";
import { ShieldCheck } from "lucide-react";
import PWAInstallPrompt from "@/components/PWAInstallPrompt";
import { PushNotificationOptIn } from "@/components/PushNotificationOptIn";

const baseNavItems = [
  { href: "/portal/dashboard", label: "Dashboard", icon: Home },
  { href: "/portal/updates", label: "Updates", icon: MessageSquare },
  { href: "/portal/documents", label: "Documents", icon: FileText },
  { href: "/portal/invoices", label: "Invoices", icon: DollarSign },
  { href: "/portal/contacts", label: "Contacts", icon: Users },
  { href: "/portal/variations", label: "Variations", icon: ClipboardList },
  { href: "/portal/defects", label: "Defects", icon: AlertTriangle },
  { href: "/portal/maintenance", label: "Maintenance", icon: Wrench },
  { href: "/portal/plans", label: "Plans", icon: PenTool },
  { href: "/portal/renders", label: "Design Renders", icon: ImageIcon },
  { href: "/portal/subscription", label: "Care Plans", icon: CheckCircle2 },
  { href: "/portal/news", label: "News", icon: Newspaper },
  { href: "/portal/products", label: "Products", icon: ShoppingBag },
  { href: "/portal/settings", label: "Settings", icon: Settings },
];

// Bottom nav shows the 5 most important items on mobile
const bottomNavItems = [
  { href: "/portal/dashboard", label: "Home", icon: Home },
  { href: "/portal/updates", label: "Updates", icon: MessageSquare },
  { href: "/portal/documents", label: "Docs", icon: FileText },
  { href: "/portal/invoices", label: "Invoices", icon: DollarSign },
];

export default function PortalLayout({ children }: { children: ReactNode }) {
  const { user, isLoading, isAuthenticated, sessionToken, logout } = usePortal();
  const [location] = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { data: whsDocs } = trpc.whs.clientPortalDocs.useQuery();
  const { data: branding } = trpc.portal.getBranding.useQuery();
  const { data: badgeCounts } = trpc.portal.getBadgeCounts.useQuery(undefined, {
    refetchInterval: 60000,
  });
  const markViewed = trpc.portal.markSectionViewed.useMutation({
    onSuccess: () => utils.portal.getBadgeCounts.invalidate(),
  });
  const utils = trpc.useUtils();
  const pushSubscribeMutation = trpc.portal.pushSubscribe.useMutation();
  const pushUnsubscribeMutation = trpc.portal.pushUnsubscribe.useMutation();

  // Mark section as viewed when navigating to it
  useEffect(() => {
    if (location === "/portal/documents" && badgeCounts?.documents) {
      markViewed.mutate({ section: "documents" });
    } else if (location === "/portal/invoices" && badgeCounts?.invoices) {
      markViewed.mutate({ section: "invoices" });
    } else if (location === "/portal/updates" && badgeCounts?.updates) {
      markViewed.mutate({ section: "updates" });
    }
  }, [location]);

  // Set dynamic page title
  useEffect(() => {
    const currentNav = [...baseNavItems].find(i => i.href === location);
    const pageName = currentNav?.label || "Portal";
    const company = branding?.companyName || "Portal";
    document.title = `${company} | ${pageName}`;
  }, [location, branding?.companyName]);

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

  const navItems = useMemo(() => {
    const items = [...baseNavItems];
    if (whsDocs && whsDocs.length > 0) {
      // Insert WH&S before Settings
      const settingsIdx = items.findIndex(i => i.href === "/portal/settings");
      items.splice(settingsIdx >= 0 ? settingsIdx : items.length, 0, { href: "/portal/whs", label: "WH&S", icon: ShieldCheck });
    }
    return items;
  }, [whsDocs]);

  // Redirect to login if not authenticated and not loading
  if (!isLoading && !isAuthenticated && !sessionToken) {
    return <Redirect to="/portal/login" />;
  }

  const displayName = branding?.companyName || "My Project";
  const logoUrl = branding?.logoUrl || null;

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
            <Link href="/portal/dashboard">
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
              {user?.clientName}
            </span>
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
            <SheetDescription>Client portal navigation menu</SheetDescription>
          </SheetHeader>
          {/* Company branding + user info in mobile menu */}
          <div className="p-4 border-b bg-primary/5">
            {logoUrl ? (
              <img src={logoUrl} alt={displayName} className="h-8 w-auto max-w-[160px] object-contain mb-2" />
            ) : (
              <p className="font-bold text-sm text-primary mb-1">{displayName}</p>
            )}
            <p className="font-medium text-sm text-foreground truncate">{user?.clientName}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Client Portal</p>
          </div>
          <div className="p-3 space-y-0.5 overflow-y-auto flex-1">
            {navItems.map((item) => (
              <Link key={item.href} href={item.href}>
                <div
                  className={`flex items-center gap-3 px-3 py-3 rounded-lg text-sm cursor-pointer transition-colors ${
                    location === item.href
                      ? "bg-primary/10 text-primary font-medium"
                      : "text-muted-foreground hover:bg-muted active:bg-accent"
                  }`}
                  onClick={() => { setMobileMenuOpen(false); if (navigator.vibrate) navigator.vibrate(10); }}
                >
                  <item.icon className="w-5 h-5 shrink-0" />
                  <span className="flex-1">{item.label}</span>
                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                </div>
              </Link>
            ))}
          </div>
        </SheetContent>
      </Sheet>

      {/* Desktop Layout */}
      <div className="max-w-7xl mx-auto px-4 py-4 md:py-6 flex gap-6">
        {/* Desktop Sidebar */}
        <nav className="hidden md:block w-56 shrink-0">
          <div className="sticky top-20 space-y-1">
            {navItems.map((item) => (
              <Link key={item.href} href={item.href}>
                <div
                  className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm cursor-pointer transition-colors ${
                    location === item.href ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground hover:bg-muted"
                  }`}
                >
                  <item.icon className="w-4 h-4" />
                  {item.label}
                </div>
              </Link>
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
            const badgeCount = item.href === "/portal/documents" ? badgeCounts?.documents
              : item.href === "/portal/invoices" ? badgeCounts?.invoices
              : item.href === "/portal/updates" ? badgeCounts?.updates
              : 0;
            return (
              <Link key={item.href} href={item.href}>
                <div className={`flex flex-col items-center gap-0.5 px-3 py-1 cursor-pointer relative ${
                  isActive ? "text-accent-foreground" : "text-muted-foreground"
                }`}>
                  {isActive && (
                    <span className="absolute -top-px left-1/2 -translate-x-1/2 w-8 h-0.5 bg-accent rounded-full" />
                  )}
                  <div className="relative">
                    <item.icon className={`w-5 h-5 ${isActive ? "text-accent" : ""}`} />
                    {!!badgeCount && badgeCount > 0 && (
                      <span className="absolute -top-1 -right-1.5 min-w-[16px] h-4 flex items-center justify-center rounded-full bg-destructive text-destructive-foreground text-[9px] font-bold px-1">
                        {badgeCount > 99 ? "99+" : badgeCount}
                      </span>
                    )}
                  </div>
                  <span className={`text-[10px] font-medium ${isActive ? "text-accent" : ""}`}>{item.label}</span>
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
