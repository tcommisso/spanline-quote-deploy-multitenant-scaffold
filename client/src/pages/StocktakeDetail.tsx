import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useParams, useLocation } from "wouter";
import { toast } from "sonner";
import { ArrowLeft, Save, CheckCircle, AlertTriangle, Smartphone, Plus } from "lucide-react";

type CountCondition = "new" | "damaged" | "off_cut";

type LineDraft = {
  qty: string;
  notes: string;
  conditionIndicator: CountCondition;
  colour: string;
  actualSize: string;
  actualWidth: string;
  actualHeight: string;
  sourceFullLength: string;
  sourceFullWidth: string;
  sourceFullHeight: string;
};

const conditionOptions: Array<{ value: CountCondition; label: string }> = [
  { value: "new", label: "Full / new" },
  { value: "off_cut", label: "Off cut" },
  { value: "damaged", label: "Damaged" },
];

export default function StocktakeDetail() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const stocktakeId = Number(id);

  const { data, refetch, isLoading, error } = trpc.stocktake.getById.useQuery(
    { id: stocktakeId },
    { enabled: Number.isFinite(stocktakeId) && stocktakeId > 0 },
  );
  const [counts, setCounts] = useState<Record<number, LineDraft>>({});
  const [filter, setFilter] = useState<"all" | "uncounted" | "variance">("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [subGroupFilter, setSubGroupFilter] = useState("all");
  const [itemNameFilter, setItemNameFilter] = useState("all");
  const [conditionFilter, setConditionFilter] = useState<CountCondition | "all">("all");
  const [colourFilter, setColourFilter] = useState("all");

  const updateCountsMutation = trpc.stocktake.updateCounts.useMutation({
    onSuccess: (res) => {
      toast.success(`Saved ${Object.keys(counts).length} stocktake lines (${res.itemsCounted} counted)`);
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

  const addCountLineMutation = trpc.stocktake.addCountLine.useMutation({
    onSuccess: () => {
      toast.success("Additional count line added");
      refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const numberText = (value: unknown) => {
    if (value == null || value === "") return "";
    const numeric = Number(value);
    return Number.isFinite(numeric) ? String(numeric) : "";
  };

  const itemCategory = (line: any) => line.stockItem?.catalogueCategory || line.stockItem?.category || "Uncategorised";
  const itemSubGroup = (line: any) => line.stockItem?.catalogueSubGroup || "Unassigned";
  const itemName = (line: any) => line.stockItem?.name || "Unknown";
  const lineCondition = (line: any): CountCondition => line.conditionIndicator || line.stockItem?.conditionIndicator || "new";
  const lineColour = (line: any) => line.colour || line.stockItem?.catalogueColour || "";
  const lineActualSize = (line: any) => numberText(line.actualSize ?? line.stockItem?.actualSize);
  const lineActualWidth = (line: any) => numberText(line.actualWidth ?? line.stockItem?.actualWidth);
  const lineActualHeight = (line: any) => numberText(line.actualHeight ?? line.stockItem?.actualHeight);
  const lineSourceFullLength = (line: any) => numberText(line.sourceFullLength ?? line.stockItem?.sourceFullLength);
  const lineSourceFullWidth = (line: any) => numberText(line.sourceFullWidth ?? line.stockItem?.sourceFullWidth);
  const lineSourceFullHeight = (line: any) => numberText(line.sourceFullHeight ?? line.stockItem?.sourceFullHeight);
  const measurementText = (line: any) => {
    const actual = [
      lineActualSize(line) ? `L ${lineActualSize(line)}m` : "",
      lineActualWidth(line) ? `W ${lineActualWidth(line)}m` : "",
      lineActualHeight(line) ? `H ${lineActualHeight(line)}m` : "",
    ].filter(Boolean).join(" x ");
    const source = [
      lineSourceFullLength(line) ? `L ${lineSourceFullLength(line)}m` : "",
      lineSourceFullWidth(line) ? `W ${lineSourceFullWidth(line)}m` : "",
      lineSourceFullHeight(line) ? `H ${lineSourceFullHeight(line)}m` : "",
    ].filter(Boolean).join(" x ");
    if (actual && source) return `${actual} of ${source}`;
    return actual || (source ? `Source ${source}` : "");
  };
  const defaultLineDraft = (line: any): LineDraft => ({
    qty: line.countedQty !== null ? String(line.countedQty) : "",
    notes: line.notes || "",
    conditionIndicator: lineCondition(line),
    colour: lineColour(line),
    actualSize: lineActualSize(line),
    actualWidth: lineActualWidth(line),
    actualHeight: lineActualHeight(line),
    sourceFullLength: lineSourceFullLength(line),
    sourceFullWidth: lineSourceFullWidth(line),
    sourceFullHeight: lineSourceFullHeight(line),
  });
  const lineDraft = (line: any) => counts[line.id] || defaultLineDraft(line);
  const setLineDraft = (line: any, patch: Partial<LineDraft>) => {
    setCounts(prev => ({
      ...prev,
      [line.id]: {
        ...(prev[line.id] || defaultLineDraft(line)),
        ...patch,
      },
    }));
  };
  const itemDetails = (line: any) => [
    lineColour(line),
    lineCondition(line).replace(/_/g, " "),
    measurementText(line),
    line.notes,
  ].filter(Boolean).join(" · ");
  const itemSearchText = (line: any) => [
    line.stockItem?.code,
    line.stockItem?.serialNumber,
    line.stockItem?.name,
    line.stockItem?.description,
    itemCategory(line),
    itemSubGroup(line),
    lineColour(line),
    lineCondition(line),
    lineActualSize(line),
    lineActualWidth(line),
    lineActualHeight(line),
    lineSourceFullLength(line),
    lineSourceFullWidth(line),
    lineSourceFullHeight(line),
    line.notes,
  ].filter(Boolean).join(" ").toLowerCase();

  const filteredLines = useMemo(() => {
    if (!data?.lines) return [];
    const search = searchTerm.trim().toLowerCase();
    return data.lines.filter((line: any) => {
      if (filter === "uncounted" && line.countedQty !== null) return false;
      if (filter === "variance" && (line.countedQty === null || Number(line.variance) === 0)) return false;
      if (categoryFilter !== "all" && itemCategory(line) !== categoryFilter) return false;
      if (subGroupFilter !== "all" && itemSubGroup(line) !== subGroupFilter) return false;
      if (itemNameFilter !== "all" && itemName(line) !== itemNameFilter) return false;
      if (conditionFilter !== "all" && lineCondition(line) !== conditionFilter) return false;
      if (colourFilter !== "all" && lineColour(line) !== colourFilter) return false;
      if (search && !itemSearchText(line).includes(search)) return false;
      return true;
    });
  }, [data?.lines, filter, searchTerm, categoryFilter, subGroupFilter, itemNameFilter, conditionFilter, colourFilter]);

  const filterOptions = useMemo(() => {
    const lines = data?.lines || [];
    const unique = (values: string[]) => Array.from(new Set(values.filter(Boolean))).sort((a, b) => a.localeCompare(b));
    return {
      categories: unique(lines.map((line: any) => itemCategory(line))),
      subGroups: unique(lines.map((line: any) => itemSubGroup(line))),
      itemNames: unique(lines.map((line: any) => itemName(line))),
      colours: unique(lines.map((line: any) => lineColour(line))),
    };
  }, [data?.lines]);

  const clearLineFilters = () => {
    setSearchTerm("");
    setCategoryFilter("all");
    setSubGroupFilter("all");
    setItemNameFilter("all");
    setConditionFilter("all");
    setColourFilter("all");
  };

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
  if (error || !data) {
    return (
      <div className="p-6 space-y-4">
        <Button variant="ghost" size="sm" onClick={() => navigate("/inventory/stocktake")}>
          <ArrowLeft className="w-4 h-4 mr-2" /> Back to Stocktakes
        </Button>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 text-amber-600" />
              <div>
                <h1 className="text-lg font-semibold">{error ? "Could not load stocktake" : "Stocktake not found"}</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  {error?.message || "This stocktake may have been deleted or you may not have access to it."}
                </p>
                <Button className="mt-4" variant="outline" onClick={() => refetch()}>
                  Retry
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const isEditable = data.status === "in_progress";
  const isReviewable = data.status === "review";
  const isPendingApproval = data.status === "pending_approval";

  const handleSaveCounts = () => {
    const entries = Object.entries(counts);
    if (!entries.length) return;
    updateCountsMutation.mutate({
      stocktakeId,
      counts: entries.map(([lineId, v]) => ({
        lineId: Number(lineId),
        countedQty: v.qty || undefined,
        notes: v.notes,
        conditionIndicator: v.conditionIndicator,
        colour: v.colour || null,
        actualSize: v.actualSize || null,
        actualWidth: v.actualWidth || null,
        actualHeight: v.actualHeight || null,
        sourceFullLength: v.sourceFullLength || null,
        sourceFullWidth: v.sourceFullWidth || null,
        sourceFullHeight: v.sourceFullHeight || null,
      })),
    });
  };

  const handleAddCountLine = (line: any, conditionIndicator?: CountCondition) => {
    const draft = lineDraft(line);
    const isOffcut = conditionIndicator === "off_cut";
    addCountLineMutation.mutate({
      stocktakeId,
      sourceLineId: line.id,
      conditionIndicator: conditionIndicator || draft.conditionIndicator,
      colour: draft.colour || undefined,
      actualSize: draft.actualSize || undefined,
      actualWidth: draft.actualWidth || undefined,
      actualHeight: draft.actualHeight || undefined,
      sourceFullLength: draft.sourceFullLength || undefined,
      sourceFullWidth: draft.sourceFullWidth || undefined,
      sourceFullHeight: draft.sourceFullHeight || undefined,
      notes: isOffcut ? "Off cut count line" : "Additional count line",
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

      {/* Line Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(220px,1.4fr)_minmax(160px,0.9fr)_minmax(160px,0.9fr)_minmax(200px,1.1fr)_minmax(150px,0.8fr)_minmax(160px,0.8fr)_auto]">
            <Input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search code, item, colour, notes..."
              className="min-w-0"
            />
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger>
                <SelectValue placeholder="All Categories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {filterOptions.categories.map((category) => (
                  <SelectItem key={category} value={category}>{category}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={subGroupFilter} onValueChange={setSubGroupFilter}>
              <SelectTrigger>
                <SelectValue placeholder="All Sub-Groups" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Sub-Groups</SelectItem>
                {filterOptions.subGroups.map((subGroup) => (
                  <SelectItem key={subGroup} value={subGroup}>{subGroup}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={itemNameFilter} onValueChange={setItemNameFilter}>
              <SelectTrigger>
                <SelectValue placeholder="All Item Names" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Item Names</SelectItem>
                {filterOptions.itemNames.map((name) => (
                  <SelectItem key={name} value={name}>{name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={conditionFilter} onValueChange={(value) => setConditionFilter(value as CountCondition | "all")}>
              <SelectTrigger>
                <SelectValue placeholder="All Count Types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Count Types</SelectItem>
                {conditionOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={colourFilter} onValueChange={setColourFilter}>
              <SelectTrigger>
                <SelectValue placeholder="All Colours" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Colours</SelectItem>
                {filterOptions.colours.map((colour) => (
                  <SelectItem key={colour} value={colour}>{colour}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button type="button" variant="outline" onClick={clearLineFilters}>
              Clear
            </Button>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Use Add Line to split one product into separate count rows for full lengths, offcuts, colours, or locations.
          </p>
        </CardContent>
      </Card>

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
                  <th className="px-4 py-3 text-left font-medium">Sub-Group</th>
                  <th className="px-4 py-3 text-left font-medium">Count Type</th>
                  <th className="px-4 py-3 text-left font-medium">Colour</th>
                  <th className="px-4 py-3 text-left font-medium">Measurements</th>
                  <th className="px-4 py-3 text-right font-medium">System Qty</th>
                  <th className="px-4 py-3 text-right font-medium">Counted Qty</th>
                  <th className="px-4 py-3 text-right font-medium">Variance</th>
                  <th className="px-4 py-3 text-right font-medium">Value</th>
                  <th className="px-4 py-3 text-left font-medium">Notes</th>
                  {isEditable && <th className="px-4 py-3 text-right font-medium">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {filteredLines.map((line: any) => {
                  const draft = lineDraft(line);
                  const displayedQty = draft.qty;
                  const variance = line.countedQty !== null ? Number(line.variance) : null;
                  return (
                    <tr key={line.id} className="border-t hover:bg-muted/30">
                      <td className="px-4 py-2 font-mono text-xs">{line.stockItem?.code || "-"}</td>
                      <td className="px-4 py-2">
                        <div className="font-medium">{itemName(line)}</div>
                        {itemDetails(line) && (
                          <div className="mt-1 text-xs text-muted-foreground">{itemDetails(line)}</div>
                        )}
                      </td>
                      <td className="px-4 py-2 text-muted-foreground">{itemCategory(line)}</td>
                      <td className="px-4 py-2 text-muted-foreground">{itemSubGroup(line)}</td>
                      <td className="px-4 py-2 min-w-[150px]">
                        {isEditable ? (
                          <Select
                            value={draft.conditionIndicator}
                            onValueChange={(value) => setLineDraft(line, { conditionIndicator: value as CountCondition })}
                          >
                            <SelectTrigger className="h-8">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {conditionOptions.map((option) => (
                                <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <Badge variant="outline">
                            {conditionOptions.find(option => option.value === lineCondition(line))?.label || "Full / new"}
                          </Badge>
                        )}
                      </td>
                      <td className="px-4 py-2 min-w-[150px]">
                        {isEditable ? (
                          <Input
                            className="h-8"
                            placeholder="e.g. Monument"
                            value={draft.colour}
                            onChange={(event) => setLineDraft(line, { colour: event.target.value })}
                          />
                        ) : (
                          <span>{lineColour(line) || "-"}</span>
                        )}
                      </td>
                      <td className="px-4 py-2 min-w-[360px]">
                        {isEditable ? (
                          <div className="space-y-1">
                            <div className="grid grid-cols-3 gap-1">
                              <Input type="number" step="0.01" className="h-8" placeholder="Actual L" value={draft.actualSize} onChange={(event) => setLineDraft(line, { actualSize: event.target.value })} />
                              <Input type="number" step="0.01" className="h-8" placeholder="Actual W" value={draft.actualWidth} onChange={(event) => setLineDraft(line, { actualWidth: event.target.value })} />
                              <Input type="number" step="0.01" className="h-8" placeholder="Actual H" value={draft.actualHeight} onChange={(event) => setLineDraft(line, { actualHeight: event.target.value })} />
                            </div>
                            <div className="grid grid-cols-3 gap-1">
                              <Input type="number" step="0.01" className="h-8" placeholder="Source L" value={draft.sourceFullLength} onChange={(event) => setLineDraft(line, { sourceFullLength: event.target.value })} />
                              <Input type="number" step="0.01" className="h-8" placeholder="Source W" value={draft.sourceFullWidth} onChange={(event) => setLineDraft(line, { sourceFullWidth: event.target.value })} />
                              <Input type="number" step="0.01" className="h-8" placeholder="Source H" value={draft.sourceFullHeight} onChange={(event) => setLineDraft(line, { sourceFullHeight: event.target.value })} />
                            </div>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">{measurementText(line) || "-"}</span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-right font-medium">{Number(line.systemQty).toFixed(1)}</td>
                      <td className="px-4 py-2 text-right">
                        {isEditable ? (
                          <Input type="number" step="0.1" className="w-24 ml-auto text-right h-8"
                            value={displayedQty}
                            onChange={(e) => setLineDraft(line, { qty: e.target.value })} />
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
                            value={draft.notes}
                            onChange={(e) => setLineDraft(line, { notes: e.target.value })} />
                        ) : (
                          <span className="text-xs text-muted-foreground">{line.notes || ""}</span>
                        )}
                      </td>
                      {isEditable && (
                        <td className="px-4 py-2">
                          <div className="flex flex-wrap justify-end gap-1">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => handleAddCountLine(line)}
                              disabled={addCountLineMutation.isPending}
                              title="Add another count line for this stock item"
                            >
                              <Plus className="w-4 h-4 mr-1" /> Add Line
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => handleAddCountLine(line, "off_cut")}
                              disabled={addCountLineMutation.isPending}
                              title="Add an offcut line for this stock item"
                            >
                              Offcut
                            </Button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
                {filteredLines.length === 0 && (
                  <tr>
                    <td
                      colSpan={isEditable ? 13 : 12}
                      className="px-4 py-10 text-center text-muted-foreground"
                    >
                      No stocktake lines match the current filters.
                    </td>
                  </tr>
                )}
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
