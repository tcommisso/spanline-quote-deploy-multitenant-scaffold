import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Link } from "wouter";
import { FileText, AlertTriangle, Clock, CheckCircle2, Inbox, ShieldCheck, Plus, ArrowRight, BarChart3, FileCheck } from "lucide-react";
import ApprovalsCalendar from "@/components/approvals/ApprovalsCalendar";

export default function ApprovalsDashboard() {
  const { data: stats, isLoading } = trpc.approvals.dashboardStats.useQuery();
  const { data: recentProjects } = trpc.approvals.projects.list.useQuery({ status: undefined });

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Building Approvals</h1>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="h-28 rounded-lg bg-muted animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  const statCards = [
    { label: "Total Projects", value: stats?.total || 0, icon: FileText, color: "text-blue-500", bgColor: "bg-blue-50", path: "/approvals/projects" },
    { label: "Intake", value: stats?.intake || 0, icon: Inbox, color: "text-purple-500", bgColor: "bg-purple-50", path: "/approvals/projects?status=intake" },
    { label: "Active", value: stats?.active || 0, icon: Clock, color: "text-amber-500", bgColor: "bg-amber-50", path: "/approvals/projects?status=active" },
    { label: "Completed", value: stats?.completed || 0, icon: CheckCircle2, color: "text-green-500", bgColor: "bg-green-50", path: "/approvals/projects?status=completed" },
  ];

  const alertCards = [
    { label: "Open RFIs", value: stats?.openRfis || 0, icon: AlertTriangle, color: "text-red-500", bgColor: "bg-red-50", urgent: true },
    { label: "Overdue RFIs", value: stats?.overdueRfis || 0, icon: AlertTriangle, color: "text-red-700", bgColor: "bg-red-100", urgent: true },
    { label: "On Hold", value: stats?.onHold || 0, icon: Clock, color: "text-orange-500", bgColor: "bg-orange-50", urgent: false },
    { label: "Pending Inspections", value: stats?.pendingInspections || 0, icon: ShieldCheck, color: "text-indigo-500", bgColor: "bg-indigo-50", urgent: false },
  ];

  // Pipeline stages for visual representation
  const pipelineStages = [
    { label: "Intake", count: stats?.intake || 0, color: "bg-purple-500" },
    { label: "Active", count: stats?.active || 0, color: "bg-amber-500" },
    { label: "On Hold", count: stats?.onHold || 0, color: "bg-orange-400" },
    { label: "Completed", count: stats?.completed || 0, color: "bg-green-500" },
  ];
  const totalPipeline = pipelineStages.reduce((a, s) => a + s.count, 0) || 1;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Building Approvals</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Manage development applications, construction certificates, and compliance
          </p>
        </div>
        <Link href="/approvals/projects/new">
          <Button variant="brand">
            <Plus className="h-4 w-4 mr-2" />
            New Project
          </Button>
        </Link>
      </div>

      {/* Pipeline Bar */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <BarChart3 className="h-4 w-4" /> Application Pipeline
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex h-8 rounded-lg overflow-hidden mb-3">
            {pipelineStages.map((stage) => (
              <div
                key={stage.label}
                className={`${stage.color} transition-all`}
                style={{ width: `${(stage.count / totalPipeline) * 100}%`, minWidth: stage.count > 0 ? "2rem" : "0" }}
                title={`${stage.label}: ${stage.count}`}
              />
            ))}
          </div>
          <div className="flex justify-between text-xs text-muted-foreground">
            {pipelineStages.map((stage) => (
              <div key={stage.label} className="flex items-center gap-1">
                <div className={`w-2 h-2 rounded-full ${stage.color}`} />
                <span>{stage.label} ({stage.count})</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((stat) => (
          <Link key={stat.label} href={stat.path}>
            <Card className="cursor-pointer hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">{stat.label}</p>
                    <p className="text-3xl font-bold mt-1">{stat.value}</p>
                  </div>
                  <div className={`p-3 rounded-lg ${stat.bgColor}`}>
                    <stat.icon className={`h-5 w-5 ${stat.color}`} />
                  </div>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {/* Alerts Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {alertCards.map((alert) => (
          <Card key={alert.label} className={alert.urgent && alert.value > 0 ? "border-red-200" : ""}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">{alert.label}</p>
                  <p className={`text-2xl font-bold mt-1 ${alert.urgent && alert.value > 0 ? "text-red-600" : ""}`}>
                    {alert.value}
                  </p>
                </div>
                <div className={`p-2 rounded-lg ${alert.bgColor}`}>
                  <alert.icon className={`h-4 w-4 ${alert.color}`} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Cross-Project Calendar */}
      <ApprovalsCalendar />

      {/* Bottom Section: Recent Projects + Quick Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Recent Projects */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Recent Projects</CardTitle>
            <Link href="/approvals/projects">
              <Button variant="ghost" size="sm">
                View All <ArrowRight className="h-3.5 w-3.5 ml-1" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            {!recentProjects || recentProjects.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                No projects yet. Create your first approval project to get started.
              </p>
            ) : (
              <div className="space-y-3">
                {recentProjects.slice(0, 5).map((project: any) => (
                  <Link key={project.id} href={`/approvals/projects/${project.id}`}>
                    <div className="flex items-center justify-between p-3 rounded-lg hover:bg-muted/50 cursor-pointer transition-colors">
                      <div className="flex items-center gap-3 min-w-0">
                        <FileCheck className="h-4 w-4 text-muted-foreground shrink-0" />
                        <div className="min-w-0">
                          <p className="font-medium text-sm truncate">{project.name}</p>
                          <p className="text-xs text-muted-foreground truncate">
                            {project.propertyAddress || "No address"} • {project.jurisdiction}
                          </p>
                        </div>
                      </div>
                      <Badge variant="outline" className="text-xs shrink-0 ml-2">
                        {(project.overallStatus || "intake").replace(/_/g, " ")}
                      </Badge>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Quick Actions */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Link href="/approvals/projects/new">
              <Button variant="outline" className="w-full justify-start">
                <Plus className="h-4 w-4 mr-2" />
                New Approval Project
              </Button>
            </Link>
            <Link href="/approvals/projects">
              <Button variant="outline" className="w-full justify-start">
                <FileText className="h-4 w-4 mr-2" />
                All Projects
              </Button>
            </Link>
            <Link href="/approvals/projects">
              <Button variant="outline" className="w-full justify-start">
                <Clock className="h-4 w-4 mr-2" />
                View Tasks
              </Button>
            </Link>
            <Link href="/approvals/projects">
              <Button variant="outline" className="w-full justify-start">
                <AlertTriangle className="h-4 w-4 mr-2" />
                Manage RFIs
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
