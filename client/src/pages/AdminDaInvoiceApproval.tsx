import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { useState } from "react";
import { CheckCircle, XCircle, Send, FileText } from "lucide-react";

function fmt(val: string | number | null | undefined): string {
  const n = parseFloat(String(val || "0"));
  return n.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function AdminDaInvoiceApproval() {
  const utils = trpc.useUtils();
  const { data: invoices, isLoading } = trpc.daPortal.listPendingInvoices.useQuery();
  const approveMut = trpc.daPortal.approveInvoice.useMutation({
    onSuccess: () => { toast.success("Invoice approved"); utils.daPortal.listPendingInvoices.invalidate(); setSelected(null); },
    onError: (e) => toast.error(e.message),
  });
  const rejectMut = trpc.daPortal.rejectInvoice.useMutation({
    onSuccess: () => { toast.success("Invoice rejected"); utils.daPortal.listPendingInvoices.invalidate(); setSelected(null); },
    onError: (e) => toast.error(e.message),
  });
  const pushToXeroMut = trpc.daPortal.pushToXero.useMutation({
    onSuccess: () => { toast.success("Invoice pushed to Xero"); utils.daPortal.listPendingInvoices.invalidate(); setSelected(null); },
    onError: (e) => toast.error(e.message),
  });

  const [selected, setSelected] = useState<any>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [showRejectDialog, setShowRejectDialog] = useState(false);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">DA Invoice Approval</h1>
        <Card className="animate-pulse"><CardContent className="p-6"><div className="h-64 bg-muted rounded" /></CardContent></Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">DA Invoice Approval</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Review and approve Design Adviser commission invoices
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Pending Invoices ({invoices?.length || 0})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice #</TableHead>
                  <TableHead>DA Name</TableHead>
                  <TableHead>Job / Client</TableHead>
                  <TableHead className="text-right">Amount (ex GST)</TableHead>
                  <TableHead className="text-right">Total (inc GST)</TableHead>
                  <TableHead>Submitted</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(!invoices || invoices.length === 0) ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      <CheckCircle className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      No pending invoices
                    </TableCell>
                  </TableRow>
                ) : (
                  invoices.map((inv) => (
                    <TableRow key={inv.id}>
                      <TableCell className="font-mono text-sm">{inv.invoiceNumber}</TableCell>
                      <TableCell>{inv.daName}</TableCell>
                      <TableCell className="text-sm">{inv.description || "—"}</TableCell>
                      <TableCell className="text-right font-semibold">${fmt(inv.amountExGst)}</TableCell>
                      <TableCell className="text-right">${fmt(inv.totalIncGst)}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {inv.submittedAt ? new Date(inv.submittedAt).toLocaleDateString("en-AU") : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex gap-1 justify-end">
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-green-600"
                            onClick={() => approveMut.mutate({ invoiceId: inv.id })}
                            disabled={approveMut.isPending}
                          >
                            <CheckCircle className="h-3.5 w-3.5 mr-1" />
                            Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-red-600"
                            onClick={() => { setSelected(inv); setShowRejectDialog(true); }}
                          >
                            <XCircle className="h-3.5 w-3.5 mr-1" />
                            Reject
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => pushToXeroMut.mutate({ invoiceId: inv.id })}
                            disabled={pushToXeroMut.isPending}
                          >
                            <Send className="h-3.5 w-3.5 mr-1" />
                            Xero
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Reject Dialog */}
      <Dialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Invoice</DialogTitle>
            <DialogDescription>
              Provide a reason for rejecting invoice {selected?.invoiceNumber}
            </DialogDescription>
          </DialogHeader>
          <Textarea
            placeholder="Reason for rejection..."
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRejectDialog(false)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (selected) {
                  rejectMut.mutate({ invoiceId: selected.id, reason: rejectReason });
                  setShowRejectDialog(false);
                  setRejectReason("");
                }
              }}
              disabled={rejectMut.isPending}
            >
              Reject Invoice
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
