import { useLocation } from "wouter";
import { cn } from "@/lib/utils";
import {
  Package,
  Fence,
  Sun,
  DollarSign,
  Settings,
  Zap,
  TableProperties,
  Ruler,
  Percent,
  Building,
  Car,
  Gauge,
  Globe,
  Palette,
  Bell,
  AlertTriangle,
  ChevronRight,
  Shield,
  FileText,
  MessageSquare,
  Menu,
  X,
  Tag,
  ImageIcon,
  ListFilter,
  Files,
  Mail,
  ClipboardList,
  ClipboardCheck,
  LayoutDashboard,
  ListChecks,
  Layers,
} from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import { useIsMobile } from "@/hooks/useMobile";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";

interface MenuItem {
  label: string;
  path: string;
  icon: React.ComponentType<{ className?: string }>;
}

interface MenuGroup {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  items?: MenuItem[];
  path?: string; // for groups that are a single page (Deck Data, Eclipse Data)
}

const menuGroups: MenuGroup[] = [
  {
    label: "Structure Data",
    icon: Package,
    items: [
      { label: "Products", path: "/admin/master-data/structure/products", icon: Package },
      { label: "Spec Mappings", path: "/admin/master-data/structure/spec-mappings", icon: Zap },
      { label: "Tab Names", path: "/admin/master-data/structure/tab-names", icon: TableProperties },
      { label: "Sub-Tab Names", path: "/admin/master-data/structure/sub-tab-names", icon: TableProperties },
      { label: "UoM", path: "/admin/master-data/structure/uom", icon: Ruler },
    ],
  },
  {
    label: "Deck Data",
    icon: Fence,
    path: "/admin/master-data/deck",
  },
  {
    label: "Eclipse Data",
    icon: Sun,
    path: "/admin/master-data/eclipse",
  },
  {
    label: "Pricing Settings",
    icon: DollarSign,
    items: [
      { label: "Markup", path: "/admin/master-data/pricing/markup", icon: Percent },
      { label: "Council Fee", path: "/admin/master-data/pricing/council-fee", icon: Building },
      { label: "Travel Band", path: "/admin/master-data/pricing/travel-band", icon: Car },
      { label: "Complexity", path: "/admin/master-data/pricing/complexity", icon: Gauge },
      { label: "Region", path: "/admin/master-data/pricing/region", icon: Globe },
      { label: "Delivery", path: "/admin/master-data/pricing/delivery", icon: Car },
      { label: "Small Job Surcharge", path: "/admin/master-data/pricing/small-job-surcharge", icon: AlertTriangle },
      { label: "Construction Mgmt", path: "/admin/master-data/pricing/construction-mgmt", icon: Building },
      { label: "Home Warranty", path: "/admin/master-data/pricing/home-warranty", icon: Shield },
      { label: "Checklist Pricing", path: "/admin/checklist-pricing", icon: ListChecks },
    ],
  },
  {
    label: "Templates & Documents",
    icon: Files,
    items: [
      { label: "Descriptions of Work", path: "/admin/master-data/general/descriptions-of-work", icon: FileText },
      { label: "SMS Templates", path: "/admin/master-data/general/sms-templates", icon: MessageSquare },
      { label: "Image Library", path: "/admin/master-data/general/image-library", icon: ImageIcon },
      { label: "Email Templates", path: "/admin/email-templates", icon: Mail },
      { label: "Project Plan Templates", path: "/admin/project-plan-templates", icon: ClipboardList },
      { label: "Induction Form", path: "/admin/induction-config", icon: ClipboardCheck },
      { label: "Section Templates", path: "/admin/section-templates", icon: LayoutDashboard },
      { label: "Text Blocks", path: "/admin/text-blocks", icon: Layers },
    ],
  },
  {
    label: "General",
    icon: Settings,
    items: [
      { label: "Colours", path: "/admin/master-data/general/colour", icon: Palette },
      { label: "Colour Groups", path: "/admin/master-data/general/colour-groups", icon: Palette },
      { label: "Colour Palette", path: "/admin/master-data/general/colour-palette", icon: Palette },
      { label: "Notification", path: "/admin/master-data/general/notification", icon: Bell },
      { label: "Threshold", path: "/admin/master-data/general/threshold", icon: AlertTriangle },
      { label: "Supplier Categories", path: "/admin/master-data/general/supplier-categories", icon: Tag },
      { label: "CRM Dropdowns", path: "/admin/master-data/general/crm-dropdowns", icon: ListFilter },
    ],
  },
];

// Helper to find the current page label from the menu structure
function getCurrentPageLabel(location: string): string {
  for (const group of menuGroups) {
    if (group.path === location) return group.label;
    if (group.items) {
      const item = group.items.find(i => i.path === location);
      if (item) return `${group.label} > ${item.label}`;
    }
  }
  return "Sales Data";
}

