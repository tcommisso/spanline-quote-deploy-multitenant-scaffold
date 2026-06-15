import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Receipt } from "lucide-react";

function fmt(val: string | number | null | undefined): string {
  const n = parseFloat(String(val || "0"));
  return n.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function DaPayments() {
  const { data: payments, isLoading } = trpc.daPortal.listPayments.useQuery();

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Payments</h1>
        <Card className="animate-pulse"><CardContent className="p-6"><div className="h-64 bg-muted rounded" /></CardContent></Card>
      </div>
    );
  }

  const totalPaid = payments?.reduce((sum, p) => sum + parseFloat(String(p.amount || "0")), 0) || 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Payments</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Total Received: <span className="font-semibold text-foreground">${fmt(totalPaid)}</span>
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Payments are synced from Xero based on invoices paid for your jobs.
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Invoice #</TableHead>
                  <TableHead>Job / Client</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Reference</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(!payments || payments.length === 0) ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                      <Receipt className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      No payments recorded yet
                    </TableCell>
                  </TableRow>
                ) : (
                  payments.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="text-sm">
                        {p.paidAt ? new Date(p.paidAt).toLocaleDateString("en-AU") : "—"}
                      </TableCell>
                      <TableCell className="font-mono text-sm">{p.invoiceNumber || "—"}</TableCell>
                      <TableCell>{p.clientName || p.jobNo || "—"}</TableCell>
                      <TableCell className="text-right font-semibold">${fmt(p.amount)}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{p.xeroPaymentId ? "Xero" : "Manual"}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
