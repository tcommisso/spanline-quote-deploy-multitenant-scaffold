import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useLocation, useParams } from "wouter";
import { ArrowLeft, Edit, Trash2, Play, Copy } from "lucide-react";
import { toast } from "sonner";
import { ApprovalOverviewTab } from "@/components/approvals/ApprovalOverviewTab";
import { ApprovalLodgementsTab } from "@/components/approvals/ApprovalLodgementsTab";
import { ApprovalDocumentsTab } from "@/components/approvals/ApprovalDocumentsTab";
import { ApprovalRfisTab } from "@/components/approvals/ApprovalRfisTab";
import { ApprovalConditionsTab } from "@/components/approvals/ApprovalConditionsTab";
import { ApprovalTasksTab } from "@/components/approvals/ApprovalTasksTab";
import { ApprovalInspectionsTab } from "@/components/approvals/ApprovalInspectionsTab";
import { ApprovalFeesTab } from "@/components/approvals/ApprovalFeesTab";
import { ApprovalAuditTab } from "@/components/approvals/ApprovalAuditTab";
import ApprovalTimelineTab from "@/components/approvals/ApprovalTimelineTab";

const STATUS_COLORS: Record<string, string> = {
  intake: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  active: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  on_hold: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
  completed: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  cancelled: "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200",
};

function approvalProjectIdentifier(project: any) {
  const clientName = String(project.clientName || "").trim();
  const accountNumber = String(project.accountNumber || project.clientAccountNumber || "").trim();
  if (clientName && accountNumber) return `${clientName} — ${accountNumber}`;
  return clientName || accountNumber || project.name;
}

export default function ApprovalsProjectDetail() {
  const params = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const projectId = parseInt(params.id || "0");
  const [activeTab, setActiveTab] = useState("overview");

  const { data: project, isLoading } = trpc.approvals.projects.get.useQuery(
    { id: projectId },
    { enabled: projectId > 0 }
  );

  const deleteProject = trpc.approvals.projects.delete.useMutation({
    onSuccess: () => {
      toast.success("Project deleted");
      navigate("/approvals/projects");
    },
  });

  const cloneProject = trpc.approvals.cloneProject.useMutation({
    onSuccess: (result) => {
      toast.success(`Project cloned as ${result.projectNumber} (${result.docsCloned} checklist docs copied)`);
      navigate(`/approvals/projects/${result.newProjectId}`);
    },
    onError: (err) => toast.error(err.message),
  });

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="h-8 w-48 bg-muted animate-pulse rounded mb-4" />
        <div className="h-64 bg-muted animate-pulse rounded" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">Project not found</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate("/approvals/projects")}>
          Back to Projects
        </Button>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/approvals/projects")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono text-muted-foreground">{project.projectNumber}</span>
              <Badge variant="outline" className={STATUS_COLORS[project.overallStatus] || ""}>
                {project.overallStatus}
              </Badge>
              <Badge variant="outline">{project.jurisdiction}</Badge>
              {project.recommendedPathway && (
                <Badge variant="secondary">{project.recommendedPathway}</Badge>
              )}
            </div>
            <h1 className="text-xl font-bold mt-1">{approvalProjectIdentifier(project)}</h1>
            {project.propertyAddress && (
              <p className="text-sm text-muted-foreground">{project.propertyAddress}, {project.propertySuburb}</p>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate(`/approvals/projects/${projectId}/pathway`)}
          >
            <Play className="h-3.5 w-3.5 mr-1" />
            Pathway Assessment
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              if (confirm("Clone this project? A new project will be created with the same details, contacts, and document checklist.")) {
                cloneProject.mutate({ sourceProjectId: projectId });
              }
            }}
            disabled={cloneProject.isPending}
          >
            <Copy className="h-3.5 w-3.5 mr-1" />
            {cloneProject.isPending ? "Cloning..." : "Clone"}
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => {
              if (confirm("Delete this project? This cannot be undone.")) {
                deleteProject.mutate({ id: projectId });
              }
            }}
          >
            <Trash2 className="h-3.5 w-3.5 mr-1" />
            Delete
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="w-full justify-start overflow-x-auto flex-nowrap">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="lodgements">Lodgements</TabsTrigger>
          <TabsTrigger value="documents">Documents</TabsTrigger>
          <TabsTrigger value="rfis">RFIs</TabsTrigger>
          <TabsTrigger value="conditions">Conditions</TabsTrigger>
          <TabsTrigger value="tasks">Tasks</TabsTrigger>
          <TabsTrigger value="inspections">Inspections</TabsTrigger>
          <TabsTrigger value="fees">Fees</TabsTrigger>
          <TabsTrigger value="timeline">Timeline</TabsTrigger>
          <TabsTrigger value="audit">Audit Log</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <ApprovalOverviewTab project={project} />
        </TabsContent>
        <TabsContent value="lodgements">
          <ApprovalLodgementsTab projectId={projectId} jurisdiction={project.jurisdiction as "NSW" | "ACT"} />
        </TabsContent>
        <TabsContent value="documents">
          <ApprovalDocumentsTab projectId={projectId} />
        </TabsContent>
        <TabsContent value="rfis">
          <ApprovalRfisTab projectId={projectId} />
        </TabsContent>
        <TabsContent value="conditions">
          <ApprovalConditionsTab projectId={projectId} />
        </TabsContent>
        <TabsContent value="tasks">
          <ApprovalTasksTab projectId={projectId} />
        </TabsContent>
        <TabsContent value="inspections">
          <ApprovalInspectionsTab projectId={projectId} />
        </TabsContent>
        <TabsContent value="fees">
          <ApprovalFeesTab projectId={projectId} />
        </TabsContent>
        <TabsContent value="timeline">
          <ApprovalTimelineTab projectId={projectId} />
        </TabsContent>
        <TabsContent value="audit">
          <ApprovalAuditTab projectId={projectId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
