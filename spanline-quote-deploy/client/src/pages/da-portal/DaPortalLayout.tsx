import { useAuth } from "@/_core/hooks/useAuth";
import { useLocation, Link, Redirect } from "wouter";
import { Button } from "@/components/ui/button";
import {
  LayoutDashboard, User, FileUp, Receipt, DollarSign,
  Newspaper, LogOut, Menu,
} from "lucide-react";
import { useState, useEffect, type ReactNode } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";

const navItems = [
  { href: "/da-portal", label: "Dashboard", icon: LayoutDashboard },
  { href: "/da-portal/personal-details", label: "Personal Details", icon: User },
  { href: "/da-portal/commissions", label: "Unclaimed Commissions", icon: DollarSign },
  { href: "/da-portal/invoices", label: "Invoices", icon: FileUp },
  { href: "/da-portal/payments", label: "Payments", icon: Receipt },
  { href: "/da-portal/news", label: "News", icon: Newspaper },
];

export default function DaPortalLayout({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const [location] = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const currentNav = navItems.find(i => location === i.href || (i.href !== "/da-portal" && location.startsWith(i.href)));
    const pageName = currentNav?.label || "DA Portal";
    document.title = `Altaspan | ${pageName}`;
  }, [location]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (!user) {
    return <Redirect to="/" />;
  }

  // Only design_adviser, admin, super_admin can access
  const allowedRoles = ["design_adviser", "admin", "super_admin"];
  if (!allowedRoles.includes(user.role)) {
    return <Redirect to="/" />;
  }

  return (
    <div className="flex min-h-screen bg-background">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex flex-col w-64 border-r bg-card">
        <div className="p-4 border-b">
          <h2 className="font-semibold text-lg">DA Portal</h2>
          <p className="text-sm text-muted-foreground truncate">{user.name || user.email}</p>
        </div>
        <nav className="flex-1 p-2 space-y-1">
          {navItems.map((item) => {
            const isActive = location === item.href || (item.href !== "/da-portal" && location.startsWith(item.href));
            return (
              <Link key={item.href} href={item.href}>
                <div className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors cursor-pointer ${
                  isActive ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                }`}>
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </div>
              </Link>
            );
          })}
        </nav>
        <div className="p-2 border-t">
          <Link href="/">
            <div className="flex items-center gap-3 px-3 py-2 rounded-md text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground cursor-pointer">
              <LogOut className="h-4 w-4" />
              Back to Main App
            </div>
          </Link>
        </div>
      </aside>

      {/* Mobile Header */}
      <div className="flex-1 flex flex-col">
        <header className="md:hidden flex items-center justify-between p-4 border-b bg-card">
          <h2 className="font-semibold">DA Portal</h2>
          <Button variant="ghost" size="icon" onClick={() => setMobileMenuOpen(true)}>
            <Menu className="h-5 w-5" />
          </Button>
        </header>

        {/* Mobile Menu Sheet */}
        <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
          <SheetContent side="left" className="w-64 p-0">
            <SheetHeader className="p-4 border-b">
              <SheetTitle>DA Portal</SheetTitle>
              <SheetDescription className="truncate">{user.name || user.email}</SheetDescription>
            </SheetHeader>
            <nav className="p-2 space-y-1">
              {navItems.map((item) => {
                const isActive = location === item.href || (item.href !== "/da-portal" && location.startsWith(item.href));
                return (
                  <Link key={item.href} href={item.href} onClick={() => setMobileMenuOpen(false)}>
                    <div className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors cursor-pointer ${
                      isActive ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                    }`}>
                      <item.icon className="h-4 w-4" />
                      {item.label}
                    </div>
                  </Link>
                );
              })}
            </nav>
          </SheetContent>
        </Sheet>

        {/* Main Content */}
        <main className="flex-1 p-4 md:p-6 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
