import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import { DollarSign, Plus, RefreshCw } from "lucide-react";
import { toast } from "sonner";

const STATUS_COLORS: Record<string, string> = {
  DRAFT: "bg-slate-100 text-slate-700",
  SUBMITTED: "bg-blue-100 text-blue-700",
  AUTHORISED: "bg-amber-100 text-amber-700",
  PAID: "bg-emerald-100 text-emerald-700",
  VOIDED: "bg-red-100 text-red-700",
  DELETED: "bg-red-100 text-red-700",
  BILLED: "bg-green-100 text-green-700",
};

interface ProgressInvoicesCardProps {
  jobId: number;
}

export default function ProgressInvoicesCard({ jobId }: ProgressInvoicesCardProps) {
  const connectionStatus = trpc.xero.connectionStatus.useQuery();
  const jobDocuments = trpc.xero.getJobDocuments.useQuery(
    { jobId },
    { enabled: connectionStatus.data?.connected === true }
  );
  const xeroMapping = trpc.xeroProjects.getJobMapping.useQuery(
    { jobId },
    { enabled: connectionStatus.data?.connected === true }
  );
  const xeroInvoices = trpc.xeroProjects.getProjectTransactions.useQuery(
    { mappingId: xeroMapping.data?.id || 0, type: "invoices" },
    { enabled: !!xeroMapping.data?.id }
  );

  const refreshStatus = trpc.xero.refreshDocumentStatus.useMutation({
    onSuccess: () => {
      jobDocuments.refetch();
      toast.success("Status refreshed");
    },
    onError: (err) => toast.error(err.message),
  });

  if (!connectionStatus.data?.connected) {
    return null; // Don't show if Xero not connected
  }

  const localInvoices = (jobDocuments.data || []).filter((d: any) => d.invoiceType === "progress_claim");
  const xeroInvList = xeroInvoices.data?.transactions || [];
  const localInvNumbers = new Set(localInvoices.map((i: any) => i.xeroInvoiceNumber).filter(Boolean));
  const xeroOnlyInvoices = xeroInvList.filter((xi) => !localInvNumbers.has(xi.description));

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <DollarSign className="h-4 w-4" /> Progress Invoices
          </CardTitle>
          <CreateInvoiceDialog jobId={jobId} onSuccess={() => jobDocuments.refetch()} />
        </div>
      </CardHeader>
      <CardContent>
        {localInvoices.length === 0 && xeroOnlyInvoices.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            {xeroInvoices.isLoading ? "Loading Xero invoices..." : "No invoices created yet"}
          </p>
        ) : (
          <div className="space-y-2">
            {/* Xero invoices from Accounting API */}
            {xeroOnlyInvoices.map((inv) => (
              <div key={inv.id} className="flex items-center justify-between p-2 rounded-lg bg-muted/50">
                <div>
                  <p className="text-sm font-medium">{inv.description || "Invoice"}</p>
                  <p className="text-xs text-muted-foreground">
                    {inv.date ? new Date(inv.date).toLocaleDateString("en-AU") : ""}
                    {inv.reference ? ` · Ref: ${inv.reference}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">${(inv.amount || 0).toLocaleString("en-AU", { minimumFractionDigits: 2 })}</span>
                  <Badge className={STATUS_COLORS[inv.status] || "bg-slate-100"} variant="secondary">
                    {inv.status === "AUTHORISED" ? "OUTSTANDING" : inv.status}
                  </Badge>
                </div>
              </div>
            ))}
            {/* Locally-created invoices */}
            {localInvoices.map((inv: any) => (
              <div key={inv.id} className="flex items-center justify-between p-2 rounded-lg bg-muted/50">
                <div>
                  <p className="text-sm font-medium">{inv.xeroInvoiceNumber || "Draft"}</p>
                  <p className="text-xs text-muted-foreground">{inv.description}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">${parseFloat(inv.amount || "0").toLocaleString("en-AU", { minimumFractionDigits: 2 })}</span>
                  <Badge className={STATUS_COLORS[inv.status] || "bg-slate-100"} variant="secondary">
                    {inv.status === "AUTHORISED" ? "OUTSTANDING" : inv.status}
                  </Badge>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => refreshStatus.mutate({ mappingId: inv.id })}
                    disabled={refreshStatus.isPending}
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${refreshStatus.isPending ? "animate-spin" : ""}`} />
                  </Button>
                </div>
              </div>
            ))}
            {/* Total */}
            {(localInvoices.length + xeroOnlyInvoices.length) > 0 && (
              <div className="border-t pt-2 mt-2 flex justify-between text-sm">
                <span className="text-muted-foreground">{localInvoices.length + xeroOnlyInvoices.length} invoice(s)</span>
                <span className="font-semibold">
                  Total: ${(
                    xeroOnlyInvoices.reduce((s, i) => s + (i.amount || 0), 0) +
                    localInvoices.reduce((s: number, i: any) => s + parseFloat(i.amount || "0"), 0)
                  ).toLocaleString("en-AU", { minimumFractionDigits: 2 })}
                </span>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Create Invoice Dialog ──────────────────────────────────────────────────
function CreateInvoiceDialog({ jobId, onSuccess }: { jobId: number; onSuccess: () => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    description: "",
    amount: "",
    dueDate: "",
    reference: "",
  });

  const createInvoice = trpc.xero.createProgressInvoice.useMutation({
    onSuccess: (data) => {
      toast.success(`Invoice ${data.invoiceNumber || ""} created in Xero`);
      setOpen(false);
      setForm({ description: "", amount: "", dueDate: "", reference: "" });
      onSuccess();
    },
    onError: (err) => toast.error(err.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Plus className="h-3.5 w-3.5 mr-1" /> New Invoice
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create Progress Invoice</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Description *</Label>
            <Textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="e.g. Progress Claim #1 - Slab & Frame Complete"
              rows={2}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Amount ($) *</Label>
              <Input
                type="number"
                step="0.01"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
                placeholder="0.00"
              />
            </div>
            <div>
              <Label className="text-xs">Due Date</Label>
              <Input
                type="date"
                value={form.dueDate}
                onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
              />
            </div>
          </div>
          <div>
            <Label className="text-xs">Reference</Label>
            <Input
              value={form.reference}
              onChange={(e) => setForm({ ...form, reference: e.target.value })}
              placeholder="Optional reference number"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button
            onClick={() => createInvoice.mutate({
              jobId,
              description: form.description,
              amount: parseFloat(form.amount || "0"),
              dueDate: form.dueDate || undefined,
              reference: form.reference || undefined,
            })}
            disabled={!form.description || !form.amount || createInvoice.isPending}
          >
            {createInvoice.isPending ? "Creating..." : "Create in Xero"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
