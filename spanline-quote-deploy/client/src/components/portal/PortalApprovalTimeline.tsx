import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { CheckCircle2, Clock, AlertCircle, FileText, Shield, Search, Calendar } from "lucide-react";

const typeIcons: Record<string, typeof CheckCircle2> = {
  lodgement: FileText,
  determination: CheckCircle2,
  inspection: Shield,
  gate: Clock,
  rfi: Search,
};

const typeColors: Record<string, string> = {
  lodgement: "bg-blue-500",
  determination: "bg-green-500",
  inspection: "bg-purple-500",
  gate: "bg-amber-500",
  rfi: "bg-orange-500",
};

const statusBadgeVariant = (status: string) => {
  switch (status) {
    case "completed":
    case "approved":
    case "passed":
    case "closed":
      return "default" as const;
    case "in_progress":
    case "open":
    case "scheduled":
      return "secondary" as const;
    case "overdue":
    case "failed":
      return "destructive" as const;
    default:
      return "outline" as const;
  }
};

export default function PortalApprovalTimeline() {
  const { data, isLoading } = trpc.portal.getApprovalTimeline.useQuery(undefined, {
    retry: false,
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-48" />
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!data?.project) {
    return null; // No approval project linked — don't show anything
  }

  const { project, milestones } = data;

  // Gate progress indicator
  const gateLabels = ["Pre-Lodgement", "Lodgement", "Assessment", "Determination", "Pre-Construction", "Construction"];
  const currentGateIndex = project.currentGate
    ? Math.min(project.currentGate, gateLabels.length - 1)
    : 0;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Calendar className="h-4 w-4" />
          Approval Progress
        </CardTitle>
        <p className="text-sm text-muted-foreground">{project.name}</p>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Gate Progress Bar */}
        <div className="space-y-2">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Current Stage</span>
            <Badge variant="secondary" className="text-xs">
              {project.status?.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase()) || "In Progress"}
            </Badge>
          </div>
          <div className="flex gap-1">
            {gateLabels.map((gate, idx) => (
              <div key={gate} className="flex-1 flex flex-col items-center gap-1">
                <div
                  className={`h-2 w-full rounded-full transition-colors ${
                    idx <= currentGateIndex ? "bg-primary" : "bg-muted"
                  }`}
                />
                <span className="text-[10px] text-muted-foreground text-center leading-tight hidden sm:block">
                  {gate}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Timeline Milestones */}
        {milestones.length > 0 ? (
          <div className="relative pl-6 space-y-3 pt-2">
            {/* Vertical line */}
            <div className="absolute left-[11px] top-4 bottom-2 w-px bg-border" />

            {milestones.map((milestone, idx) => {
              const Icon = typeIcons[milestone.type] || Clock;
              const dotColor = typeColors[milestone.type] || "bg-muted-foreground";

              return (
                <div key={idx} className="relative flex items-start gap-3">
                  {/* Dot */}
                  <div className={`absolute -left-6 top-1 w-[10px] h-[10px] rounded-full ${dotColor} ring-2 ring-background`} />

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <span className="text-sm font-medium truncate">{milestone.label}</span>
                      <Badge variant={statusBadgeVariant(milestone.status)} className="text-[10px] px-1.5 py-0">
                        {milestone.status.replace(/_/g, " ")}
                      </Badge>
                    </div>
                    {milestone.date && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {new Date(milestone.date).toLocaleDateString("en-AU", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-4">
            <p className="text-sm text-muted-foreground">No milestones recorded yet</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
