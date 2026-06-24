import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { CloudDownload, FileCheck, RefreshCw, ShieldCheck } from "lucide-react";
import { useLocation } from "wouter";
import { toast } from "sonner";

function formatDate(value?: string | Date | null) {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatCurrency(value?: string | number | null) {
  const amount = Number(value || 0);
  if (!Number.isFinite(amount) || amount === 0) return "-";
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    maximumFractionDigits: 0,
  }).format(amount);
}

export default function HbcfCertificates() {
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();
  const { data: certificates, isLoading, refetch, isFetching } = trpc.approvals.hbcf.certificates.list.useQuery();
  const syncAll = trpc.approvals.hbcf.certificates.syncAll.useMutation({
    onSuccess: (result) => {
      if (result.checked === 0) {
        toast.warning(result.message || "HBCF API sync finished but returned no matching certificate rows.");
      } else {
        toast.success(`HBCF API sync complete: ${result.updated} updated from ${result.checked} checked`);
      }
      utils.approvals.hbcf.certificates.list.invalidate();
      utils.approvals.hbcf.profile.get.invalidate();
    },
    onError: (err) => toast.error(err.message || "HBCF API sync failed"),
  });

  return (
    <div className="p-6 space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            <h1 className="text-xl font-semibold">HBCF Certificates</h1>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Issued HBCF certificates recorded from project sync, manual entry, and API import.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => refetch()} disabled={isFetching || syncAll.isPending} className="gap-2">
            <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button variant="brand" onClick={() => syncAll.mutate()} disabled={syncAll.isPending || isFetching} className="gap-2">
            <CloudDownload className={`h-4 w-4 ${syncAll.isPending ? "animate-spin" : ""}`} />
            Sync API
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Certificate Register</CardTitle>
          <CardDescription>
            {certificates?.length ? `${certificates.length} certificate${certificates.length === 1 ? "" : "s"} found.` : "No HBCF certificates found yet."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="py-10 text-center text-sm text-muted-foreground">Loading HBCF certificates...</div>
          ) : certificates && certificates.length > 0 ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Certificate</TableHead>
                    <TableHead>Policy</TableHead>
                    <TableHead>Owner / Property</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Issued</TableHead>
                    <TableHead>Expires</TableHead>
                    <TableHead className="text-right">Contract</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {certificates.map((cert) => (
                    <TableRow key={cert.id}>
                      <TableCell className="font-medium">{cert.certificateNumber || "-"}</TableCell>
                      <TableCell>{cert.policyNumber || "-"}</TableCell>
                      <TableCell>
                        <div className="max-w-md">
                          <p className="font-medium">{cert.ownerName || "-"}</p>
                          <p className="text-xs text-muted-foreground truncate">
                            {[cert.propertyAddress, cert.propertySuburb, cert.propertyPostcode].filter(Boolean).join(", ") || "-"}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={cert.status === "issued" ? "default" : "outline"}>
                          {cert.status}
                        </Badge>
                      </TableCell>
                      <TableCell>{formatDate(cert.issuedAt)}</TableCell>
                      <TableCell>{formatDate(cert.expiresAt)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(cert.contractPrice)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="py-12 text-center">
              <FileCheck className="h-10 w-10 mx-auto text-muted-foreground/50" />
              <p className="mt-3 font-medium">No HBCF certificate data yet</p>
              <p className="text-sm text-muted-foreground mt-1">
                Production currently has the builder profile configured, but no imported or synced HBCF certificate rows.
              </p>
              <Button variant="outline" className="mt-4" onClick={() => setLocation("/approvals/hbcf/builder-profile")}>
                Open Builder Profile
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
