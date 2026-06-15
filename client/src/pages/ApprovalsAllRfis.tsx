import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Loader2, MessageSquareWarning, CheckCircle2, Clock, AlertTriangle } from "lucide-react";
import { Link } from "wouter";

const STATUS_OPTIONS = [
  { value: "all", label: "All Statuses" },
  { value: "open", label: "Open" },
  { value: "in_progress", label: "In Progress" },
  { value: "responded", label: "Responded" },
  { value: "closed", label: "Closed" },
];

function statusBadge(status: string) {
  switch (status) {
    case "closed": return <Badge variant="default" className="bg-green-600"><CheckCircle2 className="h-3 w-3 mr-1" />Closed</Badge>;
    case "responded": return <Badge variant="secondary" className="bg-blue-100 text-blue-800"><CheckCircle2 className="h-3 w-3 mr-1" />Responded</Badge>;
    case "in_progress": return <Badge variant="secondary"><Clock className="h-3 w-3 mr-1" />In Progress</Badge>;
    default: return <Badge variant="outline" className="border-orange-300 text-orange-700"><AlertTriangle className="h-3 w-3 mr-1" />Open</Badge>;
  }
}

export default function ApprovalsAllRfis() {
  const [status, setStatus] = useState("all");

  const { data: rfis, isLoading } = trpc.approvals.allRfis.useQuery({
    status: status !== "all" ? status : undefined,
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <MessageSquareWarning className="h-6 w-6" /> All RFIs & Conditions
          </h1>
          <p className="text-muted-foreground text-sm">Requests for information across all approval projects</p>
        </div>
        <Badge variant="secondary">{rfis?.length ?? 0} RFIs</Badge>
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

      {/* RFIs table */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : !rfis || rfis.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No RFIs found matching the selected filters.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/50">
                  <tr>
                    <th className="text-left p-3 font-medium">Subject</th>
                    <th className="text-left p-3 font-medium">Project</th>
                    <th className="text-left p-3 font-medium">Status</th>
                    <th className="text-left p-3 font-medium">Blocking</th>
                    <th className="text-left p-3 font-medium">Requested By</th>
                    <th className="text-left p-3 font-medium">Assigned To</th>
                    <th className="text-left p-3 font-medium">Due</th>
                    <th className="text-left p-3 font-medium">Received</th>
                  </tr>
                </thead>
                <tbody>
                  {rfis.map((rfi) => (
                    <tr key={rfi.id} className="border-b hover:bg-muted/30 transition-colors">
                      <td className="p-3">
                        <Link href={`/approvals/projects/${rfi.projectId}`} className="font-medium hover:underline text-primary">
                          {rfi.subject}
                        </Link>
                      </td>
                      <td className="p-3 text-muted-foreground">
                        <Link href={`/approvals/projects/${rfi.projectId}`} className="hover:underline">
                          {rfi.projectNumber || `#${rfi.projectId}`}
                        </Link>
                      </td>
                      <td className="p-3">{statusBadge(rfi.status || "open")}</td>
                      <td className="p-3">
                        {rfi.isBlocking ? (
                          <Badge variant="destructive" className="text-xs">Blocking</Badge>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="p-3 text-muted-foreground">{rfi.requestedBy || "—"}</td>
                      <td className="p-3 text-muted-foreground">{rfi.assignedToName || "—"}</td>
                      <td className="p-3 text-muted-foreground">
                        {rfi.dueAt ? new Date(rfi.dueAt).toLocaleDateString() : "—"}
                      </td>
                      <td className="p-3 text-muted-foreground">
                        {rfi.receivedAt ? new Date(rfi.receivedAt).toLocaleDateString() : "—"}
                      </td>
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
