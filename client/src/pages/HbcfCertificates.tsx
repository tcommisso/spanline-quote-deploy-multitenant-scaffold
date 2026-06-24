import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CloudDownload, FileCheck, Loader2, RefreshCw, ShieldCheck } from "lucide-react";
import { useState } from "react";
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

const POLICY_STATUS_FILTERS = [
  { value: "active", label: "Active" },
  { value: "completed", label: "Completed / closed" },
  { value: "cancelled", label: "Cancelled" },
  { value: "all", label: "All" },
] as const;

type PolicyStatusFilter = typeof POLICY_STATUS_FILTERS[number]["value"];
type ManualPolicyStatus = Exclude<PolicyStatusFilter, "all">;

const MANUAL_POLICY_STATUS_OPTIONS: Array<{ value: ManualPolicyStatus; label: string }> = [
  { value: "active", label: "Active" },
  { value: "completed", label: "Completed / closed" },
  { value: "cancelled", label: "Cancelled" },
];

function policyStatusBadgeVariant(status?: string | null) {
  if (status === "cancelled") return "destructive";
  if (status === "completed") return "secondary";
  return "default";
}

function policyStatusLabel(status?: string | null) {
  if (status === "completed") return "Completed / closed";
  if (status === "cancelled") return "Cancelled";
  return "Active";
}

export default function HbcfCertificates() {
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();
  const [policyStatus, setPolicyStatus] = useState<PolicyStatusFilter>("active");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkPolicyStatus, setBulkPolicyStatus] = useState<ManualPolicyStatus>("completed");
  const { data: certificates, isLoading, refetch, isFetching } = trpc.approvals.hbcf.certificates.list.useQuery({ policyStatus });
  const certificateRows = certificates ?? [];
  const allVisibleSelected = certificateRows.length > 0 && certificateRows.every((cert: any) => selectedIds.has(Number(cert.id)));
  const someSelected = selectedIds.size > 0;
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
  const bulkUpdateStatus = trpc.approvals.hbcf.certificates.bulkUpdatePolicyStatus.useMutation({
    onSuccess: (result) => {
      toast.success(`Updated ${result.updated} HBCF certificate${result.updated === 1 ? "" : "s"}`);
      setSelectedIds(new Set());
      utils.approvals.hbcf.certificates.list.invalidate();
    },
    onError: (err) => toast.error(err.message || "Failed to update HBCF status"),
  });

  const toggleSelectAll = () => {
    const next = new Set(selectedIds);
    if (allVisibleSelected) {
      certificateRows.forEach((cert: any) => next.delete(Number(cert.id)));
    } else {
      certificateRows.forEach((cert: any) => next.add(Number(cert.id)));
    }
    setSelectedIds(next);
  };

  const toggleSelectOne = (id: number) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const handlePolicyFilterChange = (value: PolicyStatusFilter) => {
    setPolicyStatus(value);
    setSelectedIds(new Set());
  };

  const applyBulkPolicyStatus = () => {
    if (!selectedIds.size) return;
    bulkUpdateStatus.mutate({
      certificateIds: Array.from(selectedIds),
      policyStatusGroup: bulkPolicyStatus,
    });
  };

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

      <div className="flex flex-wrap gap-2 rounded-lg border bg-card p-2">
        {POLICY_STATUS_FILTERS.map((option) => (
          <Button
            key={option.value}
            type="button"
            size="sm"
            variant={policyStatus === option.value ? "brand" : "outline"}
            onClick={() => handlePolicyFilterChange(option.value)}
          >
            {option.label}
          </Button>
        ))}
      </div>

      {someSelected && (
        <div className="flex flex-col gap-3 rounded-lg border border-primary/20 bg-primary/10 p-3 sm:flex-row sm:items-center sm:justify-between">
          <span className="text-sm font-medium">
            {selectedIds.size} certificate{selectedIds.size === 1 ? "" : "s"} selected
          </span>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Select value={bulkPolicyStatus} onValueChange={(value) => setBulkPolicyStatus(value as ManualPolicyStatus)}>
              <SelectTrigger className="w-full sm:w-[220px]">
                <SelectValue placeholder="Choose lifecycle" />
              </SelectTrigger>
              <SelectContent>
                {MANUAL_POLICY_STATUS_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button onClick={applyBulkPolicyStatus} disabled={bulkUpdateStatus.isPending} className="gap-2">
              {bulkUpdateStatus.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Apply Status
            </Button>
            <Button variant="ghost" onClick={() => setSelectedIds(new Set())} disabled={bulkUpdateStatus.isPending}>
              Clear
            </Button>
          </div>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Certificate Register</CardTitle>
          <CardDescription>
            {certificates?.length
              ? `${certificates.length} ${policyStatus === "all" ? "" : `${policyStatus} `}certificate${certificates.length === 1 ? "" : "s"} found.`
              : `No ${policyStatus === "all" ? "" : `${policyStatus} `}HBCF certificates found.`}
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
                    <TableHead className="w-10">
                      <Checkbox
                        checked={allVisibleSelected}
                        onCheckedChange={toggleSelectAll}
                        aria-label="Select all visible certificates"
                      />
                    </TableHead>
                    <TableHead>Certificate</TableHead>
                    <TableHead>Policy</TableHead>
                    <TableHead>Owner / Property</TableHead>
                    <TableHead>Policy lifecycle</TableHead>
                    <TableHead>Issued</TableHead>
                    <TableHead>Expires</TableHead>
                    <TableHead className="text-right">Contract</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {certificates.map((cert) => (
                    <TableRow key={cert.id}>
                      <TableCell>
                        <Checkbox
                          checked={selectedIds.has(Number(cert.id))}
                          onCheckedChange={() => toggleSelectOne(Number(cert.id))}
                          aria-label={`Select certificate ${cert.certificateNumber || cert.policyNumber || cert.id}`}
                        />
                      </TableCell>
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
                        <div className="flex flex-col gap-1">
                          <Badge variant={policyStatusBadgeVariant(cert.policyStatusGroup)}>
                            {policyStatusLabel(cert.policyStatusGroup)}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            API status: {cert.status || "-"}
                          </span>
                          {cert.syncStatus ? (
                            <span className="text-xs text-muted-foreground">
                              Sync: {cert.syncStatus}
                            </span>
                          ) : null}
                          {cert.policyStatusSource === "manual" ? (
                            <span className="text-xs text-muted-foreground">
                              Source: manual
                            </span>
                          ) : null}
                        </div>
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
