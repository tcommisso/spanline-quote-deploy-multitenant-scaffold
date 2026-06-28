import { trpc } from "@/lib/trpc";
import { useRoute, Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  MapPin, Phone, Users, FileText, Download, ChevronRight,
  ArrowLeft, Briefcase, Calendar, Clock, HardHat,
  ClipboardCheck, AlertTriangle, ShieldCheck,
} from "lucide-react";

// ─── Job List View ──────────────────────────────────────────────────────────
function JobListView() {
  const { data: jobs, isLoading } = trpc.tradePortal.getJobsList.useQuery();

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map(i => (
          <div key={i} className="h-24 bg-slate-100 rounded-lg animate-pulse" />
        ))}
      </div>
    );
  }

  if (!jobs || jobs.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Briefcase className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground">No jobs assigned to you yet.</p>
        </CardContent>
      </Card>
    );
  }

  const statusColors: Record<string, string> = {
    scheduled: "bg-blue-100 text-blue-700",
    in_progress: "bg-primary/10 text-primary",
    on_hold: "bg-orange-100 text-orange-700",
    completed: "bg-green-100 text-green-700",
    cancelled: "bg-red-100 text-red-700",
  };

  return (
    <div className="space-y-3">
      {jobs.map(job => (
        <Link key={job.id} href={`/trade-portal/jobs/${job.id}`}>
          <Card className="cursor-pointer hover:shadow-md transition-shadow border-l-4 border-l-primary">
            <CardContent className="py-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-semibold text-sm truncate">{job.clientName}</h3>
                    <Badge className={`text-[10px] px-1.5 py-0 ${statusColors[job.status] || "bg-slate-100 text-slate-600"}`}>
                      {job.status.replace("_", " ")}
                    </Badge>
                  </div>
                  {job.quoteNumber && (
                    <p className="text-xs text-muted-foreground mb-1">#{job.quoteNumber}</p>
                  )}
                  {job.siteAddress && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <MapPin className="w-3 h-3 shrink-0" />
                      <span className="truncate">{job.siteAddress}</span>
                    </p>
                  )}
                  {job.scheduledStart && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                      <Calendar className="w-3 h-3 shrink-0" />
                      {new Date(job.scheduledStart).toLocaleDateString()}
                      {job.scheduledEnd && ` — ${new Date(job.scheduledEnd).toLocaleDateString()}`}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {job.sharedFileCount > 0 && (
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                      <FileText className="w-3 h-3 mr-0.5" />
                      {job.sharedFileCount}
                    </Badge>
                  )}
                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                </div>
              </div>
            </CardContent>
          </Card>
        </Link>
      ))}
    </div>
  );
}

const instructionCategoryLabels: Record<string, string> = {
  general: "General",
  inspection: "Inspection",
  hold_point: "Hold Point",
  site_access: "Site Access",
  safety: "Safety",
  completion_evidence: "Completion Evidence",
  contract_reminder: "Contract Reminder",
  other: "Other",
};

function formatInstructionStatus(value?: string | null) {
  const text = String(value || "").trim();
  return text ? text.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase()) : "Open";
}

function instructionStatusClass(status?: string | null) {
  const normalized = String(status || "").toLowerCase();
  if (["done", "passed"].includes(normalized)) return "bg-green-100 text-green-700 border-green-200";
  if (["blocked", "failed"].includes(normalized)) return "bg-red-100 text-red-700 border-red-200";
  if (["scheduled", "booked", "acknowledged", "deferred"].includes(normalized)) return "bg-amber-100 text-amber-700 border-amber-200";
  if (["not_applicable", "cancelled"].includes(normalized)) return "bg-slate-100 text-slate-600 border-slate-200";
  return "bg-blue-100 text-blue-700 border-blue-200";
}

function instructionIcon(sourceType?: string | null) {
  if (sourceType === "approval_inspection") return ShieldCheck;
  if (sourceType === "subcontract_inspection") return FileText;
  return ClipboardCheck;
}

function formatInstructionDate(item: any) {
  const parts: string[] = [];
  if (item.dueAt) {
    const date = new Date(item.dueAt);
    if (!Number.isNaN(date.getTime())) {
      parts.push(date.toLocaleDateString("en-AU", { day: "2-digit", month: "short", year: "numeric" }));
    }
  }
  if (item.scheduledTime) parts.push(item.scheduledTime);
  if (item.triggerLabel) parts.push(item.triggerLabel);
  return parts.join(" - ");
}

