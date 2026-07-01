import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Clock, TrendingUp, Tag, History, ArrowRight, Download, RotateCcw, Filter, FileText, Palette } from "lucide-react";
import { toast } from "sonner";
import { logClientDownload } from "@/lib/userActivity";

const ACTION_CONFIG: Record<string, { label: string; icon: any; color: string; badgeClass: string }> = {
  financial_update: { label: "Financial Update", icon: TrendingUp, color: "text-blue-600", badgeClass: "bg-blue-50 text-blue-700 border-blue-200" },
  status_change: { label: "Status Change", icon: Tag, color: "text-purple-600", badgeClass: "bg-purple-50 text-purple-700 border-purple-200" },
  recalculate: { label: "Recalculated", icon: Clock, color: "text-amber-600", badgeClass: "bg-amber-50 text-amber-700 border-amber-200" },
  spec_update: { label: "Spec Update", icon: Palette, color: "text-teal-600", badgeClass: "bg-teal-50 text-teal-700 border-teal-200" },
  revert: { label: "Reverted", icon: RotateCcw, color: "text-red-600", badgeClass: "bg-red-50 text-red-700 border-red-200" },
};

const FIELD_LABELS: Record<string, string> = {
  deliveryAmount: "Delivery Amount",
  travelAllowance: "Travel Allowance",
  travelDistanceKm: "Travel Distance (km)",
  smallJobSurcharge: "Small Job Surcharge",
  constructionMgmtAmount: "Construction Mgmt Amount",
  constructionMgmtPercent: "Construction Mgmt %",
  complexityLoading: "Complexity Loading %",
  discountPercent: "Discount %",
  councilFees: "Council Fees",
  homeWarranty: "Home Warranty",
  status: "Quote Status",
  specRoofType: "Roof Type",
  specRoofShape: "Roof Shape",
  specWidth: "Width",
  specLength: "Length",
  specFloorHeight: "Floor Height",
  specRoofTopColour: "Roof Top Colour",
  specRoofBottomColour: "Roof Bottom Colour",
  specPostsColour: "Posts Colour",
  specBeamColour: "Beam Colour",
  specChannelColour: "Channel Colour",
  specGutterColour: "Gutter Colour",
  specFasciaColour: "Fascia Colour",
  specSiteAccess: "Difficult Access",
  specSiteRestricted: "Restricted Work Times",
  specSiteMixed: "Mixed Materials/Angles",
  specFallDirection: "Fall Direction",
  specHouseWalls: "House Walls",
};

