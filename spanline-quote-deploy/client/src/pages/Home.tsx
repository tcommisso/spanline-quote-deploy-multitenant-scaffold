import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { FileText, Plus, TrendingUp, Clock, CheckCircle2, XCircle, PenLine, History, AlertTriangle, Star } from "lucide-react";
import { useLocation, Redirect } from "wouter";
import { isAdminRole } from "@shared/const";

const statusConfig = {
  draft: { label: "Draft", class: "bg-muted text-muted-foreground", icon: Clock },
  sent: { label: "Sent", class: "bg-blue-50 text-blue-700 border-blue-200", icon: FileText },
  accepted: { label: "Accepted", class: "bg-emerald-50 text-emerald-700 border-emerald-200", icon: CheckCircle2 },
  lost: { label: "Lost", class: "bg-red-50 text-red-600 border-red-200", icon: XCircle },
};

export default function Home() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const { data: stats, isLoading: statsLoading } = trpc.quotes.stats.useQuery();
  const { data: recentQuotes, isLoading: quotesLoading } = trpc.quotes.list.useQuery({ status: "all" });

  // Role-based redirect: construction users go to Construction Dashboard
  if (user?.role === "construction_user") {
    return <Redirect to="/construction" />;
  }

  // design_adviser, admin, office_user, super_admin all stay on Sales Dashboard (this page)

  const recent = recentQuotes?.slice(0, 5) || [];

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Welcome back{user?.name ? `, ${user.name.split(" ")[0]}` : ""}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {user?.role === "admin" ? "Admin overview of all quotes" : "Your quoting dashboard"}
          </p>
        </div>
        <Button onClick={() => setLocation("/quotes?new=1")} variant="brand" size="sm" className="gap-2">
          <Plus className="h-4 w-4" />
          New Quote
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {statsLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}><CardContent className="p-5"><Skeleton className="h-10 w-20" /><Skeleton className="h-4 w-16 mt-2" /></CardContent></Card>
          ))
        ) : (
          <>
            <StatCard title="Total Quotes" value={stats?.total ?? 0} icon={FileText} onClick={() => setLocation("/quotes")} subValue={stats?.totalValue ? `$${Math.round(stats.totalValue / 1000)}k` : undefined} />
            <StatCard title="Drafts" value={stats?.draft ?? 0} icon={Clock} accent="text-muted-foreground" onClick={() => setLocation("/quotes?status=draft")} subValue={stats?.draftValue ? `$${Math.round(stats.draftValue / 1000)}k` : undefined} />
            <StatCard title="Accepted" value={stats?.accepted ?? 0} icon={CheckCircle2} accent="text-emerald-600" onClick={() => setLocation("/quotes?status=accepted")} subValue={stats?.acceptedValue ? `$${Math.round(stats.acceptedValue / 1000)}k` : undefined} />
            <StatCard title="Sent" value={stats?.sent ?? 0} icon={TrendingUp} accent="text-blue-600" onClick={() => setLocation("/quotes?status=sent")} subValue={stats?.sentValue ? `$${Math.round(stats.sentValue / 1000)}k` : undefined} />
          </>
        )}
      </div>

      {/* Low-Rated Suppliers Alert (admin only) */}
      {user && isAdminRole(user.role) && <LowRatedSuppliersWidget />}

      {/* Recent Activity */}
      <RecentActivityWidget />

      {/* Recent Quotes */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-medium">Recent Quotes</h2>
          <Button variant="ghost" size="sm" onClick={() => setLocation("/quotes")} className="text-xs">
            View all
          </Button>
        </div>
        {quotesLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Card key={i}><CardContent className="p-4"><Skeleton className="h-5 w-full" /></CardContent></Card>
            ))}
          </div>
        ) : recent.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center">
              <FileText className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">No quotes yet. Create your first quote to get started.</p>
              <Button onClick={() => setLocation("/quotes?new=1")} variant="outline" size="sm" className="mt-4">
                Create Quote
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {recent.map(q => {
              const cfg = statusConfig[q.status as keyof typeof statusConfig];
              return (
                <Card
                  key={q.id}
                  className="hover:shadow-sm transition-shadow cursor-pointer"
                  onClick={() => setLocation(`/quotes/${q.id}`)}
                >
                  <CardContent className="p-4 flex items-center justify-between">
                    <div className="flex items-center gap-4 min-w-0">
                      <div className="h-9 w-9 rounded-lg bg-muted flex items-center justify-center shrink-0">
                        <FileText className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{q.clientName}</p>
                        <p className="text-xs text-muted-foreground">{q.quoteNumber} &middot; {new Date(q.updatedAt).toLocaleDateString()}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {(q as any).signwellStatus === "pending" && (
                        <Badge variant="outline" className="text-[10px] border-amber-300 text-amber-700 bg-amber-50 gap-1">
                          <PenLine className="h-3 w-3" /> Awaiting
                        </Badge>
                      )}
                      {(q as any).signwellStatus === "completed" && (
                        <Badge variant="outline" className="text-[10px] border-green-300 text-green-700 bg-green-50 gap-1">
                          <CheckCircle2 className="h-3 w-3" /> Signed
                        </Badge>
                      )}
                      {(q as any).signwellStatus === "declined" && (
                        <Badge variant="outline" className="text-[10px] border-red-300 text-red-700 bg-red-50 gap-1">
                          <XCircle className="h-3 w-3" /> Declined
                        </Badge>
                      )}
                      <Badge variant="outline" className={`text-[11px] ${cfg?.class || ""}`}>
                        {cfg?.label || q.status}
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function RecentActivityWidget() {
  const { data: revisions, isLoading } = trpc.quotes.recentRevisions.useQuery({ limit: 5 });
  const [, setLocation] = useLocation();

  const actionLabels: Record<string, { label: string; color: string; bgColor: string }> = {
    financial_update: { label: "Financials Updated", color: "text-blue-600", bgColor: "bg-blue-100 dark:bg-blue-900/30" },
    status_change: { label: "Status Changed", color: "text-purple-600", bgColor: "bg-purple-100 dark:bg-purple-900/30" },
    spec_update: { label: "Spec Updated", color: "text-teal-600", bgColor: "bg-teal-100 dark:bg-teal-900/30" },
    recalculate: { label: "Recalculated", color: "text-amber-600", bgColor: "bg-amber-100 dark:bg-amber-900/30" },
    revert: { label: "Reverted", color: "text-red-600", bgColor: "bg-red-100 dark:bg-red-900/30" },
  };

  if (isLoading) {
    return (
      <div>
        <h2 className="text-lg font-medium mb-4">Recent Activity</h2>
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i}><CardContent className="p-3"><Skeleton className="h-4 w-full" /></CardContent></Card>
          ))}
        </div>
      </div>
    );
  }

  if (!revisions || revisions.length === 0) return null;

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <History className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-lg font-medium">Recent Activity</h2>
      </div>
      <div className="space-y-1.5">
        {revisions.map((rev) => {
          const actionInfo = actionLabels[rev.action] || { label: rev.action, color: "text-muted-foreground" };
          const changesCount = (rev.changes as any[])?.length || 0;
          return (
            <Card
              key={rev.id}
              className="hover:shadow-sm transition-shadow cursor-pointer"
              onClick={() => setLocation(`/quotes/${rev.quoteId}`)}
            >
              <CardContent className="p-3 flex items-center gap-3">
                <div className={`h-8 w-8 rounded-md flex items-center justify-center shrink-0 ${actionInfo.bgColor || "bg-muted"}`}>
                  <History className={`h-3.5 w-3.5 ${actionInfo.color || "text-muted-foreground"}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-medium ${actionInfo.color}`}>{actionInfo.label}</span>
                    <span className="text-[10px] text-muted-foreground">· {rev.quoteNumber}</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground truncate">
                    {rev.userName || "Unknown"} · {rev.clientName}
                    {changesCount > 0 && ` · ${changesCount} field${changesCount > 1 ? "s" : ""}`}
                  </p>
                </div>
                <span className="text-[10px] text-muted-foreground whitespace-nowrap shrink-0">
                  {new Date(rev.createdAt).toLocaleDateString()}
                </span>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function LowRatedSuppliersWidget() {
  const { data: ratings, isLoading } = trpc.supplierFeedback.allRatings.useQuery();
  const { data: masterData } = trpc.masterData.getAll.useQuery();
  const [, setLocation] = useLocation();

  const threshold = parseFloat(
    masterData?.find(d => d.category === "notification" && d.key === "supplier_alert_threshold")?.value || "3.0"
  );
  const lowRated = (ratings || []).filter(r => r.avgOverall < threshold && r.totalReviews >= 1);

  if (isLoading) {
    return (
      <div>
        <div className="flex items-center gap-2 mb-3">
          <AlertTriangle className="h-4 w-4 text-amber-500" />
          <h2 className="text-lg font-medium">Supplier Alerts</h2>
        </div>
        <Card><CardContent className="p-4"><Skeleton className="h-8 w-full" /></CardContent></Card>
      </div>
    );
  }

  if (lowRated.length === 0) return null;

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-500" />
          <h2 className="text-lg font-medium">Supplier Alerts</h2>
          <Badge variant="destructive" className="text-[10px] px-1.5 py-0">{lowRated.length}</Badge>
        </div>
        <Button variant="ghost" size="sm" onClick={() => setLocation("/admin/supplier-feedback")} className="text-xs">
          View all feedback
        </Button>
      </div>
      <Card className="border-amber-200 bg-amber-50/30">
        <CardContent className="p-4 space-y-3">
          <p className="text-xs text-muted-foreground">Suppliers with average rating below {threshold} stars:</p>
          <div className="space-y-2">
            {lowRated.map(supplier => (
              <div
                key={supplier.supplierId}
                className="flex items-center justify-between p-2.5 rounded-md bg-background border cursor-pointer hover:shadow-sm transition-shadow"
                onClick={() => setLocation("/admin/supplier-feedback")}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="h-8 w-8 rounded-md bg-red-50 flex items-center justify-center shrink-0">
                    <AlertTriangle className="h-4 w-4 text-red-500" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{supplier.supplierName}</p>
                    <p className="text-[11px] text-muted-foreground">{supplier.totalReviews} review{supplier.totalReviews > 1 ? "s" : ""}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <div className="flex items-center gap-0.5">
                    <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                    <span className="text-sm font-semibold text-red-600">{supplier.avgOverall.toFixed(1)}</span>
                  </div>
                  <span className="text-[10px] text-muted-foreground">/ 5</span>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({ title, value, icon: Icon, accent, onClick, subValue }: { title: string; value: number; icon: any; accent?: string; onClick?: () => void; subValue?: string }) {
  return (
    <Card className={onClick ? "cursor-pointer hover:shadow-md hover:-translate-y-0.5 transition-all" : ""} onClick={onClick}>
      <CardContent className="p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-2xl font-semibold tracking-tight">{value}</p>
            {subValue && <p className="text-sm font-medium text-[#C9AB57] mt-0.5">{subValue}</p>}
            <p className="text-xs text-muted-foreground mt-1">{title}</p>
          </div>
          <div className={`h-9 w-9 rounded-lg bg-muted flex items-center justify-center ${accent || "text-foreground"}`}>
            <Icon className="h-4 w-4" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