export default function MasterDataLayout({ children }: { children: React.ReactNode }) {
  const [location, setLocation] = useLocation();
  const isMobile = useIsMobile();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<string[]>(() => {
    // Auto-expand the group that contains the current path
    const active = menuGroups.find(g =>
      g.path === location || g.items?.some(i => i.path === location)
    );
    return active ? [active.label] : ["Structure Data"];
  });

  // Auto-expand group when location changes
  useEffect(() => {
    const active = menuGroups.find(g =>
      g.path === location || g.items?.some(i => i.path === location)
    );
    if (active && !expandedGroups.includes(active.label)) {
      setExpandedGroups(prev => [...prev, active.label]);
    }
  }, [location]);

  const toggleGroup = (label: string) => {
    setExpandedGroups(prev =>
      prev.includes(label) ? prev.filter(l => l !== label) : [...prev, label]
    );
  };

  const isActive = (path: string) => location === path;
  const isGroupActive = (group: MenuGroup) => {
    if (group.path) return location === group.path;
    return group.items?.some(i => location === i.path) ?? false;
  };

  const handleNavigate = useCallback((path: string) => {
    setLocation(path);
    if (isMobile) {
      setMobileMenuOpen(false);
      if (navigator.vibrate) navigator.vibrate(10);
    }
  }, [setLocation, isMobile]);

  const currentPageLabel = getCurrentPageLabel(location);

  // Sidebar content (shared between desktop aside and mobile sheet)
  const sidebarContent = (
    <div className="space-y-1">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground px-2 mb-3">
        Sales Data
      </h2>
      {menuGroups.map(group => {
        const expanded = expandedGroups.includes(group.label);
        const groupActive = isGroupActive(group);

        if (group.path) {
          // Single-page group (no children)
          return (
            <button
              key={group.label}
              onClick={() => handleNavigate(group.path!)}
              className={cn(
                "flex items-center gap-2 w-full px-2 py-1.5 rounded-md text-[13px] font-medium transition-colors",
                isActive(group.path)
                  ? "bg-primary/10 text-primary"
                  : "text-foreground/70 hover:bg-muted hover:text-foreground"
              )}
            >
              <group.icon className="h-3.5 w-3.5" />
              {group.label}
            </button>
          );
        }

        return (
          <div key={group.label}>
            <button
              onClick={() => toggleGroup(group.label)}
              className={cn(
                "flex items-center gap-2 w-full px-2 py-1.5 rounded-md text-[13px] font-medium transition-colors",
                groupActive
                  ? "text-primary"
                  : "text-foreground/70 hover:bg-muted hover:text-foreground"
              )}
            >
              <group.icon className="h-3.5 w-3.5" />
              <span className="flex-1 text-left">{group.label}</span>
              <ChevronRight className={cn("h-3 w-3 transition-transform", expanded && "rotate-90")} />
            </button>
            {expanded && group.items && (
              <div className="ml-4 mt-0.5 space-y-0.5 border-l pl-2">
                {group.items.map(item => (
                  <button
                    key={item.path}
                    onClick={() => handleNavigate(item.path)}
                    className={cn(
                      "flex items-center gap-2 w-full px-2 py-1 rounded-md text-[12px] transition-colors",
                      isActive(item.path)
                        ? "bg-primary/10 text-primary font-medium"
                        : "text-foreground/60 hover:bg-muted hover:text-foreground"
                    )}
                  >
                    <item.icon className="h-3 w-3" />
                    {item.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );

  if (isMobile) {
    return (
      <div className="flex flex-col -m-4 sm:-m-6 min-h-[calc(100vh-3rem)]">
        {/* Mobile top bar with current section and hamburger */}
        <div className="sticky top-14 z-30 flex items-center gap-2 px-3 py-2.5 border-b bg-background/95 backdrop-blur">
          <button
            onClick={() => setMobileMenuOpen(true)}
            className="h-8 w-8 flex items-center justify-center rounded-md hover:bg-accent transition-colors shrink-0"
            aria-label="Open navigation"
          >
            <Menu className="h-4.5 w-4.5 text-muted-foreground" />
          </button>
          <span className="text-sm font-medium text-foreground truncate">
            {currentPageLabel}
          </span>
        </div>

        {/* Mobile sheet overlay for navigation */}
        <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
          <SheetContent side="left" className="w-64 p-4 pt-6 [&>button]:hidden">
            <SheetHeader className="sr-only">
              <SheetTitle>Sales Data Navigation</SheetTitle>
              <SheetDescription>Navigate between Sales Data sections</SheetDescription>
            </SheetHeader>
            {sidebarContent}
          </SheetContent>
        </Sheet>

        {/* Main content area - full width on mobile */}
        <main className="flex-1 p-4 overflow-auto">
          {children}
        </main>
      </div>
    );
  }

  // Desktop layout - unchanged
  return (
    <div className="flex gap-0 -m-6 min-h-[calc(100vh-3rem)]">
      {/* Sidebar navigation */}
      <aside className="w-56 shrink-0 border-r bg-muted/30 p-4 space-y-1">
        {sidebarContent}
      </aside>

      {/* Main content area */}
      <main className="flex-1 p-6 overflow-auto">
        {children}
      </main>
    </div>
  );
}
