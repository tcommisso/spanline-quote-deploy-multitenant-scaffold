import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { useState, useMemo } from "react";
import { Plus, Edit2, DollarSign, Users } from "lucide-react";

function fmt(val: string | number | null | undefined): string {
  const n = parseFloat(String(val || "0"));
  return n.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function AdminDaCommissions() {
  const utils = trpc.useUtils();
  const { data: commissions, isLoading } = trpc.daPortal.listCommissions.useQuery();
  const { data: daUsers } = trpc.people.search.useQuery({ query: "", type: "staff" });
  const createMut = trpc.daPortal.createCommission.useMutation({
    onSuccess: () => { toast.success("Commission record created"); utils.daPortal.listCommissions.invalidate(); setShowCreate(false); },
    onError: (e) => toast.error(e.message),
  });
  const updateMut = trpc.daPortal.updateCommission.useMutation({
    onSuccess: () => { toast.success("Commission updated"); utils.daPortal.listCommissions.invalidate(); setShowEdit(false); },
    onError: (e) => toast.error(e.message),
  });
  const addAdjMut = trpc.daPortal.addAdjustment.useMutation({
    onSuccess: () => { toast.success("Adjustment recorded"); utils.daPortal.listCommissions.invalidate(); setShowAdjust(false); },
    onError: (e) => toast.error(e.message),
  });

  const [showCreate, setShowCreate] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [showAdjust, setShowAdjust] = useState(false);
  const [selected, setSelected] = useState<any>(null);
  const [filterDa, setFilterDa] = useState("all");

  // Create form
  const [createForm, setCreateForm] = useState({
    daUserId: "",
    clientName: "",
    jobNo: "",
    contractNo: "",
    totalCommission: "",
  });

  // Adjust form
  const [adjustForm, setAdjustForm] = useState({
    amount: "",
    notes: "",
    type: "deduction" as "addition" | "deduction",
  });

  const filteredCommissions = useMemo(() => {
    if (!commissions) return [];
    if (filterDa === "all") return commissions;
    return commissions.filter(c => String(c.daUserId) === filterDa);
  }, [commissions, filterDa]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">DA Commission Management</h1>
        <Card className="animate-pulse"><CardContent className="p-6"><div className="h-64 bg-muted rounded" /></CardContent></Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">DA Commission Management</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage commission records, adjustments, and payments for Design Advisers</p>
        </div>
        <Button onClick={() => setShowCreate(true)}>
          <Plus className="h-4 w-4 mr-2" />
          New Commission
        </Button>
      </div>

      {/* Filter */}
      <div className="flex gap-4 items-center">
        <Label className="text-sm">Filter by DA:</Label>
        <Select value={filterDa} onValueChange={setFilterDa}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="All DAs" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All DAs</SelectItem>
            {(daUsers as any[])?.filter((u: any) => u.personType === "staff").map((u: any) => (
              <SelectItem key={u.id} value={String(u.id)}>{u.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Commissions Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <DollarSign className="h-4 w-4" />
            Commission Records ({filteredCommissions.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>DA</TableHead>
                  <TableHead>Client Name</TableHead>
                  <TableHead>Job No</TableHead>
                  <TableHead>Contract No</TableHead>
                  <TableHead className="text-right">Total Commission</TableHead>
                  <TableHead className="text-right">Amount Paid</TableHead>
                  <TableHead className="text-right">Adjustments</TableHead>
                  <TableHead className="text-right">Balance Due</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredCommissions.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center py-8 text-muted-foreground">
                      No commission records found
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredCommissions.map((c) => {
                    const totalComm = parseFloat(String(c.totalCommission || "0"));
                    const amtPaid = parseFloat(String(c.amountPaid || "0"));
                    const adj = parseFloat(String(c.adjustmentsTotal || "0"));
                    const balance = totalComm - amtPaid + adj;
                    return (
                      <TableRow key={c.id}>
                        <TableCell className="text-sm">{c.daName}</TableCell>
                        <TableCell>{c.clientName}</TableCell>
                        <TableCell className="font-mono text-sm">{c.jobNo || "—"}</TableCell>
                        <TableCell className="font-mono text-sm">{c.contractNo || "—"}</TableCell>
                        <TableCell className="text-right font-semibold">${fmt(totalComm)}</TableCell>
                        <TableCell className="text-right">${fmt(amtPaid)}</TableCell>
                        <TableCell className="text-right">
                          {adj !== 0 ? (
                            <span className={adj > 0 ? "text-green-600" : "text-red-600"}>
                              {adj > 0 ? "+" : ""}${fmt(adj)}
                            </span>
                          ) : "—"}
                        </TableCell>
                        <TableCell className="text-right font-bold">
                          <span className={balance > 0 ? "text-orange-600" : "text-green-600"}>
                            ${fmt(balance)}
                          </span>
                        </TableCell>
                        <TableCell>
                          <Badge variant={c.status === "fully_paid" ? "default" : c.status === "partial_paid" ? "secondary" : "outline"}>
                            {c.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex gap-1 justify-end">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => { setSelected(c); setShowEdit(true); }}
                            >
                              <Edit2 className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                setSelected(c);
                                setAdjustForm({ amount: "", notes: "", type: "deduction" });
                                setShowAdjust(true);
                              }}
                            >
                              <Plus className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Create Commission Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Commission Record</DialogTitle>
            <DialogDescription>Add a new commission entry for a Design Adviser</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Design Adviser</Label>
              <Select value={createForm.daUserId} onValueChange={v => setCreateForm(f => ({ ...f, daUserId: v }))}>
                <SelectTrigger><SelectValue placeholder="Select DA" /></SelectTrigger>
                <SelectContent>
                  {(daUsers as any[])?.filter((u: any) => u.personType === "staff").map((u: any) => (
                    <SelectItem key={u.id} value={String(u.id)}>{u.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Client Name</Label>
                <Input value={createForm.clientName} onChange={e => setCreateForm(f => ({ ...f, clientName: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Total Commission (ex GST)</Label>
                <Input type="number" step="0.01" value={createForm.totalCommission} onChange={e => setCreateForm(f => ({ ...f, totalCommission: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Job Number</Label>
                <Input value={createForm.jobNo} onChange={e => setCreateForm(f => ({ ...f, jobNo: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Contract Number</Label>
                <Input value={createForm.contractNo} onChange={e => setCreateForm(f => ({ ...f, contractNo: e.target.value }))} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button
              onClick={() => {
                const selectedUser = (daUsers as any[])?.find((u: any) => String(u.id) === createForm.daUserId);
                createMut.mutate({
                  daUserId: parseInt(createForm.daUserId),
                  daName: selectedUser?.name || "Unknown",
                  clientName: createForm.clientName,
                  jobNo: createForm.jobNo || undefined,
                  contractNo: createForm.contractNo || undefined,
                  totalCommission: createForm.totalCommission,
                });
              }}
              disabled={createMut.isPending || !createForm.daUserId || !createForm.clientName || !createForm.totalCommission}
            >
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Commission Dialog */}
      <Dialog open={showEdit} onOpenChange={setShowEdit}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Commission</DialogTitle>
            <DialogDescription>Update the total commission amount for {selected?.clientName}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Total Commission (ex GST)</Label>
              <Input
                type="number"
                step="0.01"
                defaultValue={selected?.totalCommission}
                onChange={e => setSelected((s: any) => s ? { ...s, totalCommission: e.target.value } : s)}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Job Number</Label>
                <Input
                  defaultValue={selected?.jobNo || ""}
                  onChange={e => setSelected((s: any) => s ? { ...s, jobNo: e.target.value } : s)}
                />
              </div>
              <div className="space-y-2">
                <Label>Contract Number</Label>
                <Input
                  defaultValue={selected?.contractNo || ""}
                  onChange={e => setSelected((s: any) => s ? { ...s, contractNo: e.target.value } : s)}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEdit(false)}>Cancel</Button>
            <Button
              onClick={() => {
                if (selected) {
                  updateMut.mutate({
                    id: selected.id,
                    totalCommission: String(selected.totalCommission),
                    jobNo: selected.jobNo || undefined,
                    contractNo: selected.contractNo || undefined,
                  });
                }
              }}
              disabled={updateMut.isPending}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Adjustment Dialog */}
      <Dialog open={showAdjust} onOpenChange={setShowAdjust}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Adjustment</DialogTitle>
            <DialogDescription>
              Record an adjustment for {selected?.clientName} (Job: {selected?.jobNo || "N/A"})
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Type</Label>
              <Select value={adjustForm.type} onValueChange={v => setAdjustForm(f => ({ ...f, type: v as "addition" | "deduction" }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="addition">Addition (+)</SelectItem>
                  <SelectItem value="deduction">Deduction (−)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Amount (ex GST)</Label>
              <Input type="number" step="0.01" value={adjustForm.amount} onChange={e => setAdjustForm(f => ({ ...f, amount: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Notes / Reason</Label>
              <Textarea value={adjustForm.notes} onChange={e => setAdjustForm(f => ({ ...f, notes: e.target.value }))} placeholder="Reason for adjustment..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdjust(false)}>Cancel</Button>
            <Button
              onClick={() => {
                if (selected) {
                  const amount = adjustForm.type === "deduction"
                    ? `-${adjustForm.amount}`
                    : adjustForm.amount;
                  addAdjMut.mutate({
                    commissionId: selected.id,
                    amount,
                    reason: adjustForm.notes,
                  });
                }
              }}
              disabled={addAdjMut.isPending || !adjustForm.amount}
            >
              Record Adjustment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
