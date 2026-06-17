import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useParams, useLocation } from "wouter";
import { toast } from "sonner";
import { ArrowLeft, Save, CheckCircle, AlertTriangle, Smartphone } from "lucide-react";

export default function StocktakeDetail() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const stocktakeId = Number(id);

  const { data, refetch, isLoading } = trpc.stocktake.getById.useQuery({ id: stocktakeId });
  const [counts, setCounts] = useState<Record<number, { qty: string; notes: string }>>({});
  const [filter, setFilter] = useState<"all" | "uncounted" | "variance">("all");

  const updateCountsMutation = trpc.stocktake.updateCounts.useMutation({
    onSuccess: (res) => {
      toast.success(`Saved ${Object.keys(counts).length} counts (${res.itemsCounted} total counted)`);
      setCounts({});
      refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const submitForReviewMutation = trpc.stocktake.submitForReview.useMutation({
    onSuccess: (res: any) => {
      if (res.needsApproval) {
        toast.warning(`Variance $${res.totalVariance.toFixed(2)} exceeds threshold $${res.thresholdValue.toFixed(2)}. Sent for manager approval.`);
      } else {
        toast.success("Stocktake submitted for review");
      }
      refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const approveMutation = trpc.stocktake.approve.useMutation({
    onSuccess: () => {
      toast.success("Stocktake approved. Ready to finalise.");
      refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const rejectMutation = trpc.stocktake.reject.useMutation({
    onSuccess: () => {
      toast.success("Stocktake rejected.");
      refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const [approvalNotes, setApprovalNotes] = useState("");

  const finaliseMutation = trpc.stocktake.finalise.useMutation({
    onSuccess: (res) => {
      toast.success(`Stocktake finalised. ${res.adjustmentsCreated} adjustments created.`);
      refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const filteredLines = useMemo(() => {
    if (!data?.lines) return [];
    switch (filter) {
      case "uncounted": return data.lines.filter((l: any) => l.countedQty === null);
      case "variance": return data.lines.filter((l: any) => l.countedQty !== null && Number(l.variance) !== 0);
      default: return data.lines;
    }
  }, [data?.lines, filter]);

  const stats = useMemo(() => {
    if (!data?.lines) return { total: 0, counted: 0, withVariance: 0, totalVarianceValue: 0 };
    const lines = data.lines;
    return {
      total: lines.length,
      counted: lines.filter((l: any) => l.countedQty !== null).length,
      withVariance: lines.filter((l: any) => l.countedQty !== null && Number(l.variance) !== 0).length,
      totalVarianceValue: lines.reduce((sum: number, l: any) => sum + Number(l.varianceValue || 0), 0),
    };
  }, [data?.lines]);

  if (isLoading) return <div className="p-6">Loading...</div>;
  if (!data) return <div className="p-6">Stocktake not found</div>;

  const isEditable = data.status === "in_progress";
  const isReviewable = data.status === "review";
  const isPendingApproval = data.status === "pending_approval";

  const handleSaveCounts = () => {
    const entries = Object.entries(counts).filter(([, v]) => v.qty !== "");
    if (!entries.length) return;
    updateCountsMutation.mutate({
      stocktakeId,
      counts: entries.map(([lineId, v]) => ({
        lineId: Number(lineId),
        countedQty: v.qty,
        notes: v.notes || undefined,
      })),
    });
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate("/inventory/stocktake")}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">{data.stocktakeNumber}</h1>
            <p className="text-sm text-muted-foreground">
              Started {new Date(data.startedAt || data.createdAt).toLocaleDateString()} by {data.createdBy || "Unknown"}
            </p>
          </div>
          <Badge className={
            data.status === "in_progress" ? "bg-blue-100 text-blue-800" :
            data.status === "review" ? "bg-yellow-100 text-yellow-800" :
            data.status === "pending_approval" ? "bg-orange-100 text-orange-800" :
            data.status === "finalised" ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-800"
          }>{data.status.replace(/_/g, " ")}</Badge>
        </div>
        <div className="flex gap-2">
          {isEditable && (
            <Button variant="outline" onClick={() => navigate(`/inventory/stocktake/${stocktakeId}/count`)}>
              <Smartphone className="w-4 h-4 mr-2" /> Mobile Count
            </Button>
          )}
          {isEditable && Object.keys(counts).length > 0 && (
            <Button onClick={handleSaveCounts} disabled={updateCountsMutation.isPending}>
              <Save className="w-4 h-4 mr-2" /> Save Counts ({Object.keys(counts).length})
            </Button>
          )}
          {isEditable && stats.counted === stats.total && stats.total > 0 && (
            <Button variant="outline" onClick={() => submitForReviewMutation.mutate({ id: stocktakeId })}>
              <CheckCircle className="w-4 h-4 mr-2" /> Submit for Review
            </Button>
          )}
          {isReviewable && (
            <Button onClick={() => finaliseMutation.mutate({ id: stocktakeId })}
              disabled={finaliseMutation.isPending} className="bg-green-600 hover:bg-green-700">
              <CheckCircle className="w-4 h-4 mr-2" /> Finalise & Create Adjustments
            </Button>
          )}
          {isPendingApproval && (
            <div className="flex gap-2">
              <Button onClick={() => approveMutation.mutate({ id: stocktakeId, notes: approvalNotes })}
                disabled={approveMutation.isPending} className="bg-green-600 hover:bg-green-700">
                <CheckCircle className="w-4 h-4 mr-2" /> Approve
              </Button>
              <Button variant="destructive" onClick={() => rejectMutation.mutate({ id: stocktakeId, notes: approvalNotes })}
                disabled={rejectMutation.isPending}>
                Reject
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardContent className="py-4 text-center">
            <div className="text-2xl font-bold">{stats.total}</div>
            <div className="text-sm text-muted-foreground">Total Items</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4 text-center">
            <div className="text-2xl font-bold text-blue-600">{stats.counted}</div>
            <div className="text-sm text-muted-foreground">Counted</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4 text-center">
            <div className="text-2xl font-bold text-amber-600">{stats.withVariance}</div>
            <div className="text-sm text-muted-foreground">With Variance</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4 text-center">
            <div className={`text-2xl font-bold ${stats.totalVarianceValue < 0 ? "text-red-600" : "text-green-600"}`}>
              ${Math.abs(stats.totalVarianceValue).toFixed(2)}
            </div>
            <div className="text-sm text-muted-foreground">Variance Value</div>
          </CardContent>
        </Card>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-2">
        {(["all", "uncounted", "variance"] as const).map(f => (
          <Button key={f} variant={filter === f ? "default" : "outline"} size="sm"
            onClick={() => setFilter(f)}>
            {f === "all" ? `All (${stats.total})` : f === "uncounted" ? `Uncounted (${stats.total - stats.counted})` : `Variance (${stats.withVariance})`}
          </Button>
        ))}
      </div>

      {/* Lines Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">Code</th>
                  <th className="px-4 py-3 text-left font-medium">Item</th>
                  <th className="px-4 py-3 text-left font-medium">Category</th>
                  <th className="px-4 py-3 text-right font-medium">System Qty</th>
                  <th className="px-4 py-3 text-right font-medium">Counted Qty</th>
                  <th className="px-4 py-3 text-right font-medium">Variance</th>
                  <th className="px-4 py-3 text-right font-medium">Value</th>
                  <th className="px-4 py-3 text-left font-medium">Notes</th>
                </tr>
              </thead>
              <tbody>
                {filteredLines.map((line: any) => {
                  const localCount = counts[line.id];
                  const displayedQty = localCount?.qty ?? (line.countedQty !== null ? String(line.countedQty) : "");
                  const variance = line.countedQty !== null ? Number(line.variance) : null;
                  return (
                    <tr key={line.id} className="border-t hover:bg-muted/30">
                      <td className="px-4 py-2 font-mono text-xs">{line.stockItem?.code || "-"}</td>
                      <td className="px-4 py-2">{line.stockItem?.name || "Unknown"}</td>
                      <td className="px-4 py-2 text-muted-foreground">{line.stockItem?.category || "-"}</td>
                      <td className="px-4 py-2 text-right font-medium">{Number(line.systemQty).toFixed(1)}</td>
                      <td className="px-4 py-2 text-right">
                        {isEditable ? (
                          <Input type="number" step="0.1" className="w-24 ml-auto text-right h-8"
                            value={displayedQty}
                            onChange={(e) => setCounts(prev => ({
                              ...prev,
                              [line.id]: { qty: e.target.value, notes: prev[line.id]?.notes || "" }
                            }))} />
                        ) : (
                          <span className="font-medium">{line.countedQty !== null ? Number(line.countedQty).toFixed(1) : "-"}</span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-right">
                        {variance !== null && (
                          <span className={`font-medium ${variance < 0 ? "text-red-600" : variance > 0 ? "text-green-600" : ""}`}>
                            {variance > 0 ? "+" : ""}{variance.toFixed(1)}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-right">
                        {line.varianceValue && Number(line.varianceValue) !== 0 && (
                          <span className={Number(line.varianceValue) < 0 ? "text-red-600" : "text-green-600"}>
                            ${Math.abs(Number(line.varianceValue)).toFixed(2)}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2">
                        {isEditable ? (
                          <Input className="w-32 h-8" placeholder="Notes..."
                            value={localCount?.notes || line.notes || ""}
                            onChange={(e) => setCounts(prev => ({
                              ...prev,
                              [line.id]: { qty: prev[line.id]?.qty || displayedQty, notes: e.target.value }
                            }))} />
                        ) : (
                          <span className="text-xs text-muted-foreground">{line.notes || ""}</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Pending Approval */}
      {isPendingApproval && (
        <Card className="border-orange-200 bg-orange-50">
          <CardContent className="py-4 space-y-3">
            <div className="flex items-center gap-3">
              <AlertTriangle className="w-6 h-6 text-orange-600" />
              <div>
                <div className="font-medium text-orange-800">Awaiting Manager Approval</div>
                <div className="text-sm text-orange-700">
                  Total variance value ${Math.abs(stats.totalVarianceValue).toFixed(2)} exceeds the configured threshold.
                  {(data as any).approvalThresholdValue && ` Threshold: $${Number((data as any).approvalThresholdValue).toFixed(2)}`}
                </div>
              </div>
            </div>
            <Textarea placeholder="Approval/rejection notes (optional)..."
              value={approvalNotes} onChange={(e) => setApprovalNotes(e.target.value)}
              className="bg-white" rows={2} />
          </CardContent>
        </Card>
      )}

      {/* Finalised Summary */}
      {data.status === "finalised" && (
        <Card className="border-green-200 bg-green-50">
          <CardContent className="py-4">
            <div className="flex items-center gap-3">
              <CheckCircle className="w-6 h-6 text-green-600" />
              <div>
                <div className="font-medium text-green-800">Stocktake Finalised</div>
                <div className="text-sm text-green-700">
                  Completed {data.completedAt ? new Date(data.completedAt).toLocaleString() : ""} by {data.finalisedBy || "Unknown"}.
                  Adjustment movements have been created for all variances.
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
