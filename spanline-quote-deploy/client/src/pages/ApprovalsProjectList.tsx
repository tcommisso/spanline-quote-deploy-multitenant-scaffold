import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Link } from "wouter";
import { Plus, Search, MapPin, Calendar, User } from "lucide-react";

const STATUS_COLORS: Record<string, string> = {
  intake: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  active: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  on_hold: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
  completed: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  cancelled: "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200",
};

const STATUS_LABELS: Record<string, string> = {
  intake: "Intake",
  active: "Active",
  on_hold: "On Hold",
  completed: "Completed",
  cancelled: "Cancelled",
};

export default function ApprovalsProjectList() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [jurisdictionFilter, setJurisdictionFilter] = useState("all");

  const { data: projects, isLoading } = trpc.approvals.projects.list.useQuery({
    status: statusFilter !== "all" ? statusFilter : undefined,
    jurisdiction: jurisdictionFilter !== "all" ? jurisdictionFilter : undefined,
    search: search || undefined,
  });

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Approval Projects</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {projects?.length || 0} project{(projects?.length || 0) !== 1 ? "s" : ""}
          </p>
        </div>
        <Link href="/approvals/projects/new">
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            New Project
          </Button>
        </Link>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search projects..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="intake">Intake</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="on_hold">On Hold</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
        <Select value={jurisdictionFilter} onValueChange={setJurisdictionFilter}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Jurisdiction" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="NSW">NSW</SelectItem>
            <SelectItem value="ACT">ACT</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Project List */}
      {isLoading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-24 rounded-lg bg-muted animate-pulse" />
          ))}
        </div>
      ) : !projects || projects.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <p className="text-muted-foreground mb-4">No approval projects found</p>
            <Link href="/approvals/projects/new">
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Create First Project
              </Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {projects.map((project) => (
            <Link key={project.id} href={`/approvals/projects/${project.id}`}>
              <Card className="cursor-pointer hover:shadow-md transition-shadow">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-mono text-muted-foreground">
                          {project.projectNumber}
                        </span>
                        <Badge variant="outline" className={STATUS_COLORS[project.overallStatus] || ""}>
                          {STATUS_LABELS[project.overallStatus] || project.overallStatus}
                        </Badge>
                        <Badge variant="outline">{project.jurisdiction}</Badge>
                        {project.recommendedPathway && (
                          <Badge variant="secondary" className="text-xs">
                            {project.recommendedPathway}
                          </Badge>
                        )}
                      </div>
                      <h3 className="font-semibold text-base truncate">{project.name}</h3>
                      <div className="flex flex-wrap items-center gap-4 mt-2 text-sm text-muted-foreground">
                        {project.propertyAddress && (
                          <span className="flex items-center gap-1">
                            <MapPin className="h-3.5 w-3.5" />
                            {project.propertySuburb || project.propertyAddress}
                          </span>
                        )}
                        {project.clientName && (
                          <span className="flex items-center gap-1">
                            <User className="h-3.5 w-3.5" />
                            {project.clientName}
                          </span>
                        )}
                        {project.createdAt && (
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3.5 w-3.5" />
                            {new Date(project.createdAt).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="text-right text-sm">
                      {project.currentState && (
                        <div className="text-xs text-muted-foreground">
                          State: <span className="font-medium">{project.currentState}</span>
                        </div>
                      )}
                      {project.currentGate !== null && project.currentGate !== undefined && project.currentGate > 0 && (
                        <div className="text-xs text-muted-foreground">
                          Gate: <span className="font-medium">{project.currentGate}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