function formatValue(field: string, value: any): string {
  if (value === null || value === undefined || value === "") return "—";
  if (field === "status") {
    const statusLabels: Record<string, string> = {
      draft: "Draft", sent: "Sent", accepted: "Accepted", lost: "Lost", archived: "Archived",
    };
    return statusLabels[String(value)] || String(value);
  }
  // Boolean-like fields
  if (field === "specSiteAccess" || field === "specSiteRestricted" || field === "specSiteMixed") {
    return value === "1" || value === true ? "Yes" : "No";
  }
  // Financial fields
  const financialFields = ["deliveryAmount", "travelAllowance", "smallJobSurcharge", "constructionMgmtAmount", "councilFees", "homeWarranty"];
  if (financialFields.includes(field)) {
    const numVal = Number(value);
    if (!isNaN(numVal)) return `$${numVal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  // Percentage fields
  const pctFields = ["constructionMgmtPercent", "complexityLoading", "discountPercent"];
  if (pctFields.includes(field)) {
    const numVal = Number(value);
    if (!isNaN(numVal)) return `${numVal}%`;
  }
  return String(value);
}

function exportToCSV(revisions: any[], quoteId: number) {
  const rows: string[] = [];
  rows.push("Date,User,Action,Field,Old Value,New Value");
  for (const rev of revisions) {
    const date = new Date(rev.createdAt).toISOString();
    const user = (rev.userName || "System").replace(/,/g, " ");
    const action = ACTION_CONFIG[rev.action]?.label || rev.action;
    const changes = (rev.changes as Array<{ field: string; oldValue: any; newValue: any }>) || [];
    if (changes.length === 0) {
      rows.push(`"${date}","${user}","${action}","","",""`);
    } else {
      for (const change of changes) {
        const fieldLabel = (FIELD_LABELS[change.field] || change.field).replace(/,/g, " ");
        const oldVal = String(change.oldValue ?? "").replace(/"/g, '""');
        const newVal = String(change.newValue ?? "").replace(/"/g, '""');
        rows.push(`"${date}","${user}","${action}","${fieldLabel}","${oldVal}","${newVal}"`);
      }
    }
  }
  const csv = rows.join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const filename = `quote-${quoteId}-revisions.csv`;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
  logClientDownload({
    filename,
    source: "quote_revision_history_export",
    entityType: "quote",
    entityId: quoteId,
    mimeType: "text/csv",
    metadata: { rowCount: revisions.length },
  });
}

interface QuoteRevisionHistoryProps {
  quoteId: number;
}

export default function QuoteRevisionHistory({ quoteId }: QuoteRevisionHistoryProps) {
  const { user } = useAuth();
  const utils = trpc.useUtils();
  const isAdmin = user?.role === "admin" || user?.role === "super_admin";

  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [actionFilter, setActionFilter] = useState("all");
  const [showFilters, setShowFilters] = useState(false);

  const { data: revisions, isLoading } = trpc.quotes.getRevisions.useQuery({
    id: quoteId,
    fromDate: fromDate || undefined,
    toDate: toDate || undefined,
    action: actionFilter !== "all" ? actionFilter : undefined,
    limit: 100,
  });

  const revertMutation = trpc.quotes.revertRevision.useMutation({
    onSuccess: (data) => {
      toast.success(`Reverted ${data.revertedFields.length} field(s) to previous values`);
      utils.quotes.getRevisions.invalidate({ id: quoteId });
      utils.quotes.get.invalidate({ id: quoteId });
    },
    onError: (err) => toast.error(err.message),
  });

  const handleRevert = (revisionId: number) => {
    if (!confirm("Are you sure you want to revert this change? The quote values will be restored to what they were before this change was made.")) return;
    revertMutation.mutate({ quoteId, revisionId });
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <History className="h-4 w-4" />
            Revision History
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex gap-3 animate-pulse">
                <div className="h-8 w-8 rounded-full bg-muted shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-muted rounded w-3/4" />
                  <div className="h-3 bg-muted rounded w-1/2" />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <History className="h-4 w-4" />
            Revision History
          </CardTitle>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowFilters(!showFilters)}
              className="h-7 px-2"
            >
              <Filter className="h-3.5 w-3.5" />
            </Button>
            {revisions && revisions.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => exportToCSV(revisions, quoteId)}
                className="h-7 px-2"
                title="Export as CSV"
              >
                <Download className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </div>

        {/* Filters panel */}
        {showFilters && (
          <div className="mt-3 p-3 bg-muted/50 rounded-lg space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[11px] text-muted-foreground font-medium">From</label>
                <Input
                  type="date"
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                  className="h-8 text-xs"
                />
              </div>
              <div>
                <label className="text-[11px] text-muted-foreground font-medium">To</label>
                <Input
                  type="date"
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                  className="h-8 text-xs"
                />
              </div>
            </div>
            <div>
              <label className="text-[11px] text-muted-foreground font-medium">Action Type</label>
              <Select value={actionFilter} onValueChange={setActionFilter}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Actions</SelectItem>
                  <SelectItem value="financial_update">Financial Updates</SelectItem>
                  <SelectItem value="status_change">Status Changes</SelectItem>
                  <SelectItem value="recalculate">Recalculations</SelectItem>
                  <SelectItem value="spec_update">Spec Updates</SelectItem>
                  <SelectItem value="revert">Reverts</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {(fromDate || toDate || actionFilter !== "all") && (
              <Button
                variant="link"
                size="sm"
                className="h-6 px-0 text-xs"
                onClick={() => { setFromDate(""); setToDate(""); setActionFilter("all"); }}
              >
                Clear filters
              </Button>
            )}
          </div>
        )}
      </CardHeader>
      <CardContent>
        {!revisions || revisions.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {showFilters && (fromDate || toDate || actionFilter !== "all")
              ? "No revisions match the current filters."
              : "No revisions recorded yet. Changes to financials, status, and spec fields will appear here."}
          </p>
        ) : (
          <div className="relative">
            {/* Timeline line */}
            <div className="absolute left-4 top-0 bottom-0 w-px bg-border" />

            <div className="space-y-4">
              {revisions.map((rev) => {
                const config = ACTION_CONFIG[rev.action] || { label: rev.action, icon: History, color: "text-muted-foreground", badgeClass: "bg-muted text-muted-foreground" };
                const Icon = config.icon;
                const changes = (rev.changes as Array<{ field: string; oldValue: any; newValue: any }>) || [];
                const canRevert = isAdmin && rev.action !== "revert" && changes.length > 0;

                return (
                  <div key={rev.id} className="relative flex items-start gap-3 pl-1">
                    {/* Timeline dot */}
                    <div className={`relative z-10 h-8 w-8 rounded-full bg-background border-2 flex items-center justify-center shrink-0 ${config.color}`}>
                      <Icon className="h-3.5 w-3.5" />
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0 pt-0.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="outline" className={`text-[10px] ${config.badgeClass}`}>
                          {config.label}
                        </Badge>
                        <span className="text-[11px] text-muted-foreground">
                          {new Date(rev.createdAt).toLocaleString()}
                        </span>
                        {canRevert && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-5 px-1.5 text-[10px] text-muted-foreground hover:text-destructive"
                            onClick={() => handleRevert(rev.id)}
                            disabled={revertMutation.isPending}
                            title="Revert this change"
                          >
                            <RotateCcw className="h-3 w-3 mr-0.5" />
                            Undo
                          </Button>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        by {rev.userName || "System"}
                      </p>

                      {/* Changes list */}
                      {changes.length > 0 && (
                        <div className="mt-1.5 space-y-1">
                          {changes.map((change, idx) => (
                            <div key={idx} className="text-xs flex items-center gap-1 flex-wrap">
                              <span className="font-medium text-foreground">
                                {FIELD_LABELS[change.field] || change.field}
                              </span>
                              <span className="text-muted-foreground">
                                {formatValue(change.field, change.oldValue)}
                              </span>
                              <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />
                              <span className="font-medium text-foreground">
                                {formatValue(change.field, change.newValue)}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Summary footer */}
        {revisions && revisions.length > 0 && (
          <p className="text-[11px] text-muted-foreground mt-4 pt-3 border-t">
            Showing {revisions.length} revision{revisions.length !== 1 ? "s" : ""}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
