import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Loader2, ClipboardCheck, CheckCircle2, Clock, AlertTriangle, XCircle } from "lucide-react";
import { Link } from "wouter";

const STATUS_OPTIONS = [
  { value: "all", label: "All Statuses" },
  { value: "scheduled", label: "Scheduled" },
  { value: "in_progress", label: "In Progress" },
  { value: "passed", label: "Passed" },
  { value: "failed", label: "Failed" },
  { value: "cancelled", label: "Cancelled" },
];

function statusBadge(status: string) {
  switch (status) {
    case "passed": return <Badge variant="default" className="bg-green-600"><CheckCircle2 className="h-3 w-3 mr-1" />Passed</Badge>;
    case "failed": return <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" />Failed</Badge>;
    case "in_progress": return <Badge variant="secondary"><Clock className="h-3 w-3 mr-1" />In Progress</Badge>;
    case "cancelled": return <Badge variant="outline" className="text-muted-foreground">Cancelled</Badge>;
    default: return <Badge variant="outline" className="border-blue-300 text-blue-700"><Clock className="h-3 w-3 mr-1" />Scheduled</Badge>;
  }
}

export default function ApprovalsAllInspections() {
  const [status, setStatus] = useState("all");

  const { data: inspections, isLoading } = trpc.approvals.allInspections.useQuery({
    status: status !== "all" ? status : undefined,
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ClipboardCheck className="h-6 w-6" /> All Inspections
          </h1>
          <p className="text-muted-foreground text-sm">Inspections across all approval projects</p>
        </div>
        <Badge variant="secondary">{inspections?.length ?? 0} inspections</Badge>
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Inspections table */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : !inspections || inspections.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No inspections found matching the selected filters.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/50">
                  <tr>
                    <th className="text-left p-3 font-medium">Inspection</th>
                    <th className="text-left p-3 font-medium">Project</th>
                    <th className="text-left p-3 font-medium">Type</th>
                    <th className="text-left p-3 font-medium">Status</th>
                    <th className="text-left p-3 font-medium">Blocking</th>
                    <th className="text-left p-3 font-medium">Inspector</th>
                    <th className="text-left p-3 font-medium">Scheduled</th>
                    <th className="text-left p-3 font-medium">Outcome</th>
                  </tr>
                </thead>
                <tbody>
                  {inspections.map((insp) => (
                    <tr key={insp.id} className="border-b hover:bg-muted/30 transition-colors">
                      <td className="p-3">
                        <Link href={`/approvals/projects/${insp.projectId}`} className="font-medium hover:underline text-primary">
                          {insp.title}
                        </Link>
                      </td>
                      <td className="p-3 text-muted-foreground">
                        <Link href={`/approvals/projects/${insp.projectId}`} className="hover:underline">
                          {insp.projectNumber || `#${insp.projectId}`}
                        </Link>
                      </td>
                      <td className="p-3">
                        <Badge variant="outline" className="text-xs capitalize">{insp.inspectionType?.replace(/_/g, " ") || "general"}</Badge>
                      </td>
                      <td className="p-3">{statusBadge(insp.status || "scheduled")}</td>
                      <td className="p-3">
                        {insp.isBlocking ? (
                          <Badge variant="destructive" className="text-xs">Blocking</Badge>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="p-3 text-muted-foreground">{insp.inspectorName || "—"}</td>
                      <td className="p-3 text-muted-foreground">
                        {insp.scheduledDate ? (
                          <span>
                            {new Date(insp.scheduledDate).toLocaleDateString()}
                            {insp.scheduledTime ? ` ${insp.scheduledTime}` : ""}
                          </span>
                        ) : "—"}
                      </td>
                      <td className="p-3 text-muted-foreground">{insp.result || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
