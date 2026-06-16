import { useEffect, useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Save, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

export default function AdminHbcfBuilderProfile() {
  const utils = trpc.useUtils();
  const { data: profile, isLoading } = trpc.approvals.hbcf.profile.get.useQuery();
  const [form, setForm] = useState({
    builderName: "",
    tradingName: "",
    abn: "",
    licenceNumber: "",
    insurerName: "",
    annualLimit: "0",
    annualLimitUsed: "0",
    annualLimitYear: String(new Date().getFullYear()),
    apiEnabled: false,
    apiBaseUrl: "",
    apiKeyRef: "",
    apiMonthlyLimit: "2500",
  });

  useEffect(() => {
    if (!profile) return;
    setForm({
      builderName: profile.builderName || "",
      tradingName: profile.tradingName || "",
      abn: profile.abn || "",
      licenceNumber: profile.licenceNumber || "",
      insurerName: profile.insurerName || "",
      annualLimit: String(profile.annualLimit || "0"),
      annualLimitUsed: String(profile.annualLimitUsed || "0"),
      annualLimitYear: String(profile.annualLimitYear || new Date().getFullYear()),
      apiEnabled: !!profile.apiEnabled,
      apiBaseUrl: profile.apiBaseUrl || "",
      apiKeyRef: profile.apiKeyRef || "",
      apiMonthlyLimit: String(profile.apiMonthlyLimit || 2500),
    });
  }, [profile]);

  const annualLimitUsedSource = (profile as any)?.annualLimitUsedSource || "profile";
  const annualLimitCertificateCount = Number((profile as any)?.annualLimitCertificateCount || 0);
  const annualUsedValue = annualLimitUsedSource === "certificates"
    ? String(profile?.annualLimitUsed || "0")
    : form.annualLimitUsed;

  const annualUsedPct = useMemo(() => {
    const limit = Number(form.annualLimit || 0);
    if (!limit) return 0;
    return Math.min(100, Math.round((Number(annualUsedValue || 0) / limit) * 100));
  }, [form.annualLimit, annualUsedValue]);

  const apiUsedPct = useMemo(() => {
    const limit = Number(profile?.apiMonthlyLimit || form.apiMonthlyLimit || 2500);
    if (!limit) return 0;
    return Math.min(100, Math.round(((profile?.apiCallsThisMonth || 0) / limit) * 100));
  }, [profile?.apiCallsThisMonth, profile?.apiMonthlyLimit, form.apiMonthlyLimit]);

  const save = trpc.approvals.hbcf.profile.update.useMutation({
    onSuccess: () => {
      toast.success("HBCF builder profile saved");
      utils.approvals.hbcf.profile.get.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const updateField = (field: keyof typeof form, value: string | boolean) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const handleSave = () => {
    save.mutate({
      builderName: form.builderName,
      tradingName: form.tradingName || null,
      abn: form.abn || null,
      licenceNumber: form.licenceNumber || null,
      insurerName: form.insurerName || null,
      annualLimit: form.annualLimit || "0",
      annualLimitUsed: annualUsedValue || "0",
      annualLimitYear: Number(form.annualLimitYear || new Date().getFullYear()),
      apiEnabled: form.apiEnabled,
      apiBaseUrl: form.apiBaseUrl || null,
      apiKeyRef: form.apiKeyRef || null,
      apiMonthlyLimit: Math.min(2500, Math.max(1, Number(form.apiMonthlyLimit || 2500))),
    });
  };

  if (isLoading) {
    return <div className="p-6 text-sm text-muted-foreground">Loading HBCF profile...</div>;
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            <h1 className="text-xl font-semibold">HBCF Builder Profile</h1>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Configure the tenant builder identity, annual HBCF capacity, and API sync limits.
          </p>
        </div>
        <Button onClick={handleSave} disabled={save.isPending || !form.builderName.trim()} className="gap-2">
          <Save className="h-4 w-4" />
          {save.isPending ? "Saving..." : "Save"}
        </Button>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_360px] gap-4">
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Builder Identity</CardTitle>
              <CardDescription>Used to identify your own HBCF policies during project sync and competitor matching.</CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>Builder name</Label>
                <Input value={form.builderName} onChange={(e) => updateField("builderName", e.target.value)} />
              </div>
              <div>
                <Label>Trading name</Label>
                <Input value={form.tradingName} onChange={(e) => updateField("tradingName", e.target.value)} />
              </div>
              <div>
                <Label>ABN</Label>
                <Input value={form.abn} onChange={(e) => updateField("abn", e.target.value)} />
              </div>
              <div>
                <Label>Licence number</Label>
                <Input value={form.licenceNumber} onChange={(e) => updateField("licenceNumber", e.target.value)} />
              </div>
              <div className="md:col-span-2">
                <Label>Insurer</Label>
                <Input value={form.insurerName} onChange={(e) => updateField("insurerName", e.target.value)} />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Annual Limit</CardTitle>
              <CardDescription>Update this when the builder's annual eligibility or used amount changes.</CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label>Limit year</Label>
                <Input type="number" value={form.annualLimitYear} onChange={(e) => updateField("annualLimitYear", e.target.value)} />
              </div>
              <div>
                <Label>Annual limit</Label>
                <Input type="number" min="0" step="0.01" value={form.annualLimit} onChange={(e) => updateField("annualLimit", e.target.value)} />
                {Number(form.annualLimit || 0) <= 0 && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    No annual eligibility limit was supplied in the imported profile. Enter the approved HBCF limit here.
                  </p>
                )}
              </div>
              <div>
                <Label>Used amount</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={annualUsedValue}
                  disabled={annualLimitUsedSource === "certificates"}
                  onChange={(e) => updateField("annualLimitUsed", e.target.value)}
                />
                {annualLimitUsedSource === "certificates" && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Derived from {annualLimitCertificateCount} issued certificate{annualLimitCertificateCount === 1 ? "" : "s"} in the certificate register.
                  </p>
                )}
              </div>
              <div className="md:col-span-3 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Capacity used</span>
                  <span className="font-medium">{annualUsedPct}%</span>
                </div>
                <Progress value={annualUsedPct} />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">API Sync</CardTitle>
              <CardDescription>Set the HBCF API endpoint and cap usage to the free 2,500 calls per month tier.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label>Enable API sync</Label>
                  <p className="text-xs text-muted-foreground">Manual certificate entry remains available when API sync is disabled.</p>
                </div>
                <Switch checked={form.apiEnabled} onCheckedChange={(v) => updateField("apiEnabled", v)} />
              </div>
              <Separator />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <Label>API base URL</Label>
                  <Input value={form.apiBaseUrl} onChange={(e) => updateField("apiBaseUrl", e.target.value)} placeholder="https://..." />
                </div>
                <div>
                  <Label>API key reference</Label>
                  <Input value={form.apiKeyRef} onChange={(e) => updateField("apiKeyRef", e.target.value)} placeholder="env:HBCF_API_KEY" />
                </div>
                <div>
                  <Label>Monthly API limit</Label>
                  <Input type="number" min="1" max="2500" value={form.apiMonthlyLimit} onChange={(e) => updateField("apiMonthlyLimit", e.target.value)} />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Usage</CardTitle>
            <CardDescription>Current sync status and free-tier call consumption.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">API calls this month</span>
                <span className="font-medium">{profile?.apiCallsThisMonth || 0}/{profile?.apiMonthlyLimit || 2500}</span>
              </div>
              <Progress value={apiUsedPct} className="mt-2" />
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-muted-foreground">Month</span>
                <p className="font-medium">{profile?.apiCallMonth || new Date().toISOString().slice(0, 7)}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Last status</span>
                <p><Badge variant={profile?.lastSyncStatus === "failed" ? "destructive" : "outline"}>{profile?.lastSyncStatus || "not_synced"}</Badge></p>
              </div>
              <div className="col-span-2">
                <span className="text-muted-foreground">Last sync</span>
                <p className="font-medium">{profile?.lastSyncAt ? new Date(profile.lastSyncAt).toLocaleString() : "—"}</p>
              </div>
              {profile?.lastSyncError && (
                <div className="col-span-2 rounded border border-destructive/30 bg-destructive/5 p-3 text-destructive">
                  {profile.lastSyncError}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
