import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useRoute, Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  MapPin, Phone, Users, FileText, Download, ChevronRight,
  ArrowLeft, Briefcase, Calendar, Clock, HardHat,
  ClipboardCheck, AlertTriangle, ShieldCheck, CheckCircle2,
  Upload, Loader2, Camera,
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

function tradeActionStatusClass(status?: string | null) {
  if (status === "completed") return "bg-green-100 text-green-700 border-green-200";
  if (status === "acknowledged") return "bg-primary/10 text-primary border-primary/20";
  return "bg-slate-100 text-slate-600 border-slate-200";
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

function evidenceFileUrl(file: any) {
  return file?.url || "";
}

function isImageEvidence(file: any) {
  return String(file?.mimeType || "").startsWith("image/");
}

// ─── Job Detail View ────────────────────────────────────────────────────────
function JobDetailView({ jobId }: { jobId: number }) {
  const { data: job, isLoading } = trpc.tradePortal.getJobDetail.useQuery({ jobId });
  const utils = trpc.useUtils();
  const [evidenceTarget, setEvidenceTarget] = useState<any | null>(null);
  const [evidenceFile, setEvidenceFile] = useState<File | null>(null);
  const [evidenceCaption, setEvidenceCaption] = useState("");
  const [isReadingEvidence, setIsReadingEvidence] = useState(false);

  const refreshJob = () => utils.tradePortal.getJobDetail.invalidate({ jobId });
  const updateInstructionAction = trpc.tradePortal.updateJobInstructionAction.useMutation({
    onSuccess: () => {
      refreshJob();
      toast.success("Instruction updated");
    },
    onError: (err) => toast.error(err.message || "Failed to update instruction"),
  });
  const uploadEvidence = trpc.tradePortal.uploadJobInstructionEvidence.useMutation({
    onSuccess: () => {
      refreshJob();
      setEvidenceTarget(null);
      setEvidenceFile(null);
      setEvidenceCaption("");
      toast.success("Evidence uploaded");
    },
    onError: (err) => toast.error(err.message || "Failed to upload evidence"),
  });

  const handleInstructionAction = (item: any, actionStatus: "acknowledged" | "completed") => {
    updateInstructionAction.mutate({
      jobId,
      sourceType: item.sourceType,
      sourceId: item.sourceId,
      sourceKey: item.sourceKey || undefined,
      actionStatus,
    });
  };

  const openEvidenceDialog = (item: any) => {
    setEvidenceTarget(item);
    setEvidenceFile(null);
    setEvidenceCaption("");
  };

  const handleEvidenceUpload = async () => {
    if (!evidenceTarget || !evidenceFile) {
      toast.error("Select a file to upload");
      return;
    }
    setIsReadingEvidence(true);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(new Error("Unable to read file"));
        reader.readAsDataURL(evidenceFile);
      });
      const fileBase64 = dataUrl.includes(",") ? dataUrl.split(",")[1] : dataUrl;
      uploadEvidence.mutate({
        jobId,
        sourceType: evidenceTarget.sourceType,
        sourceId: evidenceTarget.sourceId,
        sourceKey: evidenceTarget.sourceKey || undefined,
        fileBase64,
        fileName: evidenceFile.name,
        fileMimeType: evidenceFile.type || "application/octet-stream",
        caption: evidenceCaption.trim() || undefined,
      });
    } catch (err: any) {
      toast.error(err.message || "Unable to read file");
    } finally {
      setIsReadingEvidence(false);
    }
  };

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
                        {item.actionStatus && (
                          <Badge variant="outline" className={`text-[10px] ${tradeActionStatusClass(item.actionStatus)}`}>
                            {item.actionStatus === "completed" ? "Done by you" : "Acknowledged"}
                          </Badge>
                        )}
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
                      {item.evidenceFiles && item.evidenceFiles.length > 0 && (
                        <div className="pt-2">
                          <p className="mb-1 text-[11px] font-medium text-slate-600">Evidence</p>
                          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                            {item.evidenceFiles.map((file: any, idx: number) => {
                              const url = evidenceFileUrl(file);
                              return (
                                <a
                                  key={`${file.key || url}-${idx}`}
                                  href={url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="overflow-hidden rounded-md border bg-white text-xs hover:bg-slate-50"
                                >
                                  {isImageEvidence(file) ? (
                                    <img src={url} alt={file.caption || file.fileName || "Evidence"} className="h-20 w-full object-cover" loading="lazy" />
                                  ) : (
                                    <div className="flex h-20 items-center justify-center bg-slate-100">
                                      <FileText className="h-5 w-5 text-muted-foreground" />
                                    </div>
                                  )}
                                  <div className="space-y-0.5 p-1.5">
                                    <p className="truncate font-medium">{file.caption || file.fileName || "Evidence"}</p>
                                    {file.uploadedAt && (
                                      <p className="text-[10px] text-muted-foreground">
                                        {new Date(file.uploadedAt).toLocaleDateString("en-AU")}
                                      </p>
                                    )}
                                  </div>
                                </a>
                              );
                            })}
                          </div>
                        </div>
                      )}
                      <div className="flex flex-wrap gap-2 pt-2">
                        {!item.actionStatus && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 gap-1 text-xs"
                            onClick={() => handleInstructionAction(item, "acknowledged")}
                            disabled={updateInstructionAction.isPending}
                          >
                            {updateInstructionAction.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                            Acknowledge
                          </Button>
                        )}
                        {item.actionStatus !== "completed" && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 gap-1 text-xs"
                            onClick={() => handleInstructionAction(item, "completed")}
                            disabled={updateInstructionAction.isPending}
                          >
                            {updateInstructionAction.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                            Mark Done
                          </Button>
                        )}
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 gap-1 text-xs"
                          onClick={() => openEvidenceDialog(item)}
                        >
                          <Camera className="h-3.5 w-3.5" />
                          Upload Evidence
                        </Button>
                      </div>
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
                    {sc.status === "signed" ? "Signed" : sc.status === "on_file" ? "Contract on file" : sc.status === "sent" ? "Awaiting signature" : sc.status}
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

      <Dialog open={!!evidenceTarget} onOpenChange={(open) => {
        if (!open) {
          setEvidenceTarget(null);
          setEvidenceFile(null);
          setEvidenceCaption("");
        }
      }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5 text-primary" />
              Upload Evidence
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {evidenceTarget && (
              <div className="rounded-md border bg-slate-50 p-3">
                <p className="text-sm font-medium">{evidenceTarget.title}</p>
                <p className="text-xs text-muted-foreground">
                  {instructionCategoryLabels[evidenceTarget.category] || formatInstructionStatus(evidenceTarget.category)}
                </p>
              </div>
            )}
            <div className="space-y-1.5">
              <Label>File</Label>
              <Input
                type="file"
                accept="image/*,.pdf,.doc,.docx"
                onChange={(event) => setEvidenceFile(event.target.files?.[0] || null)}
              />
              <p className="text-[11px] text-muted-foreground">Photos, PDFs, and documents up to 15MB.</p>
            </div>
            <div className="space-y-1.5">
              <Label>Caption</Label>
              <Input
                value={evidenceCaption}
                onChange={(event) => setEvidenceCaption(event.target.value)}
                placeholder="Optional note"
                maxLength={500}
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setEvidenceTarget(null);
                setEvidenceFile(null);
                setEvidenceCaption("");
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleEvidenceUpload}
              disabled={!evidenceFile || uploadEvidence.isPending || isReadingEvidence}
              className="gap-1.5"
            >
              {uploadEvidence.isPending || isReadingEvidence ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              Upload
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
