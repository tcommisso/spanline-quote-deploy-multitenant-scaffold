import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  FileText, Download, ExternalLink, CheckCircle2, XCircle,
  MessageSquare, Loader2, Send, ChevronDown, ChevronUp, PenTool, Archive,
} from "lucide-react";
import { toast } from "sonner";
import { PlanAnnotation } from "@/components/PlanAnnotation";
import JSZip from "jszip";
import { logClientDownload } from "@/lib/userActivity";

const statusConfig: Record<string, { label: string; color: string }> = {
  submitted_to_client: { label: "Awaiting Your Approval", color: "bg-primary/10 text-primary" },
  client_approved: { label: "Approved", color: "bg-green-100 text-green-700" },
  client_rejected: { label: "Rejected", color: "bg-red-100 text-red-700" },
  submitted_to_council: { label: "Submitted to Council", color: "bg-purple-100 text-purple-700" },
  council_approved: { label: "Council Approved", color: "bg-emerald-100 text-emerald-700" },
  council_rejected: { label: "Council Rejected", color: "bg-red-100 text-red-700" },
};

export default function PortalPlans() {
  const plansQuery = trpc.plans.portalListPlans.useQuery();
  const [expandedPlan, setExpandedPlan] = useState<number | null>(null);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold">Plans & Drawings</h1>
          <p className="text-sm text-muted-foreground">Review and approve plans for your project</p>
        </div>
        <DownloadAllButton />
      </div>

      {plansQuery.isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-24 w-full" />)}
        </div>
      ) : !plansQuery.data?.length ? (
        <Card>
          <CardContent className="py-12 text-center">
            <FileText className="w-12 h-12 mx-auto mb-4 text-muted-foreground/50" />
            <p className="text-muted-foreground">No plans available yet</p>
            <p className="text-sm text-muted-foreground mt-1">Plans will appear here once your project team submits them for your review.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {plansQuery.data.map((plan) => (
            <PlanCard
              key={plan.id}
              plan={plan}
              expanded={expandedPlan === plan.id}
              onToggle={() => setExpandedPlan(expandedPlan === plan.id ? null : plan.id)}
              onRefresh={() => plansQuery.refetch()}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function PlanCard({ plan, expanded, onToggle, onRefresh }: {
  plan: any;
  expanded: boolean;
  onToggle: () => void;
  onRefresh: () => void;
}) {
  const status = statusConfig[plan.status] || { label: plan.status, color: "bg-gray-100 text-gray-700" };
  const needsAction = plan.status === "submitted_to_client";

  return (
    <Card className={needsAction ? "ring-2 ring-primary/50" : ""}>
      <CardContent className="py-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center shrink-0">
            <FileText className="w-5 h-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-medium text-sm sm:text-base truncate">{plan.title}</p>
              {plan.version > 1 && <Badge variant="outline" className="text-[10px]">v{plan.version}</Badge>}
              <Badge className={`text-[10px] sm:text-xs ${status.color}`}>{status.label}</Badge>
            </div>
            {plan.description && <p className="text-xs text-muted-foreground mt-1">{plan.description}</p>}
            <p className="text-[10px] sm:text-xs text-muted-foreground mt-1">
              {plan.fileName} • {new Date(plan.createdAt).toLocaleDateString("en-AU")}
            </p>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
              <a href={plan.fileUrl} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="w-4 h-4" />
              </a>
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onToggle}>
              {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </Button>
          </div>
        </div>

        {expanded && (
          <div className="mt-4 pt-4 border-t space-y-4">
            {/* Action buttons for plans awaiting approval */}
            {needsAction && (
              <ApprovalActions planId={plan.id} planTitle={plan.title} fileUrl={plan.fileUrl} fileName={plan.fileName} onComplete={onRefresh} />
            )}

            {/* Comments section */}
            <CommentsSection planId={plan.id} canComment={plan.status !== "draft"} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ApprovalActions({ planId, planTitle, fileUrl, fileName, onComplete }: { planId: number; planTitle: string; fileUrl: string; fileName: string; onComplete: () => void }) {
  const [showReject, setShowReject] = useState(false);
  const [rejectComment, setRejectComment] = useState("");
  const [approveComment, setApproveComment] = useState("");
  const [showApproveComment, setShowApproveComment] = useState(false);
  const [showAnnotation, setShowAnnotation] = useState(false);
  const [annotationAttached, setAnnotationAttached] = useState(false);
  const [annotationBase64, setAnnotationBase64] = useState<string | null>(null);
  const canAnnotate = /\.(png|jpg|jpeg|gif|webp|pdf)$/i.test(fileName);

  const approveMutation = trpc.plans.portalApprovePlan.useMutation({
    onSuccess: () => { toast.success("Plan approved successfully"); onComplete(); },
    onError: (e) => toast.error(e.message),
  });

  const rejectMutation = trpc.plans.portalRejectPlan.useMutation({
    onSuccess: () => { toast.success("Plan rejected - your feedback has been sent"); onComplete(); },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="space-y-3">
      <p className="text-sm font-medium text-primary">This plan requires your approval</p>

      {!showReject ? (
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="flex-1 space-y-2">
            {showApproveComment && (
              <Textarea
                value={approveComment}
                onChange={(e) => setApproveComment(e.target.value)}
                placeholder="Optional comment with your approval..."
                rows={2}
                className="text-sm"
              />
            )}
            <div className="flex gap-2">
              <Button
                onClick={() => approveMutation.mutate({ planId, comment: approveComment || undefined })}
                disabled={approveMutation.isPending}
                size="sm"
                className="bg-green-600 hover:bg-green-700"
              >
                {approveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <CheckCircle2 className="h-4 w-4 mr-1.5" />}
                Approve Plan
              </Button>
              {!showApproveComment && (
                <Button variant="ghost" size="sm" onClick={() => setShowApproveComment(true)}>
                  <MessageSquare className="h-4 w-4 mr-1.5" /> Add Comment
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowReject(true)}
                className="text-red-600 hover:text-red-700 border-red-200 hover:border-red-300"
              >
                <XCircle className="h-4 w-4 mr-1.5" /> Reject
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <Textarea
            value={rejectComment}
            onChange={(e) => setRejectComment(e.target.value)}
            placeholder="Please explain why you're rejecting this plan..."
            rows={3}
            className="text-sm"
          />
          {canAnnotate && (
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowAnnotation(true)}
                className="text-xs"
              >
                <PenTool className="h-3.5 w-3.5 mr-1.5" />
                {annotationAttached ? "Edit Markup" : "Add Markup"}
              </Button>
              {annotationAttached && (
                <span className="text-xs text-green-600 font-medium">Annotation attached</span>
              )}
            </div>
          )}
          <div className="flex gap-2">
            <Button
              onClick={() => rejectMutation.mutate({ planId, comment: rejectComment, annotationBase64: annotationBase64 || undefined })}
              disabled={rejectMutation.isPending || !rejectComment.trim()}
              size="sm"
              variant="destructive"
            >
              {rejectMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <XCircle className="h-4 w-4 mr-1.5" />}
              Confirm Rejection
            </Button>
            <Button variant="ghost" size="sm" onClick={() => { setShowReject(false); setRejectComment(""); setAnnotationBase64(null); setAnnotationAttached(false); }}>
              Cancel
            </Button>
          </div>
          <PlanAnnotation
            open={showAnnotation}
            onClose={() => setShowAnnotation(false)}
            imageUrl={fileUrl}
            planTitle={planTitle}
            onSave={(base64) => {
              setAnnotationBase64(base64);
              setAnnotationAttached(true);
              setRejectComment((prev) => {
                const cleaned = prev.replace(/\n?\[Annotated markup attached\]/g, "").trim();
                return cleaned ? cleaned + "\n[Annotated markup attached]" : "[Annotated markup attached]";
              });
              setShowAnnotation(false);
              toast.success("Markup attached to rejection");
            }}
          />
        </div>
      )}
    </div>
  );
}

function CommentsSection({ planId, canComment }: { planId: number; canComment: boolean }) {
  const [newComment, setNewComment] = useState("");
  const detailQuery = trpc.plans.portalGetDetail.useQuery({ planId });

  const addCommentMutation = trpc.plans.portalAddComment.useMutation({
    onSuccess: () => { setNewComment(""); detailQuery.refetch(); toast.success("Comment added"); },
    onError: (e) => toast.error(e.message),
  });

  const comments = detailQuery.data?.comments || [];

  return (
    <div className="space-y-3">
      <h4 className="text-sm font-medium flex items-center gap-1.5">
        <MessageSquare className="h-4 w-4" /> Comments ({comments.length})
      </h4>

      {comments.length > 0 && (
        <div className="space-y-2 max-h-60 overflow-y-auto">
          {comments.map((c: any) => (
            <div key={c.id} className={`text-sm p-2.5 rounded-lg ${c.userType === "client" ? "bg-primary/5 border border-primary/10" : "bg-gray-50 border border-gray-100"}`}>
              <div className="flex items-center gap-2 mb-1">
                <span className="font-medium text-xs">
                  {c.userType === "client" ? "You" : "Altaspan Team"}
                </span>
                <span className="text-[10px] text-muted-foreground">
                  {new Date(c.createdAt).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
              <p className="text-xs sm:text-sm">{c.comment}</p>
              {c.attachmentUrl && (
                <a href={c.attachmentUrl} target="_blank" rel="noopener noreferrer" className="block mt-2">
                  <img src={c.attachmentUrl} alt="Annotation" className="max-w-full max-h-40 rounded border object-contain" />
                  <span className="text-[10px] text-primary mt-1 inline-block">View full markup</span>
                </a>
              )}
            </div>
          ))}
        </div>
      )}

      {canComment && (
        <div className="flex gap-2">
          <Textarea
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            placeholder="Add a comment..."
            rows={2}
            className="text-sm flex-1"
          />
          <Button
            onClick={() => addCommentMutation.mutate({ planId, comment: newComment })}
            disabled={!newComment.trim() || addCommentMutation.isPending}
            size="icon"
            className="h-auto self-end"
          >
            {addCommentMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
      )}
    </div>
  );
}

function DownloadAllButton() {
  const [downloading, setDownloading] = useState(false);
  const approvedFilesQuery = trpc.plans.portalGetApprovedFiles.useQuery();

  const handleDownload = async () => {
    const files = approvedFilesQuery.data;
    if (!files || files.length === 0) {
      toast.error("No approved plans to download");
      return;
    }

    setDownloading(true);
    toast.info(`Preparing ZIP with ${files.length} plan${files.length > 1 ? "s" : ""}...`);

    try {
      const zip = new JSZip();
      const usedNames = new Set<string>();

      for (const file of files) {
        try {
          const response = await fetch(file.fileUrl);
          if (!response.ok) continue;
          const blob = await response.blob();

          // Generate unique filename
          let name = file.fileName;
          if (file.version > 1) {
            const ext = name.lastIndexOf(".");
            name = ext > 0
              ? `${name.slice(0, ext)}_v${file.version}${name.slice(ext)}`
              : `${name}_v${file.version}`;
          }
          if (file.category) {
            name = `${file.category}/${name}`;
          }
          // Deduplicate
          let finalName = name;
          let counter = 1;
          while (usedNames.has(finalName)) {
            const ext = name.lastIndexOf(".");
            finalName = ext > 0
              ? `${name.slice(0, ext)}_${counter}${name.slice(ext)}`
              : `${name}_${counter}`;
            counter++;
          }
          usedNames.add(finalName);

          zip.file(finalName, blob);
        } catch (e) {
          console.warn(`Failed to fetch file: ${file.fileName}`, e);
        }
      }

      const content = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(content);
      const a = document.createElement("a");
      const filename = `Approved_Plans_${new Date().toISOString().slice(0, 10)}.zip`;
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      logClientDownload({
        filename,
        source: "client_portal_approved_plans_zip",
        entityType: "portal_plan",
        mimeType: "application/zip",
        metadata: {
          fileCount: files.length,
          zippedFileCount: usedNames.size,
        },
      });
      toast.success("ZIP downloaded successfully");
    } catch (e) {
      console.error("ZIP generation failed:", e);
      toast.error("Failed to generate ZIP file");
    } finally {
      setDownloading(false);
    }
  };

  const approvedCount = approvedFilesQuery.data?.length || 0;

  if (approvedCount === 0) return null;

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleDownload}
      disabled={downloading}
      className="shrink-0"
    >
      {downloading ? (
        <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
      ) : (
        <Archive className="h-4 w-4 mr-1.5" />
      )}
      <span className="hidden sm:inline">Download All ({approvedCount})</span>
      <span className="sm:hidden">{approvedCount}</span>
    </Button>
  );
}
