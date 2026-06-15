import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent } from "@/components/ui/card";
import { Search, Users, UserCheck, UserX, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

interface BulkAssignAdvisorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function BulkAssignAdvisorDialog({ open, onOpenChange }: BulkAssignAdvisorDialogProps) {
  const [step, setStep] = useState<"summary" | "select" | "done">("summary");
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [advisorName, setAdvisorName] = useState("");
  const [assignedCount, setAssignedCount] = useState(0);
  const [page, setPage] = useState(0);
  const pageSize = 50;

  const { data: summary } = trpc.crm.leads.advisorAssignmentSummary.useQuery(undefined, { enabled: open });
  const { data: advisors } = trpc.designAdvisors.list.useQuery(undefined, { enabled: open });

  // Fetch unassigned leads for selection
  const { data: leadsData, isLoading: leadsLoading } = trpc.crm.leads.list.useQuery(
    { search: search || undefined, designAdvisor: "__unassigned__", limit: pageSize, offset: page * pageSize },
    { enabled: open && step === "select" }
  );

  const utils = trpc.useUtils();

  const bulkAssignMut = trpc.crm.leads.bulkAssignAdvisor.useMutation({
    onSuccess: (result) => {
      setAssignedCount(result.updatedCount);
      setStep("done");
      utils.crm.leads.list.invalidate();
      utils.crm.leads.advisorAssignmentSummary.invalidate();
      toast.success(`Assigned ${result.updatedCount} leads to ${advisorName}`);
    },
    onError: (err) => {
      toast.error(`Failed to assign: ${err.message}`);
    },
  });

  const handleAssign = () => {
    if (selectedIds.size === 0) {
      toast.error("Please select at least one lead");
      return;
    }
    if (!advisorName) {
      toast.error("Please select a design advisor");
      return;
    }
    bulkAssignMut.mutate({ leadIds: Array.from(selectedIds), advisorName });
  };

  const toggleAll = () => {
    if (!leadsData?.leads) return;
    const allOnPage = leadsData.leads.map((l: any) => l.id);
    const allSelected = allOnPage.every((id: number) => selectedIds.has(id));
    const next = new Set(selectedIds);
    if (allSelected) {
      allOnPage.forEach((id: number) => next.delete(id));
    } else {
      allOnPage.forEach((id: number) => next.add(id));
    }
    setSelectedIds(next);
  };

  const toggleOne = (id: number) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const reset = () => {
    setStep("summary");
    setSearch("");
    setSelectedIds(new Set());
    setAdvisorName("");
    setAssignedCount(0);
    setPage(0);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Bulk Assign Design Advisor</DialogTitle>
          <DialogDescription>
            Assign a design advisor to multiple leads at once to ensure complete performance data.
          </DialogDescription>
        </DialogHeader>

        {step === "summary" && summary && (
          <div className="space-y-4">
            {/* KPI Cards */}
            <div className="grid grid-cols-3 gap-3">
              <Card>
                <CardContent className="p-4 text-center">
                  <Users className="h-6 w-6 mx-auto mb-1 text-muted-foreground" />
                  <p className="text-2xl font-bold">{summary.total.toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground">Total Leads</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 text-center">
                  <UserCheck className="h-6 w-6 mx-auto mb-1 text-green-600" />
                  <p className="text-2xl font-bold text-green-600">{summary.assigned.toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground">Assigned</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 text-center">
                  <UserX className="h-6 w-6 mx-auto mb-1 text-amber-600" />
                  <p className="text-2xl font-bold text-amber-600">{summary.unassigned.toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground">Unassigned</p>
                </CardContent>
              </Card>
            </div>

            {/* Current distribution */}
            {summary.byAdvisor.length > 0 && (
              <div>
                <h4 className="text-sm font-medium mb-2">Current Distribution</h4>
                <div className="grid grid-cols-2 gap-2 max-h-[200px] overflow-y-auto">
                  {summary.byAdvisor.map((a) => (
                    <div key={a.name} className="flex items-center justify-between bg-muted/50 rounded px-3 py-1.5">
                      <span className="text-sm truncate">{a.name}</span>
                      <Badge variant="secondary" className="ml-2">{a.count}</Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button onClick={() => setStep("select")} disabled={summary.unassigned === 0}>
                {summary.unassigned === 0 ? "All Leads Assigned" : `Assign ${summary.unassigned.toLocaleString()} Unassigned Leads`}
              </Button>
            </DialogFooter>
          </div>
        )}

        {step === "select" && (
          <div className="space-y-4">
            {/* Advisor selection */}
            <div className="flex gap-3 items-end">
              <div className="flex-1">
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Assign to Design Advisor</label>
                <Select value={advisorName} onValueChange={setAdvisorName}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select advisor..." />
                  </SelectTrigger>
                  <SelectContent>
                    {advisors?.map((a: any) => (
                      <SelectItem key={a.id} value={a.name}>{a.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex-1">
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Search Leads</label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search by name..."
                    value={search}
                    onChange={(e) => { setSearch(e.target.value); setPage(0); }}
                    className="pl-9"
                  />
                </div>
              </div>
            </div>

            {/* Selection info */}
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                {selectedIds.size > 0 ? (
                  <span className="text-foreground font-medium">{selectedIds.size} lead{selectedIds.size !== 1 ? "s" : ""} selected</span>
                ) : (
                  "Select leads to assign"
                )}
              </p>
              {leadsData?.leads && leadsData.leads.length > 0 && (
                <Button variant="ghost" size="sm" onClick={toggleAll}>
                  {leadsData.leads.every((l: any) => selectedIds.has(l.id)) ? "Deselect Page" : "Select Page"}
                </Button>
              )}
            </div>

            {/* Leads list */}
            <div className="border rounded-lg max-h-[300px] overflow-y-auto">
              {leadsLoading ? (
                <div className="p-4 text-center text-muted-foreground">Loading leads...</div>
              ) : !leadsData?.leads || leadsData.leads.length === 0 ? (
                <div className="p-4 text-center text-muted-foreground">No unassigned leads found.</div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-background border-b">
                    <tr>
                      <th className="w-10 py-2 px-2">
                        <Checkbox
                          checked={leadsData.leads.length > 0 && leadsData.leads.every((l: any) => selectedIds.has(l.id))}
                          onCheckedChange={toggleAll}
                        />
                      </th>
                      <th className="text-left py-2 px-2 font-medium">Lead #</th>
                      <th className="text-left py-2 px-2 font-medium">Contact</th>
                      <th className="text-left py-2 px-2 font-medium">Product</th>
                      <th className="text-left py-2 px-2 font-medium">Status</th>
                      <th className="text-left py-2 px-2 font-medium">Lead Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {leadsData.leads.map((lead: any) => (
                      <tr
                        key={lead.id}
                        className={`border-b hover:bg-muted/50 cursor-pointer ${selectedIds.has(lead.id) ? "bg-primary/5" : ""}`}
                        onClick={() => toggleOne(lead.id)}
                      >
                        <td className="py-2 px-2">
                          <Checkbox checked={selectedIds.has(lead.id)} onCheckedChange={() => toggleOne(lead.id)} />
                        </td>
                        <td className="py-2 px-2 font-mono text-xs">{lead.leadNumber}</td>
                        <td className="py-2 px-2">
                          {lead.contactFirstName} {lead.contactLastName}
                        </td>
                        <td className="py-2 px-2 text-muted-foreground">{lead.productType || "—"}</td>
                        <td className="py-2 px-2">
                          <Badge variant="secondary" className="text-xs">{lead.status}</Badge>
                        </td>
                        <td className="py-2 px-2 text-xs text-muted-foreground">
                          {lead.leadDate ? new Date(lead.leadDate).toLocaleDateString("en-AU") : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Pagination */}
            {leadsData && leadsData.total > pageSize && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">
                  Page {page + 1} of {Math.ceil(leadsData.total / pageSize)} ({leadsData.total} leads)
                </span>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>Prev</Button>
                  <Button variant="outline" size="sm" disabled={(page + 1) * pageSize >= leadsData.total} onClick={() => setPage(p => p + 1)}>Next</Button>
                </div>
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => setStep("summary")}>Back</Button>
              <Button onClick={handleAssign} disabled={selectedIds.size === 0 || !advisorName || bulkAssignMut.isPending}>
                {bulkAssignMut.isPending ? "Assigning..." : `Assign ${selectedIds.size} Lead${selectedIds.size !== 1 ? "s" : ""}`}
              </Button>
            </DialogFooter>
          </div>
        )}

        {step === "done" && (
          <div className="text-center py-6 space-y-3">
            <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto" />
            <p className="text-lg font-medium">Assignment Complete</p>
            <p className="text-muted-foreground">
              Successfully assigned <strong>{assignedCount}</strong> leads to <strong>{advisorName}</strong>.
            </p>
            <p className="text-xs text-muted-foreground">
              Linked quotes without an advisor have also been updated.
            </p>
            <DialogFooter className="justify-center">
              <Button variant="outline" onClick={() => { reset(); setStep("select"); }}>Assign More</Button>
              <Button onClick={() => onOpenChange(false)}>Done</Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
