import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Loader2, FileText, CheckCircle2, Clock, Upload, AlertCircle } from "lucide-react";
import { Link } from "wouter";

const STATUS_OPTIONS = [
  { value: "all", label: "All Statuses" },
  { value: "required", label: "Required" },
  { value: "in_progress", label: "In Progress" },
  { value: "uploaded", label: "Uploaded" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
];

const TYPE_OPTIONS = [
  { value: "all", label: "All Types" },
  { value: "site_plan", label: "Site Plan" },
  { value: "floor_plan", label: "Floor Plan" },
  { value: "elevations", label: "Elevations" },
  { value: "structural", label: "Structural" },
  { value: "basix", label: "BASIX" },
  { value: "survey", label: "Survey" },
  { value: "geotechnical", label: "Geotechnical" },
  { value: "stormwater", label: "Stormwater" },
  { value: "landscape", label: "Landscape" },
  { value: "bushfire", label: "Bushfire" },
  { value: "specification", label: "Specification" },
  { value: "contract", label: "Contract" },
  { value: "other", label: "Other" },
];

function statusBadge(status: string) {
  switch (status) {
    case "approved": return <Badge variant="default" className="bg-green-600"><CheckCircle2 className="h-3 w-3 mr-1" />Approved</Badge>;
    case "uploaded": return <Badge variant="secondary" className="bg-blue-100 text-blue-800"><Upload className="h-3 w-3 mr-1" />Uploaded</Badge>;
    case "in_progress": return <Badge variant="secondary"><Clock className="h-3 w-3 mr-1" />In Progress</Badge>;
    case "rejected": return <Badge variant="destructive"><AlertCircle className="h-3 w-3 mr-1" />Rejected</Badge>;
    default: return <Badge variant="outline"><Clock className="h-3 w-3 mr-1" />Required</Badge>;
  }
}

export default function ApprovalsAllDocuments() {
  const [status, setStatus] = useState("all");
  const [documentType, setDocumentType] = useState("all");

  const { data: documents, isLoading } = trpc.approvals.allDocuments.useQuery({
    status: status !== "all" ? status : undefined,
    documentType: documentType !== "all" ? documentType : undefined,
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <FileText className="h-6 w-6" /> All Documents
          </h1>
          <p className="text-muted-foreground text-sm">Documents across all approval projects</p>
        </div>
        <Badge variant="secondary">{documents?.length ?? 0} documents</Badge>
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
        <Select value={documentType} onValueChange={setDocumentType}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Document Type" />
          </SelectTrigger>
          <SelectContent>
            {TYPE_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Documents table */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : !documents || documents.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No documents found matching the selected filters.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/50">
                  <tr>
                    <th className="text-left p-3 font-medium">Document</th>
                    <th className="text-left p-3 font-medium">Project</th>
                    <th className="text-left p-3 font-medium">Type</th>
                    <th className="text-left p-3 font-medium">Status</th>
                    <th className="text-left p-3 font-medium">Prepared By</th>
                    <th className="text-left p-3 font-medium">Flags</th>
                    <th className="text-left p-3 font-medium">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {documents.map((doc) => (
                    <tr key={doc.id} className="border-b hover:bg-muted/30 transition-colors">
                      <td className="p-3">
                        <Link href={`/approvals/projects/${doc.projectId}`} className="font-medium hover:underline text-primary">
                          {doc.title}
                        </Link>
                      </td>
                      <td className="p-3 text-muted-foreground">
                        <Link href={`/approvals/projects/${doc.projectId}`} className="hover:underline">
                          {doc.projectNumber || `#${doc.projectId}`}
                        </Link>
                      </td>
                      <td className="p-3">
                        <Badge variant="outline" className="text-xs capitalize">{doc.documentType?.replace(/_/g, " ") || "other"}</Badge>
                      </td>
                      <td className="p-3">{statusBadge(doc.status || "required")}</td>
                      <td className="p-3 text-muted-foreground">{doc.preparedByParty || "—"}</td>
                      <td className="p-3 flex gap-1">
                        {doc.signatureRequired && <Badge variant="outline" className="text-xs">Sig</Badge>}
                        {doc.checklistRequired && <Badge variant="outline" className="text-xs">Checklist</Badge>}
                      </td>
                      <td className="p-3 text-muted-foreground">
                        {doc.createdAt ? new Date(doc.createdAt).toLocaleDateString() : "—"}
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