// ─── Job Detail View ────────────────────────────────────────────────────────
function JobDetailView({ jobId }: { jobId: number }) {
  const { data: job, isLoading } = trpc.tradePortal.getJobDetail.useQuery({ jobId });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-32 bg-slate-100 rounded animate-pulse" />
        <div className="h-48 bg-slate-100 rounded-lg animate-pulse" />
        <div className="h-32 bg-slate-100 rounded-lg animate-pulse" />
      </div>
    );
  }

  if (!job) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <p className="text-muted-foreground">Job not found or you don't have access.</p>
          <Link href="/trade-portal/jobs">
            <Button variant="outline" className="mt-3">
              <ArrowLeft className="w-4 h-4 mr-1" /> Back to Jobs
            </Button>
          </Link>
        </CardContent>
      </Card>
    );
  }

  const j = job.job;

  const statusColors: Record<string, string> = {
    scheduled: "bg-blue-100 text-blue-700",
    in_progress: "bg-primary/10 text-primary",
    on_hold: "bg-orange-100 text-orange-700",
    completed: "bg-green-100 text-green-700",
    cancelled: "bg-red-100 text-red-700",
  };

  const fileCategoryIcons: Record<string, string> = {
    plans: "📐",
    engineering: "⚙️",
    specs: "📋",
    permits: "📄",
    photos: "📷",
    other: "📎",
  };

  return (
    <div className="space-y-4">
      {/* Back button */}
      <Link href="/trade-portal/jobs">
        <Button variant="ghost" size="sm" className="gap-1 -ml-2 text-muted-foreground">
          <ArrowLeft className="w-4 h-4" /> All Jobs
        </Button>
      </Link>

      {/* Job Header */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle className="text-lg">{j.clientName}</CardTitle>
              {j.quoteNumber && (
                <p className="text-sm text-muted-foreground mt-0.5">#{j.quoteNumber}</p>
              )}
            </div>
            <Badge className={`${statusColors[j.status] || "bg-slate-100 text-slate-600"}`}>
              {j.status.replace("_", " ")}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {j.siteAddress && (
            <div className="flex items-start gap-2 text-sm">
              <MapPin className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
              <span>{j.siteAddress}</span>
            </div>
          )}
          {(j.scheduledStart || j.scheduledEnd) && (
            <div className="flex items-center gap-2 text-sm">
              <Calendar className="w-4 h-4 text-muted-foreground shrink-0" />
              <span>
                {j.scheduledStart && new Date(j.scheduledStart).toLocaleDateString()}
                {j.scheduledStart && j.scheduledEnd && " — "}
                {j.scheduledEnd && new Date(j.scheduledEnd).toLocaleDateString()}
              </span>
            </div>
          )}
          {j.clientPhone && (
            <div className="flex items-center gap-2 text-sm">
              <Phone className="w-4 h-4 text-muted-foreground shrink-0" />
              <a href={`tel:${j.clientPhone}`} className="text-primary hover:underline font-medium">
                {j.clientPhone}
              </a>
              <span className="text-xs text-muted-foreground">(Site contact)</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Job Instructions */}
      {job.jobInstructions && job.jobInstructions.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between gap-3">
              <CardTitle className="text-base flex items-center gap-2">
                <ClipboardCheck className="w-4 h-4" /> Job Instructions
              </CardTitle>
              <Badge variant="secondary">{job.jobInstructions.length}</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {job.jobInstructions.map((item: any) => {
              const Icon = instructionIcon(item.sourceType);
              const meta = [
                instructionCategoryLabels[item.category] || formatInstructionStatus(item.category),
                item.sourceLabel,
              ].filter(Boolean).join(" - ");
              const dateText = formatInstructionDate(item);
              return (
                <div
                  key={item.id}
                  className={`rounded-lg border p-3 ${item.isBlocking ? "border-red-200 bg-red-50" : "bg-slate-50"}`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md ${item.isBlocking ? "bg-red-100 text-red-700" : "bg-primary/10 text-primary"}`}>
                      {item.isBlocking ? <AlertTriangle className="w-4 h-4" /> : <Icon className="w-4 h-4" />}
                    </div>
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <p className="text-sm font-semibold">{item.title}</p>
                        <Badge variant="outline" className={`text-[10px] ${instructionStatusClass(item.status)}`}>
                          {formatInstructionStatus(item.status)}
                        </Badge>
                        {item.isBlocking && <Badge variant="destructive" className="text-[10px]">Hold Point</Badge>}
                        {item.hasDefects && (
                          <Badge variant="destructive" className="text-[10px]">
                            {item.defectCount || 1} defect{(item.defectCount || 1) === 1 ? "" : "s"}
                          </Badge>
                        )}
                      </div>
                      {meta && <p className="text-xs text-muted-foreground">{meta}</p>}
                      {dateText && (
                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {dateText}
                        </p>
                      )}
                      {item.inspectorName && (
                        <p className="text-xs text-muted-foreground">Inspector: {item.inspectorName}</p>
                      )}
                      {item.description && (
                        <p className="text-xs text-slate-700 whitespace-pre-wrap">{item.description}</p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* Work Orders */}
      {job.workOrders && job.workOrders.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="w-4 h-4" /> Your Work Orders
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {job.workOrders.map((wo: any) => (
              <div key={wo.id} className="border rounded-lg p-3 bg-slate-50">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-medium text-sm">{wo.tradeType}</p>
                    {wo.scope && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{wo.scope}</p>}
                  </div>
                  <Badge variant="outline" className="text-[10px] shrink-0">
                    {wo.status}
                  </Badge>
                </div>
                {wo.scheduledDate && (
                  <p className="text-xs text-muted-foreground mt-1.5 flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    Scheduled: {new Date(wo.scheduledDate).toLocaleDateString()}
                  </p>
                )}
                {wo.estimatedCost && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Est. cost: ${Number(wo.estimatedCost).toLocaleString()}
                  </p>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Other Trades on This Job */}
      {job.assignedTrades && job.assignedTrades.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="w-4 h-4" /> Other Trades on This Job
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="divide-y">
              {job.assignedTrades.map((trade: any, idx: number) => (
                <div key={idx} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <HardHat className="w-4 h-4 text-primary" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{trade.installerName}</p>
                    {trade.tradeType && (
                      <p className="text-xs text-muted-foreground">{trade.tradeType}</p>
                    )}
                  </div>
                  {trade.installerPhone && (
                    <a href={`tel:${trade.installerPhone}`} className="shrink-0">
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <Phone className="w-3.5 h-3.5 text-primary" />
                      </Button>
                    </a>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Shared Files */}
      {job.sharedFiles && job.sharedFiles.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="w-4 h-4" /> Job Documents
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {job.sharedFiles.map((file: any) => (
              <a
                key={file.id}
                href={file.fileUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 p-2.5 rounded-lg border hover:bg-slate-50 transition-colors"
              >
                <span className="text-lg shrink-0">
                  {fileCategoryIcons[file.category || "other"] || "📎"}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{file.fileName}</p>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    {file.category && <span className="capitalize">{file.category}</span>}
                    {file.fileSize && (
                      <span>{(file.fileSize / 1024).toFixed(0)} KB</span>
                    )}
                    <span>{new Date(file.createdAt).toLocaleDateString()}</span>
                  </div>
                  {file.description && (
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{file.description}</p>
                  )}
                </div>
                <Download className="w-4 h-4 text-muted-foreground shrink-0" />
              </a>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Subcontracts */}
      {job.subcontracts && job.subcontracts.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="w-4 h-4" /> Your Subcontracts
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {job.subcontracts.map((sc: any) => (
              <div key={sc.id} className="flex items-center justify-between p-2.5 rounded-lg border">
                <div>
                  <p className="text-sm font-medium">{sc.tradeType || "Subcontract"}</p>
                  <p className="text-xs text-muted-foreground">
                    {sc.status === "signed" ? "✅ Signed" : sc.status === "sent" ? "📤 Awaiting signature" : sc.status}
                  </p>
                </div>
                {sc.pdfUrl && (
                  <a href={sc.pdfUrl} target="_blank" rel="noopener noreferrer">
                    <Button variant="outline" size="sm" className="gap-1 text-xs">
                      <Download className="w-3 h-3" /> PDF
                    </Button>
                  </a>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────
export default function TradePortalJobs() {
  const [, params] = useRoute("/trade-portal/jobs/:jobId");
  const jobId = params?.jobId ? Number(params.jobId) : null;

  return (
    <div>
      <h1 className="text-xl font-bold text-slate-800 mb-4">
        {jobId ? "Job Details" : "My Jobs"}
      </h1>
      {jobId ? <JobDetailView jobId={jobId} /> : <JobListView />}
    </div>
  );
}
