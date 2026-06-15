import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DollarSign, Download, FileText } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { generateDaCommissionStatementPdf } from "@/lib/daCommissionStatementPdf";

function fmt(val: string | number | null | undefined): string {
  const n = parseFloat(String(val || "0"));
  return n.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function statusBadge(status: string) {
  const map: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
    pending: { label: "Pending", variant: "outline" },
    deposit_received: { label: "Deposit Received", variant: "secondary" },
    partial_paid: { label: "Partial Paid", variant: "default" },
    fully_paid: { label: "Fully Paid", variant: "default" },
    closed: { label: "Closed", variant: "destructive" },
  };
  const s = map[status] || { label: status, variant: "outline" as const };
  return <Badge variant={s.variant}>{s.label}</Badge>;
}

export default function DaCommissions() {
  const { user } = useAuth();
  const { data: commissions, isLoading } = trpc.daPortal.listCommissions.useQuery();
  const isAdmin = user?.role === "admin" || user?.role === "super_admin";

  const { data: personalDetails } = trpc.daPortal.getPersonalDetails.useQuery();

  function handleExportPDF() {
    if (!commissions?.length) return;
    generateDaCommissionStatementPdf({
      daName: personalDetails?.fullName || user?.name || "Design Adviser",
      daAbn: personalDetails?.abn || undefined,
      daEmail: personalDetails?.email || user?.email || undefined,
      daPhone: personalDetails?.phone || undefined,
      daAddress: personalDetails?.address || undefined,
      commissions: commissions.map(c => ({
        clientName: c.clientName,
        jobNo: c.jobNo,
        contractNo: c.contractNo,
        totalCommission: c.totalCommission,
        amountPaid: c.amountPaid,
        adjustmentsTotal: c.adjustmentsTotal,
        balanceDue: c.balanceDue,
        status: c.status,
      })),
      statementDate: new Date(),
    });
  }

  function handleExportCSV() {
    if (!commissions?.length) return;
    const headers = ["Client Name", "Job No", "Contract No", "Total Commission", "Amount Paid", "Adjustments", "Balance Due", "Status"];
    const rows = commissions.map(c => [
      c.clientName,
      c.jobNo || "",
      c.contractNo || "",
      c.totalCommission,
      c.amountPaid,
      c.adjustmentsTotal,
      c.balanceDue,
      c.status,
    ]);
    const csv = [headers.join(","), ...rows.map(r => r.map(v => `"${v}"`).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `commission-statement-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Unclaimed Commissions</h1>
        <Card className="animate-pulse"><CardContent className="p-6"><div className="h-64 bg-muted rounded" /></CardContent></Card>
      </div>
    );
  }

  const totalBalance = commissions?.reduce((sum, c) => sum + parseFloat(String(c.balanceDue || "0")), 0) || 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold">Unclaimed Commissions</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Total Balance Due: <span className="font-semibold text-foreground">${fmt(totalBalance)}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={handleExportPDF} disabled={!commissions?.length}>
            <FileText className="h-4 w-4 mr-2" />
            Export PDF
          </Button>
          <Button variant="outline" onClick={handleExportCSV} disabled={!commissions?.length}>
            <Download className="h-4 w-4 mr-2" />
            Export CSV
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  {isAdmin && <TableHead>DA</TableHead>}
                  <TableHead>Client Name</TableHead>
                  <TableHead>Job No</TableHead>
                  <TableHead>Contract No</TableHead>
                  <TableHead className="text-right">Total Commission</TableHead>
                  <TableHead className="text-right">Amount Paid</TableHead>
                  <TableHead className="text-right">Adjustments</TableHead>
                  <TableHead className="text-right">Balance Due</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(!commissions || commissions.length === 0) ? (
                  <TableRow>
                    <TableCell colSpan={isAdmin ? 9 : 8} className="text-center py-8 text-muted-foreground">
                      <DollarSign className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      No commission records found
                    </TableCell>
                  </TableRow>
                ) : (
                  commissions.map((c) => (
                    <TableRow key={c.id}>
                      {isAdmin && <TableCell className="font-medium">{c.daName}</TableCell>}
                      <TableCell className="font-medium">{c.clientName}</TableCell>
                      <TableCell>{c.jobNo || "—"}</TableCell>
                      <TableCell>{c.contractNo || "—"}</TableCell>
                      <TableCell className="text-right">${fmt(c.totalCommission)}</TableCell>
                      <TableCell className="text-right">${fmt(c.amountPaid)}</TableCell>
                      <TableCell className="text-right">
                        {parseFloat(String(c.adjustmentsTotal || "0")) !== 0 ? (
                          <span className={parseFloat(String(c.adjustmentsTotal || "0")) < 0 ? "text-red-600" : "text-green-600"}>
                            {parseFloat(String(c.adjustmentsTotal || "0")) > 0 ? "+" : ""}${fmt(c.adjustmentsTotal)}
                          </span>
                        ) : "—"}
                      </TableCell>
                      <TableCell className="text-right font-semibold">${fmt(c.balanceDue)}</TableCell>
                      <TableCell>{statusBadge(c.status)}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">Commission Payment Schedule</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-sm space-y-2">
            <p><strong>75%</strong> — Payable after deposit is received and contract is signed</p>
            <p><strong>25%</strong> — Payable after completion (or adjusted amount at admin's discretion)</p>
            <p className="text-muted-foreground mt-3">
              Formula: Total Commission − Amount Paid ± Adjustments = Balance Due
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
