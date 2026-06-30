import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { FileSignature, Download, ExternalLink, Clock, CheckCircle, AlertCircle, MapPin } from "lucide-react";

const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline"; icon: typeof CheckCircle }> = {
  signed: { label: "Signed", variant: "default", icon: CheckCircle },
  sent: { label: "Awaiting Signature", variant: "secondary", icon: Clock },
  draft: { label: "Draft", variant: "outline", icon: AlertCircle },
  cancelled: { label: "Cancelled", variant: "destructive", icon: AlertCircle },
};

export default function TradePortalContracts() {
  const { data: contracts, isLoading } = trpc.tradePortal.getContracts.useQuery();

  if (isLoading) {
    return (
      <div className="space-y-4 p-4">
        <h1 className="text-xl font-bold">My Contracts</h1>
        {[1, 2, 3].map(i => <Skeleton key={i} className="h-32 w-full rounded-lg" />)}
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4 max-w-3xl mx-auto">
      <div className="flex items-center gap-3">
        <FileSignature className="w-6 h-6 text-primary" />
        <h1 className="text-xl font-bold">My Contracts</h1>
      </div>
      <p className="text-sm text-muted-foreground">
        View and download your signed subcontracts for each job.
      </p>

      {!contracts || contracts.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <FileSignature className="w-10 h-10 mx-auto text-muted-foreground/40 mb-3" />
            <p className="text-muted-foreground">No contracts found</p>
            <p className="text-xs text-muted-foreground mt-1">
              Contracts will appear here once they are assigned to you.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {contracts.map((contract) => {
            const status = statusConfig[contract.status || "draft"] || statusConfig.draft;
            const StatusIcon = status.icon;
            const sum = parseFloat(contract.subcontractSum || "0");

            return (
              <Card key={contract.id} className="overflow-hidden">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <CardTitle className="text-base truncate">
                        {contract.clientName || contract.quoteNumber || `Contract #${contract.id}`}
                      </CardTitle>
                      {contract.quoteNumber && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Job: {contract.quoteNumber}
                        </p>
                      )}
                      {contract.clientAccountNumber && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Account: {contract.clientAccountNumber}
                        </p>
                      )}
                    </div>
                    <Badge variant={status.variant} className="shrink-0 flex items-center gap-1">
                      <StatusIcon className="w-3 h-3" />
                      {status.label}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {/* Address */}
                  {contract.siteAddress && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <MapPin className="w-3 h-3" /> {contract.siteAddress}
                    </p>
                  )}

                  {/* Value & Date */}
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-semibold text-green-700">
                      ${sum.toLocaleString("en-AU", { minimumFractionDigits: 2 })}
                      <span className="text-xs font-normal text-muted-foreground ml-1">inc GST</span>
                    </span>
                    {contract.signedAt && (
                      <span className="text-xs text-muted-foreground">
                        Signed: {new Date(contract.signedAt).toLocaleDateString("en-AU")}
                      </span>
                    )}
                    {!contract.signedAt && contract.sentAt && (
                      <span className="text-xs text-muted-foreground">
                        Sent: {new Date(contract.sentAt).toLocaleDateString("en-AU")}
                      </span>
                    )}
                  </div>

                  {/* Actions */}
                  {contract.pdfUrl && (
                    <div className="flex gap-2 pt-1">
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1"
                        onClick={() => window.open(contract.pdfUrl!, "_blank")}
                      >
                        <ExternalLink className="w-3.5 h-3.5 mr-1.5" />
                        View PDF
                      </Button>
                      <Button
                        size="sm"
                        variant="default"
                        className="flex-1"
                        asChild
                      >
                        <a href={contract.pdfUrl!} download>
                          <Download className="w-3.5 h-3.5 mr-1.5" />
                          Download
                        </a>
                      </Button>
                    </div>
                  )}
                  {!contract.pdfUrl && contract.status === "sent" && (
                    <p className="text-xs text-primary bg-primary/5 rounded p-2">
                      This contract is awaiting your signature. Check your email for the signing link.
                    </p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
