import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { FileUp, Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

function fmt(val: string | number | null | undefined): string {
  const n = parseFloat(String(val || "0"));
  return n.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function statusBadge(status: string) {
  const map: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
    submitted: { label: "Submitted", variant: "outline" },
    approved: { label: "Approved", variant: "secondary" },
    rejected: { label: "Rejected", variant: "destructive" },
    paid: { label: "Paid", variant: "default" },
  };
  const s = map[status] || { label: status, variant: "outline" as const };
  return <Badge variant={s.variant}>{s.label}</Badge>;
}

export default function DaInvoices() {
  const utils = trpc.useUtils();
  const { data: invoices, isLoading } = trpc.daPortal.listInvoices.useQuery();
  const { data: commissions } = trpc.daPortal.listCommissions.useQuery();
  const submitMut = trpc.daPortal.submitInvoice.useMutation({
    onSuccess: (data) => {
      toast.success(`Invoice ${data.invoiceNumber} submitted for approval`);
      utils.daPortal.listInvoices.invalidate();
      utils.daPortal.listCommissions.invalidate();
      setShowNewInvoice(false);
      setNewInvoice({ commissionId: 0, amountExGst: "", description: "" });
    },
    onError: (e) => toast.error(e.message),
  });

  const [showNewInvoice, setShowNewInvoice] = useState(false);
  const [newInvoice, setNewInvoice] = useState({ commissionId: 0, amountExGst: "", description: "" });

  // Filter commissions with balance due > 0
  const claimableCommissions = commissions?.filter(c => parseFloat(String(c.balanceDue || "0")) > 0.01) || [];

  function handleSubmit() {
    if (!newInvoice.commissionId) {
      toast.error("Please select a commission to claim against");
      return;
    }
    if (!newInvoice.amountExGst || parseFloat(newInvoice.amountExGst) <= 0) {
      toast.error("Please enter a valid amount");
      return;
    }
    submitMut.mutate({
      commissionId: newInvoice.commissionId,
      amountExGst: newInvoice.amountExGst,
      description: newInvoice.description || undefined,
    });
  }

  const selectedCommission = claimableCommissions.find(c => c.id === newInvoice.commissionId);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Invoices</h1>
        <Card className="animate-pulse"><CardContent className="p-6"><div className="h-64 bg-muted rounded" /></CardContent></Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold">Invoices</h1>
        <Button onClick={() => setShowNewInvoice(true)} disabled={claimableCommissions.length === 0}>
          <Plus className="h-4 w-4 mr-2" />
          Submit Invoice
        </Button>
      </div>

      {claimableCommissions.length === 0 && (
        <Card>
          <CardContent className="p-6 text-center text-muted-foreground">
            No commissions with balance due available to claim against.
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice #</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-right">Amount (ex GST)</TableHead>
                  <TableHead className="text-right">GST</TableHead>
                  <TableHead className="text-right">Total (inc GST)</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Submitted</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(!invoices || invoices.length === 0) ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      <FileUp className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      No invoices submitted yet
                    </TableCell>
                  </TableRow>
                ) : (
                  invoices.map((inv) => (
                    <TableRow key={inv.id}>
                      <TableCell className="font-mono text-sm">{inv.invoiceNumber}</TableCell>
                      <TableCell className="max-w-[200px] truncate">{inv.description || "—"}</TableCell>
                      <TableCell className="text-right">${fmt(inv.amountExGst)}</TableCell>
                      <TableCell className="text-right">${fmt(inv.gstAmount)}</TableCell>
                      <TableCell className="text-right font-semibold">${fmt(inv.totalIncGst)}</TableCell>
                      <TableCell>{statusBadge(inv.status)}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {inv.submittedAt ? new Date(inv.submittedAt).toLocaleDateString("en-AU") : "—"}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Submit Invoice Dialog */}
      <Dialog open={showNewInvoice} onOpenChange={setShowNewInvoice}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Submit Invoice</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Commission Job</Label>
              <Select
                value={newInvoice.commissionId ? String(newInvoice.commissionId) : ""}
                onValueChange={(v) => setNewInvoice(f => ({ ...f, commissionId: parseInt(v) }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a commission..." />
                </SelectTrigger>
                <SelectContent>
                  {claimableCommissions.map(c => (
                    <SelectItem key={c.id} value={String(c.id)}>
                      {c.clientName} {c.jobNo ? `(${c.jobNo})` : ""} — Balance: ${fmt(c.balanceDue)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedCommission && (
              <Card className="bg-muted/50">
                <CardContent className="p-3 text-sm space-y-1">
                  <div className="flex justify-between">
                    <span>Total Commission:</span>
                    <span className="font-medium">${fmt(selectedCommission.totalCommission)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Amount Paid:</span>
                    <span>${fmt(selectedCommission.amountPaid)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Adjustments:</span>
                    <span>${fmt(selectedCommission.adjustmentsTotal)}</span>
                  </div>
                  <div className="flex justify-between font-semibold border-t pt-1">
                    <span>Balance Due:</span>
                    <span>${fmt(selectedCommission.balanceDue)}</span>
                  </div>
                </CardContent>
              </Card>
            )}

            <div className="space-y-2">
              <Label htmlFor="amount">Amount (ex GST)</Label>
              <Input
                id="amount"
                type="number"
                step="0.01"
                min="0"
                value={newInvoice.amountExGst}
                onChange={e => setNewInvoice(f => ({ ...f, amountExGst: e.target.value }))}
                placeholder="0.00"
              />
              {newInvoice.amountExGst && (
                <p className="text-xs text-muted-foreground">
                  GST: ${fmt(parseFloat(newInvoice.amountExGst) * 0.1)} | 
                  Total inc GST: ${fmt(parseFloat(newInvoice.amountExGst) * 1.1)}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description (optional)</Label>
              <Input
                id="description"
                value={newInvoice.description}
                onChange={e => setNewInvoice(f => ({ ...f, description: e.target.value }))}
                placeholder="e.g. 75% commission claim - deposit received"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewInvoice(false)}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={submitMut.isPending}>
              {submitMut.isPending ? "Submitting..." : "Submit Invoice"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
