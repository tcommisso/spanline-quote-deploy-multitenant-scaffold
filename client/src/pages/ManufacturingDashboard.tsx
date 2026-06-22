import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { normalizeUserRole } from "@shared/const";
import { Link, Redirect } from "wouter";
import { Factory, ClipboardList, CalendarDays, BarChart3, Receipt, AlertTriangle, CheckCircle2, Clock, Package } from "lucide-react";

export default function ManufacturingDashboard() {
  const { user } = useAuth();
  const isDriver = normalizeUserRole(user?.role) === "driver";
  const { data: summary } = trpc.manufacturing.reports.summary.useQuery(undefined, {
    enabled: !isDriver,
  });

  if (isDriver) return <Redirect to="/manufacturing/dispatch" />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Factory className="h-6 w-6" />
          Manufacturing
        </h1>
        <p className="text-muted-foreground mt-1">Production management, scheduling, and material tracking</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <KPICard label="Total Orders" value={summary?.totalOrders ?? 0} icon={Package} />
        <KPICard label="In Production" value={summary?.inProduction ?? 0} icon={Clock} color="text-blue-500" />
        <KPICard label="Completed" value={summary?.completed ?? 0} icon={CheckCircle2} color="text-green-500" />
        <KPICard label="Overdue" value={summary?.overdue ?? 0} icon={AlertTriangle} color="text-destructive" />
        <KPICard label="Total Tasks" value={summary?.totalTasks ?? 0} icon={ClipboardList} />
        <KPICard label="Pending Tasks" value={summary?.pendingTasks ?? 0} icon={Clock} color="text-amber-500" />
      </div>

      {/* Quick Links */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <QuickLink href="/manufacturing/orders" icon={ClipboardList} title="Orders" description="View and manage manufacturing orders" />
        <QuickLink href="/manufacturing/calendar" icon={CalendarDays} title="Calendar" description="Production schedule by branch" />
        <QuickLink href="/manufacturing/reports" icon={BarChart3} title="Reports" description="Production reports and analytics" />
        <QuickLink href="/manufacturing/purchase-orders" icon={Receipt} title="Purchase Orders" description="External procurement tracking" />
      </div>
    </div>
  );
}

function KPICard({ label, value, icon: Icon, color }: { label: string; value: number; icon: any; color?: string }) {
  return (
    <div className="bg-card border rounded-lg p-4">
      <div className="flex items-center gap-2 mb-1">
        <Icon className={`h-4 w-4 ${color || "text-muted-foreground"}`} />
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
      <p className={`text-2xl font-bold ${color || ""}`}>{value}</p>
    </div>
  );
}

function QuickLink({ href, icon: Icon, title, description }: { href: string; icon: any; title: string; description: string }) {
  return (
    <Link href={href}>
      <div className="bg-card border rounded-lg p-4 hover:bg-accent/50 transition-colors cursor-pointer">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/10 rounded-md">
            <Icon className="h-5 w-5 text-primary" />
          </div>
          <div>
            <p className="font-medium">{title}</p>
            <p className="text-xs text-muted-foreground">{description}</p>
          </div>
        </div>
      </div>
    </Link>
  );
}
