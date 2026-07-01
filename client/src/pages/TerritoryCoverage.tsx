import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { MapPin, AlertTriangle, CheckCircle2, BarChart3, Plus, Download } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { logClientDownload } from "@/lib/userActivity";

export default function TerritoryCoverage() {
  const { data: report, isLoading, refetch } = trpc.territory.coverageReport.useQuery();
  const { data: branchesList } = trpc.branches.list.useQuery();
  const { data: territories } = trpc.territory.list.useQuery();


  // Quick Assign state
  const [quickAssignOpen, setQuickAssignOpen] = useState(false);
  const [selectedPostcode, setSelectedPostcode] = useState("");
  const [assignTerritory, setAssignTerritory] = useState("");
  const [newTerritoryName, setNewTerritoryName] = useState("");
  const [assignBranchId, setAssignBranchId] = useState<number | null>(null);

  const addPostcodesMut = trpc.territory.addPostcodes.useMutation({
    onSuccess: () => {
      toast.success(`${selectedPostcode} has been added to the territory.`);
      setQuickAssignOpen(false);
      setSelectedPostcode("");
      setAssignTerritory("");
      setNewTerritoryName("");
      setAssignBranchId(null);
      refetch();
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  const getBranchName = (branchId: number) => {
    return branchesList?.find(b => b.id === branchId)?.name || `Branch #${branchId}`;
  };

  const handleQuickAssign = (postcode: string) => {
    setSelectedPostcode(postcode);
    setQuickAssignOpen(true);
  };

  const handleConfirmAssign = () => {
    const territoryName = assignTerritory === "__new__" ? newTerritoryName.trim() : assignTerritory;
    if (!territoryName) {
      toast.error("Please select or enter a territory name.");
      return;
    }

    // If existing territory, use its branchId; if new, require branchId selection
    let branchId = assignBranchId;
    if (assignTerritory !== "__new__" && territories) {
      const existing = territories.find(t => t.territory === assignTerritory);
      if (existing) branchId = existing.branchId;
    }

    if (!branchId) {
      toast.error("Please select a branch.");
      return;
    }

    addPostcodesMut.mutate({
      territory: territoryName,
      branchId,
      postcodes: [selectedPostcode],
    });
  };

  const handleCsvExport = () => {
    if (!report) return;

    const lines: string[] = [];
    lines.push("Section,Postcode,Territory,Branch,Lead Count");

    // Unmapped postcodes
    for (const item of report.unmapped) {
      lines.push(`Unmapped,${item.postcode},,,${item.leadCount}`);
    }

    // Mapped postcodes
    for (const territory of report.mapped) {
      for (const pc of territory.postcodes) {
        lines.push(`Mapped,${pc},${territory.territory},${getBranchName(territory.branchId)},`);
      }
    }

    const csv = lines.join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const filename = `territory-coverage-${new Date().toISOString().slice(0, 10)}.csv`;
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    logClientDownload({
      filename,
      source: "territory_coverage_export",
      entityType: "territory",
      mimeType: "text/csv",
      metadata: { lineCount: lines.length },
    });
    toast.success("Territory coverage report downloaded.");
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Territory Coverage Report</h1>
          <p className="text-muted-foreground text-sm">Loading...</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-24" />)}
        </div>
      </div>
    );
  }

  if (!report) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Territory Coverage Report</h1>
          <p className="text-muted-foreground text-sm">
            Identify gaps in auto-allocation coverage by viewing unmapped postcodes from CRM leads.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={handleCsvExport}>
          <Download className="h-4 w-4 mr-2" />
          Export CSV
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-emerald-100 dark:bg-emerald-900/30">
                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{report.stats.totalMapped}</p>
                <p className="text-xs text-muted-foreground">Mapped Postcodes</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-amber-100 dark:bg-amber-900/30">
                <AlertTriangle className="h-5 w-5 text-amber-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{report.stats.totalUnmapped}</p>
                <p className="text-xs text-muted-foreground">Unmapped Postcodes (from leads)</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30">
                <BarChart3 className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{report.stats.totalTerritories}</p>
                <p className="text-xs text-muted-foreground">Active Territories</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Unmapped Postcodes */}
      {report.unmapped.length > 0 && (
        <Card className="border-amber-200 dark:border-amber-800">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
              <AlertTriangle className="h-5 w-5" />
              Unmapped Postcodes ({report.unmapped.length})
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              These postcodes appear in CRM leads but are not assigned to any territory. 
              Leads from these postcodes will not be auto-allocated to a branch.
              Click the + button to quickly assign a postcode to a territory.
            </p>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
              {report.unmapped.map(item => (
                <div
                  key={item.postcode}
                  className="flex items-center justify-between px-3 py-2 rounded-md bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-medium">{item.postcode}</span>
                    <Badge variant="secondary" className="text-xs">
                      {item.leadCount}
                    </Badge>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-amber-700 hover:text-amber-900 hover:bg-amber-100"
                    onClick={() => handleQuickAssign(item.postcode)}
                    title="Assign to territory"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {report.unmapped.length === 0 && (
        <Card className="border-emerald-200 dark:border-emerald-800">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3 text-emerald-700 dark:text-emerald-400">
              <CheckCircle2 className="h-5 w-5" />
              <p className="font-medium">Full Coverage — all lead postcodes are mapped to a territory.</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Mapped Territories */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5" />
            Mapped Territories ({report.mapped.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {report.mapped.map(territory => (
              <div key={territory.territory} className="border rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-medium">{territory.territory}</h3>
                  <Badge variant="outline">{getBranchName(territory.branchId)}</Badge>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {territory.postcodes.map(pc => (
                    <span
                      key={pc}
                      className="px-2 py-0.5 text-xs font-mono bg-muted rounded"
                    >
                      {pc}
                    </span>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  {territory.postcodes.length} postcode{territory.postcodes.length === 1 ? "" : "s"}
                </p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Quick Assign Dialog */}
      <Dialog open={quickAssignOpen} onOpenChange={setQuickAssignOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign Postcode {selectedPostcode} to Territory</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Territory</Label>
              <Select value={assignTerritory} onValueChange={setAssignTerritory}>
                <SelectTrigger>
                  <SelectValue placeholder="Select existing territory or create new" />
                </SelectTrigger>
                <SelectContent>
                  {territories?.map(t => (
                    <SelectItem key={t.territory} value={t.territory}>
                      {t.territory} ({getBranchName(t.branchId)})
                    </SelectItem>
                  ))}
                  <SelectItem value="__new__">+ Create New Territory</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {assignTerritory === "__new__" && (
              <>
                <div className="space-y-2">
                  <Label>New Territory Name</Label>
                  <Input
                    value={newTerritoryName}
                    onChange={e => setNewTerritoryName(e.target.value)}
                    placeholder="e.g. Western Sydney"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Assign to Branch</Label>
                  <Select
                    value={assignBranchId?.toString() || ""}
                    onValueChange={v => setAssignBranchId(Number(v))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select branch" />
                    </SelectTrigger>
                    <SelectContent>
                      {branchesList?.filter(b => b.isActive).map(b => (
                        <SelectItem key={b.id} value={b.id.toString()}>
                          {b.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setQuickAssignOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleConfirmAssign} disabled={addPostcodesMut.isPending}>
              {addPostcodesMut.isPending ? "Assigning..." : "Assign Postcode"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
