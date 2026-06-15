import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, Star, Trash2, Filter, FileDown } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";
import { isAdminRole } from "@shared/const";

function StarRating({ value, onChange, size = "md" }: { value: number; onChange?: (v: number) => void; size?: "sm" | "md" }) {
  const starSize = size === "sm" ? "h-4 w-4" : "h-5 w-5";
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          disabled={!onChange}
          className={`${onChange ? "cursor-pointer hover:scale-110" : "cursor-default"} transition-transform`}
          onClick={() => onChange?.(star)}
        >
          <Star className={`${starSize} ${star <= value ? "fill-amber-400 text-amber-400" : "text-gray-300"}`} />
        </button>
      ))}
    </div>
  );
}

function RatingDisplay({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-muted-foreground">{label}</span>
      <div className="flex items-center gap-1">
        <StarRating value={Math.round(value)} size="sm" />
        <span className="text-sm font-medium ml-1">{value.toFixed(1)}</span>
      </div>
    </div>
  );
}

export default function SupplierFeedback() {
  const { user } = useAuth();
  const isAdmin = user ? isAdminRole(user.role) : false;
  const [showDialog, setShowDialog] = useState(false);
  const [filterSupplierId, setFilterSupplierId] = useState<string>("");
  const utils = trpc.useUtils();

  const { data: feedbackData, isLoading } = trpc.supplierFeedback.list.useQuery({
    supplierId: filterSupplierId ? Number(filterSupplierId) : undefined,
  });
  const { data: suppliersData } = trpc.suppliers.list.useQuery({ activeOnly: true });
  const suppliers = suppliersData || [];

  const deleteMutation = trpc.supplierFeedback.delete.useMutation({
    onSuccess: () => { utils.supplierFeedback.list.invalidate(); toast.success("Feedback deleted"); },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Supplier Feedback</h1>
          <p className="text-muted-foreground">Rate and review supplier performance across deliveries and orders</p>
        </div>
        <Button variant="brand" onClick={() => setShowDialog(true)} className="gap-1">
          <Plus className="h-4 w-4" /> Add Feedback
        </Button>
      </div>

      {/* Filter */}
      <div className="flex items-center gap-3 flex-wrap">
        <Filter className="h-4 w-4 text-muted-foreground" />
        <Select value={filterSupplierId || "all"} onValueChange={(v) => setFilterSupplierId(v === "all" ? "" : v)}>
          <SelectTrigger className="w-[250px]">
            <SelectValue placeholder="All Suppliers" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Suppliers</SelectItem>
            {suppliers.map((s: any) => (
              <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {feedbackData && (
          <Badge variant="secondary">{feedbackData.total} review{feedbackData.total !== 1 ? "s" : ""}</Badge>
        )}
        {filterSupplierId && (
          <DownloadScorecardButton supplierId={Number(filterSupplierId)} />
        )}
      </div>

      {/* Feedback list */}
      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Loading feedback...</div>
      ) : !feedbackData?.rows.length ? (
        <div className="text-center py-12 text-muted-foreground">
          No feedback yet. Click "Add Feedback" to rate a supplier.
        </div>
      ) : (
        <div className="space-y-3">
          {feedbackData.rows.map((fb: any) => (
            <Card key={fb.id}>
              <CardContent className="pt-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <span className="font-semibold">{fb.supplierName}</span>
                      <div className="flex items-center gap-1">
                        <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                        <span className="text-sm font-medium">{Number(fb.overallRating).toFixed(1)}</span>
                      </div>
                      {fb.poId && <Badge variant="outline" className="text-xs">PO #{fb.poId}</Badge>}
                      {fb.jobId && <Badge variant="outline" className="text-xs">Job #{fb.jobId}</Badge>}
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-2">
                      <RatingDisplay label="Timeliness" value={fb.timeliness} />
                      <RatingDisplay label="Quality" value={fb.quality} />
                      <RatingDisplay label="Communication" value={fb.communication} />
                      <RatingDisplay label="Pricing" value={fb.pricing} />
                    </div>
                    {fb.notes && <p className="text-sm text-muted-foreground mt-2">{fb.notes}</p>}
                    <p className="text-xs text-muted-foreground mt-2">
                      By {fb.userName || "Unknown"} · {new Date(fb.createdAt).toLocaleDateString("en-AU")}
                    </p>
                  </div>
                  {isAdmin && (
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => {
                      if (confirm("Delete this feedback?")) deleteMutation.mutate({ id: fb.id });
                    }}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <FeedbackDialog
        open={showDialog}
        onOpenChange={setShowDialog}
        suppliers={suppliers}
      />
    </div>
  );
}

function FeedbackDialog({ open, onOpenChange, suppliers, prefillSupplierId, prefillPoId, prefillJobId }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  suppliers: Array<{ id: number; name: string }>;
  prefillSupplierId?: number;
  prefillPoId?: number;
  prefillJobId?: number;
}) {
  const [supplierId, setSupplierId] = useState<string>(prefillSupplierId ? String(prefillSupplierId) : "");
  const [timeliness, setTimeliness] = useState(0);
  const [quality, setQuality] = useState(0);
  const [communication, setCommunication] = useState(0);
  const [pricing, setPricing] = useState(0);
  const [notes, setNotes] = useState("");
  const utils = trpc.useUtils();

  const createMutation = trpc.supplierFeedback.create.useMutation({
    onSuccess: () => {
      utils.supplierFeedback.list.invalidate();
      utils.supplierFeedback.allRatings.invalidate();
      onOpenChange(false);
      resetForm();
      toast.success("Feedback submitted successfully");
    },
    onError: (e) => toast.error(e.message),
  });

  const resetForm = () => {
    setSupplierId(prefillSupplierId ? String(prefillSupplierId) : "");
    setTimeliness(0); setQuality(0); setCommunication(0); setPricing(0);
    setNotes("");
  };

  const handleSubmit = () => {
    if (!supplierId) { toast.error("Please select a supplier"); return; }
    if (!timeliness || !quality || !communication || !pricing) { toast.error("Please rate all categories"); return; }
    createMutation.mutate({
      supplierId: Number(supplierId),
      timeliness, quality, communication, pricing,
      notes: notes || undefined,
      poId: prefillPoId,
      jobId: prefillJobId,
    });
  };

  const overallPreview = timeliness && quality && communication && pricing
    ? ((timeliness + quality + communication + pricing) / 4).toFixed(1)
    : null;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) resetForm(); onOpenChange(v); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Rate Supplier</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Supplier *</Label>
            <Select value={supplierId || "placeholder"} onValueChange={(v) => setSupplierId(v === "placeholder" ? "" : v)} disabled={!!prefillSupplierId}>
              <SelectTrigger><SelectValue placeholder="Select supplier..." /></SelectTrigger>
              <SelectContent>
                <SelectItem value="placeholder" disabled>Select supplier...</SelectItem>
                {suppliers.map((s) => (
                  <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Delivery Timeliness</Label>
              <StarRating value={timeliness} onChange={setTimeliness} />
            </div>
            <div className="flex items-center justify-between">
              <Label>Product Quality</Label>
              <StarRating value={quality} onChange={setQuality} />
            </div>
            <div className="flex items-center justify-between">
              <Label>Communication</Label>
              <StarRating value={communication} onChange={setCommunication} />
            </div>
            <div className="flex items-center justify-between">
              <Label>Pricing Accuracy</Label>
              <StarRating value={pricing} onChange={setPricing} />
            </div>
          </div>

          {overallPreview && (
            <div className="flex items-center justify-between bg-muted/50 rounded-md px-3 py-2">
              <span className="text-sm font-medium">Overall Rating</span>
              <div className="flex items-center gap-1">
                <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                <span className="font-semibold">{overallPreview}</span>
              </div>
            </div>
          )}

          <div>
            <Label>Notes (optional)</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Any additional comments about this supplier..." />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={createMutation.isPending}>
            {createMutation.isPending ? "Submitting..." : "Submit Feedback"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Download Scorecard Button ──────────────────────────────────────────────
function DownloadScorecardButton({ supplierId }: { supplierId: number }) {
  const scorecardMutation = trpc.supplierFeedback.scorecardPdf.useMutation({
    onSuccess: (data) => {
      // Convert base64 to blob and download
      const byteCharacters = atob(data.pdf);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = data.filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success("Scorecard PDF downloaded");
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <Button
      variant="outline"
      size="sm"
      className="gap-1"
      disabled={scorecardMutation.isPending}
      onClick={() => scorecardMutation.mutate({ supplierId })}
    >
      <FileDown className="h-4 w-4" />
      {scorecardMutation.isPending ? "Generating..." : "Download Scorecard"}
    </Button>
  );
}

// Export the dialog for use in contextual prompts
export { FeedbackDialog as SupplierFeedbackDialog };
