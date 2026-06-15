import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { DollarSign, ExternalLink, Download, CheckCircle, Clock, AlertCircle } from "lucide-react";
import { toast } from "sonner";

function ProgressPaymentSchedule() {
  const { data, isLoading } = trpc.portal.getPaymentSchedule.useQuery();

  if (isLoading) {
    return (
      <Card>
        <CardHeader><CardTitle className="text-lg">Progress Payment Schedule</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-3">{[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
        </CardContent>
      </Card>
    );
  }

  if (!data?.hasXeroProject) return null;

  if (data.error) {
    return (
      <Card>
        <CardHeader><CardTitle className="text-lg">Progress Payment Schedule</CardTitle></CardHeader>
        <CardContent><p className="text-muted-foreground text-sm">{data.error}</p></CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <DollarSign className="h-5 w-5" /> Progress Payment Schedule
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {data.summary && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-4 bg-muted/50 rounded-lg">
            <div><div className="text-xs text-muted-foreground">Contract Total</div><div className="text-lg font-bold">${data.summary.totalContract.toLocaleString()}</div></div>
            <div><div className="text-xs text-muted-foreground">Invoiced</div><div className="text-lg font-bold text-primary">${data.summary.totalInvoiced.toLocaleString()}</div></div>
            <div><div className="text-xs text-muted-foreground">Paid</div><div className="text-lg font-bold text-green-600">${data.summary.totalPaid.toLocaleString()}</div></div>
            <div><div className="text-xs text-muted-foreground">Remaining</div><div className="text-lg font-bold text-orange-600">${data.summary.totalRemaining.toLocaleString()}</div></div>
          </div>
        )}
        {data.summary && (
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-muted-foreground"><span>Payment Progress</span><span>{data.summary.progressPercent}%</span></div>
            <div className="h-2 bg-muted rounded-full overflow-hidden"><div className="h-full bg-green-500 rounded-full transition-all" style={{ width: `${data.summary.progressPercent}%` }} /></div>
          </div>
        )}
        {data.schedule.length > 0 ? (
          <>
            {/* Mobile: card layout */}
            <div className="space-y-2 sm:hidden">
              {data.schedule.map((m) => (
                <div key={m.id} className="p-3 bg-muted/50 rounded-lg">
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <p className="font-medium text-sm">{m.name}</p>
                    {m.isPaid ? <Badge variant="default" className="bg-green-100 text-green-800 hover:bg-green-100 shrink-0"><CheckCircle className="h-3 w-3 mr-1" /> Paid</Badge>
                      : m.isInvoiced ? <Badge variant="default" className="bg-primary/10 text-primary hover:bg-primary/10 shrink-0"><Clock className="h-3 w-3 mr-1" /> Invoiced</Badge>
                      : <Badge variant="secondary" className="shrink-0"><AlertCircle className="h-3 w-3 mr-1" /> Pending</Badge>}
                  </div>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span>Amount: <span className="font-medium text-foreground">${m.amount.toLocaleString()}</span></span>
                    {m.amountInvoiced > 0 && <span>Invoiced: <span className="font-medium text-foreground">${m.amountInvoiced.toLocaleString()}</span></span>}
                  </div>
                </div>
              ))}
            </div>
            {/* Desktop: table layout */}
            <div className="overflow-x-auto hidden sm:block">
              <table className="w-full text-sm">
                <thead><tr className="border-b text-left"><th className="p-3 font-medium">Stage</th><th className="p-3 font-medium text-right">Amount</th><th className="p-3 font-medium text-right">Invoiced</th><th className="p-3 font-medium text-center">Status</th></tr></thead>
                <tbody>
                  {data.schedule.map((m) => (
                    <tr key={m.id} className="border-b last:border-0 hover:bg-muted/30">
                      <td className="p-3 font-medium">{m.name}</td>
                      <td className="p-3 text-right">${m.amount.toLocaleString()}</td>
                      <td className="p-3 text-right">{m.amountInvoiced > 0 ? `$${m.amountInvoiced.toLocaleString()}` : "\u2014"}</td>
                      <td className="p-3 text-center">
                        {m.isPaid ? <Badge variant="default" className="bg-green-100 text-green-800 hover:bg-green-100"><CheckCircle className="h-3 w-3 mr-1" /> Paid</Badge>
                          : m.isInvoiced ? <Badge variant="default" className="bg-primary/10 text-primary hover:bg-primary/10"><Clock className="h-3 w-3 mr-1" /> Invoiced</Badge>
                          : <Badge variant="secondary"><AlertCircle className="h-3 w-3 mr-1" /> Pending</Badge>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-4">Payment schedule will appear here once milestones are set up.</p>
        )}
      </CardContent>
    </Card>
  );
}

export default function PortalInvoices() {
  const docsQuery = trpc.portal.getDocuments.useQuery();
  const invoiceDocs = docsQuery.data?.filter((d) => d.category === "invoice") || [];

  const handleDownload = async (fileUrl: string, title: string) => {
    try {
      const response = await fetch(fileUrl);
      if (!response.ok) throw new Error("Download failed");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      // Use title as filename, ensure .pdf extension
      const filename = title.endsWith(".pdf") ? title : `${title}.pdf`;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      toast.error("Failed to download invoice PDF");
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold">Invoices & Payments</h1>
        <p className="text-sm text-muted-foreground">Payment schedule, history, and outstanding invoices</p>
      </div>

      <ProgressPaymentSchedule />

      {docsQuery.isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-20 w-full" />)}
        </div>
      ) : !invoiceDocs.length ? (
        <Card>
          <CardContent className="py-12 text-center">
            <DollarSign className="w-12 h-12 mx-auto mb-4 text-muted-foreground/50" />
            <p className="text-muted-foreground">No invoices yet</p>
            <p className="text-sm text-muted-foreground mt-1">Invoices will appear here once they are issued.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {invoiceDocs.map((doc) => (
            <Card key={doc.id}>
              <CardContent className="py-4">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <div>
                    <p className="font-medium">{doc.title}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {new Date(doc.createdAt).toLocaleDateString("en-AU")}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="secondary" className="text-xs">Invoice</Badge>
                    {doc.fileUrl && (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDownload(doc.fileUrl!, doc.title)}
                          title="Download PDF"
                        >
                          <Download className="w-4 h-4 mr-1" /> PDF
                        </Button>
                        <Button variant="ghost" size="sm" asChild>
                          <a href={doc.fileUrl} target="_blank" rel="noopener noreferrer">
                            <ExternalLink className="w-4 h-4" />
                          </a>
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
