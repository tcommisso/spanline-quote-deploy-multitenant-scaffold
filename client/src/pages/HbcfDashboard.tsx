import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { AlertTriangle, ArrowRight, BadgeDollarSign, FileCheck, Gauge, ShieldCheck, Target } from "lucide-react";
import { Link } from "wouter";

function formatCurrency(value?: string | number | null) {
  const amount = Number(value || 0);
  if (!Number.isFinite(amount) || amount === 0) return "$0";
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatDate(value?: string | Date | null) {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function HbcfDashboard() {
  const { data: profile, isLoading: profileLoading } = trpc.approvals.hbcf.profile.get.useQuery();
  const { data: certificates, isLoading: certificatesLoading } = trpc.approvals.hbcf.certificates.list.useQuery();
  const { data: matches, isLoading: matchesLoading } = trpc.approvals.hbcf.competitorMatches.list.useQuery({ limit: 100 });

  const isLoading = profileLoading || certificatesLoading || matchesLoading;
  const issuedCertificates = (certificates || []).filter((cert) => cert.status === "issued");
  const totalInsuredValue = issuedCertificates.reduce((total, cert) => total + Number(cert.contractPrice || 0), 0);
  const now = new Date();
  const ninetyDaysFromNow = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);
  const expiringSoon = issuedCertificates
    .filter((cert) => cert.expiresAt && new Date(cert.expiresAt) <= ninetyDaysFromNow)
    .sort((a, b) => new Date(a.expiresAt || 0).getTime() - new Date(b.expiresAt || 0).getTime());
  const annualLimit = Number(profile?.annualLimit || 0);
  const annualUsed = Number(profile?.annualLimitUsed || 0);
  const capacityPct = annualLimit > 0 ? Math.min(100, Math.round((annualUsed / annualLimit) * 100)) : 0;
  const apiLimit = Number(profile?.apiMonthlyLimit || 2500);
  const apiUsedPct = apiLimit > 0 ? Math.min(100, Math.round(((profile?.apiCallsThisMonth || 0) / apiLimit) * 100)) : 0;

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <div className="h-20 rounded-lg bg-muted animate-pulse" />
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {[...Array(4)].map((_, index) => (
            <div key={index} className="h-32 rounded-lg bg-muted animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-6 w-6 text-primary" />
            <h1 className="text-2xl font-bold">HBCF Dashboard</h1>
          </div>
          <p className="text-muted-foreground text-sm mt-1">
            NSW home building compensation fund capacity, certificate register, and competitor match status.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/approvals/hbcf/certificates">
            <Button variant="outline" className="gap-2">
              Certificates <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
          <Link href="/approvals/hbcf/builder-profile">
            <Button variant="brand" className="gap-2">
              Builder Profile <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Issued Certificates</p>
                <p className="text-3xl font-bold mt-1">{issuedCertificates.length}</p>
              </div>
              <div className="rounded-lg bg-blue-50 p-3">
                <FileCheck className="h-5 w-5 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Insured Value</p>
                <p className="text-3xl font-bold mt-1">{formatCurrency(totalInsuredValue)}</p>
              </div>
              <div className="rounded-lg bg-emerald-50 p-3">
                <BadgeDollarSign className="h-5 w-5 text-emerald-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Expiring Within 90 Days</p>
                <p className="text-3xl font-bold mt-1">{expiringSoon.length}</p>
              </div>
              <div className="rounded-lg bg-amber-50 p-3">
                <AlertTriangle className="h-5 w-5 text-amber-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Competitor Matches</p>
                <p className="text-3xl font-bold mt-1">{matches?.total || 0}</p>
              </div>
              <div className="rounded-lg bg-rose-50 p-3">
                <Target className="h-5 w-5 text-rose-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_420px] gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Gauge className="h-4 w-4" /> Builder Capacity
            </CardTitle>
            <CardDescription>
              {profile?.builderName || "Builder profile"} {profile?.licenceNumber ? `· Licence ${profile.licenceNumber}` : ""}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Annual limit used</span>
                <span className="font-medium">{formatCurrency(annualUsed)} / {formatCurrency(annualLimit)}</span>
              </div>
              <Progress value={capacityPct} className="mt-2" />
            </div>
            <div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">API calls this month</span>
                <span className="font-medium">{profile?.apiCallsThisMonth || 0}/{apiLimit}</span>
              </div>
              <Progress value={apiUsedPct} className="mt-2" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
              <div>
                <p className="text-muted-foreground">Last sync</p>
                <p className="font-medium">{profile?.lastSyncAt ? formatDate(profile.lastSyncAt) : "-"}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Sync status</p>
                <Badge variant={profile?.lastSyncStatus === "failed" ? "destructive" : "outline"}>
                  {profile?.lastSyncStatus || "not_synced"}
                </Badge>
              </div>
              <div>
                <p className="text-muted-foreground">Insurer</p>
                <p className="font-medium">{profile?.insurerName || "-"}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Expiring Soon</CardTitle>
            <CardDescription>Certificates with expiry dates inside the next 90 days.</CardDescription>
          </CardHeader>
          <CardContent>
            {expiringSoon.length ? (
              <div className="space-y-3">
                {expiringSoon.slice(0, 5).map((cert) => (
                  <div key={cert.id} className="rounded-md border p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-medium truncate">{cert.ownerName || cert.certificateNumber || "Certificate"}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {[cert.propertyAddress, cert.propertySuburb].filter(Boolean).join(", ") || "-"}
                        </p>
                      </div>
                      <Badge variant="outline">{formatDate(cert.expiresAt)}</Badge>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-8 text-center text-sm text-muted-foreground">
                No certificates are expiring within 90 days.
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
