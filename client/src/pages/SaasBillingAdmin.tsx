import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, CreditCard, DollarSign, ListChecks, Pencil, RefreshCw, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";

type BillingPlanForm = {
  id?: number;
  code: string;
  name: string;
  description: string;
  status: "draft" | "active" | "archived";
  billingModel: "flat" | "seat" | "usage" | "hybrid" | "manual";
  interval: "month" | "year" | "custom";
  basePrice: string;
  includedSeats: string;
  modules: string;
};

type TenantBillingForm = {
  tenantId: number;
  legalName: string;
  billingEmail: string;
  paymentProvider: "stripe" | "xero" | "manual";
  providerCustomerId: string;
  accountStatus: "trialing" | "active" | "past_due" | "suspended" | "cancelled" | "manual";
  accountReconcileStatus: "unknown" | "ok" | "attention" | "failed";
  notes: string;
  subscriptionId?: number;
  planId: string;
  subscriptionStatus: "trialing" | "active" | "paused" | "past_due" | "cancelled" | "expired";
  seatQuantity: string;
  mrr: string;
  subscriptionReconcileStatus: "unknown" | "ok" | "attention" | "failed";
};

const emptyPlanForm: BillingPlanForm = {
  code: "",
  name: "",
  description: "",
  status: "draft",
  billingModel: "hybrid",
  interval: "month",
  basePrice: "0",
  includedSeats: "0",
  modules: "",
};

function centsFromDollars(value: string) {
  const parsed = Number.parseFloat(value || "0");
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.round(parsed * 100));
}

function dollarsFromCents(value: number | null | undefined) {
  return ((Number(value || 0)) / 100).toFixed(2);
}

function formatMoney(value: number | null | undefined) {
  return new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(Number(value || 0) / 100);
}

function healthTone(state: string) {
  if (state === "ok") return "bg-emerald-100 text-emerald-700";
  if (state === "blocked") return "bg-red-100 text-red-700";
  return "bg-amber-100 text-amber-700";
}

function statusTone(status: string | null | undefined) {
  if (status === "active" || status === "ok" || status === "processed") return "bg-emerald-100 text-emerald-700";
  if (status === "failed" || status === "past_due" || status === "suspended" || status === "expired") return "bg-red-100 text-red-700";
  if (status === "attention" || status === "trialing" || status === "received") return "bg-amber-100 text-amber-700";
  return "bg-slate-100 text-slate-700";
}

function planFormFromPlan(plan: any): BillingPlanForm {
  return {
    id: plan.id,
    code: plan.code || "",
    name: plan.name || "",
    description: plan.description || "",
    status: plan.status || "draft",
    billingModel: plan.billingModel || "hybrid",
    interval: plan.interval || "month",
    basePrice: dollarsFromCents(plan.basePriceCents),
    includedSeats: String(plan.includedSeats || 0),
    modules: Array.isArray(plan.modules) ? plan.modules.join(", ") : "",
  };
}

function tenantFormFromRow(row: any): TenantBillingForm {
  return {
    tenantId: row.tenant.id,
    legalName: row.account?.legalName || row.tenant.name || "",
    billingEmail: row.account?.billingEmail || "",
    paymentProvider: row.account?.paymentProvider || "manual",
    providerCustomerId: row.account?.providerCustomerId || "",
    accountStatus: row.account?.status || "manual",
    accountReconcileStatus: row.account?.reconcileStatus || "unknown",
    notes: row.account?.notes || "",
    subscriptionId: row.subscription?.id,
    planId: row.subscription?.planId ? String(row.subscription.planId) : "none",
    subscriptionStatus: row.subscription?.status || "trialing",
    seatQuantity: String(row.subscription?.seatQuantity || 0),
    mrr: dollarsFromCents(row.subscription?.mrrCents),
    subscriptionReconcileStatus: row.subscription?.reconcileStatus || "unknown",
  };
}

export default function SaasBillingAdmin() {
  const utils = trpc.useUtils();
  const diagnostics = trpc.saasBilling.diagnostics.useQuery();
  const plansQuery = trpc.saasBilling.listPlans.useQuery();
  const tenantBillingQuery = trpc.saasBilling.listTenantBilling.useQuery({ health: "all" });
  const eventsQuery = trpc.saasBilling.listEvents.useQuery({ limit: 12 });
  const auditQuery = trpc.saasBilling.auditLog.useQuery({ limit: 8 });

  const [planForm, setPlanForm] = useState<BillingPlanForm>(emptyPlanForm);
  const [tenantForm, setTenantForm] = useState<TenantBillingForm | null>(null);

  const createPlan = trpc.saasBilling.createPlan.useMutation({
    onSuccess: () => {
      toast.success("Billing plan created");
      setPlanForm(emptyPlanForm);
      utils.saasBilling.listPlans.invalidate();
      utils.saasBilling.diagnostics.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const updatePlan = trpc.saasBilling.updatePlan.useMutation({
    onSuccess: () => {
      toast.success("Billing plan updated");
      setPlanForm(emptyPlanForm);
      utils.saasBilling.listPlans.invalidate();
      utils.saasBilling.listTenantBilling.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const upsertTenantBilling = trpc.saasBilling.upsertTenantBilling.useMutation({
    onSuccess: () => {
      toast.success("Tenant billing updated");
      setTenantForm(null);
      utils.saasBilling.listTenantBilling.invalidate();
      utils.saasBilling.diagnostics.invalidate();
      utils.saasBilling.auditLog.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const updateEventStatus = trpc.saasBilling.updateEventStatus.useMutation({
    onSuccess: () => {
      toast.success("Billing event updated");
      utils.saasBilling.listEvents.invalidate();
      utils.saasBilling.diagnostics.invalidate();
      utils.saasBilling.auditLog.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const activePlans = useMemo(
    () => (plansQuery.data || []).filter((plan: any) => plan.status !== "archived"),
    [plansQuery.data],
  );

  const submitPlan = () => {
    const payload = {
      code: planForm.code.trim().toLowerCase(),
      name: planForm.name.trim(),
      description: planForm.description.trim() || null,
      status: planForm.status,
      billingModel: planForm.billingModel,
      interval: planForm.interval,
      basePriceCents: centsFromDollars(planForm.basePrice),
      includedSeats: Number.parseInt(planForm.includedSeats || "0", 10) || 0,
      modules: planForm.modules.split(",").map(item => item.trim()).filter(Boolean),
    };
    if (planForm.id) {
      updatePlan.mutate({ id: planForm.id, ...payload });
    } else {
      createPlan.mutate(payload);
    }
  };

  const submitTenantBilling = () => {
    if (!tenantForm) return;
    upsertTenantBilling.mutate({
      tenantId: tenantForm.tenantId,
      account: {
        legalName: tenantForm.legalName || null,
        billingEmail: tenantForm.billingEmail || null,
        paymentProvider: tenantForm.paymentProvider,
        providerCustomerId: tenantForm.providerCustomerId || null,
        status: tenantForm.accountStatus,
        reconcileStatus: tenantForm.accountReconcileStatus,
        currency: "AUD",
        notes: tenantForm.notes || null,
      },
      subscription: tenantForm.planId === "none" ? null : {
        id: tenantForm.subscriptionId,
        planId: Number(tenantForm.planId),
        status: tenantForm.subscriptionStatus,
        seatQuantity: Number.parseInt(tenantForm.seatQuantity || "0", 10) || 0,
        usageQuantity: 0,
        mrrCents: centsFromDollars(tenantForm.mrr),
        provider: tenantForm.paymentProvider,
        reconcileStatus: tenantForm.subscriptionReconcileStatus,
        cancelAtPeriodEnd: false,
      },
    });
  };

  const d = diagnostics.data;

  return (
    <div className="p-4 md:p-6 max-w-[1500px] mx-auto space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">SaaS Billing</h1>
          <p className="text-sm text-muted-foreground">Tenant billing model, reconciliation status, and provider event visibility.</p>
        </div>
        <Button
          variant="outline"
          onClick={() => {
            diagnostics.refetch();
            plansQuery.refetch();
            tenantBillingQuery.refetch();
            eventsQuery.refetch();
          }}
        >
          <RefreshCw className="h-4 w-4 mr-2" /> Refresh
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Card><CardContent className="p-4 flex items-center gap-3"><DollarSign className="h-5 w-5 text-primary" /><div><p className="text-xs text-muted-foreground">MRR</p><p className="font-semibold">{formatMoney(d?.monthlyRecurringRevenueCents)}</p></div></CardContent></Card>
        <Card><CardContent className="p-4 flex items-center gap-3"><CreditCard className="h-5 w-5 text-primary" /><div><p className="text-xs text-muted-foreground">Active Subs</p><p className="font-semibold">{d?.activeSubscriptionCount ?? "-"}</p></div></CardContent></Card>
        <Card><CardContent className="p-4 flex items-center gap-3"><ListChecks className="h-5 w-5 text-primary" /><div><p className="text-xs text-muted-foreground">Plans</p><p className="font-semibold">{d?.planCount ?? "-"}</p></div></CardContent></Card>
        <Card><CardContent className="p-4 flex items-center gap-3"><AlertTriangle className="h-5 w-5 text-amber-600" /><div><p className="text-xs text-muted-foreground">Failed Events</p><p className="font-semibold">{d?.failedEventCount ?? "-"}</p></div></CardContent></Card>
        <Card><CardContent className="p-4 flex items-center gap-3"><ShieldCheck className="h-5 w-5 text-primary" /><div><p className="text-xs text-muted-foreground">Stripe</p><p className="font-semibold">{d?.stripeConfigured ? "Configured" : "Missing"}</p></div></CardContent></Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-[420px_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>{planForm.id ? "Edit billing plan" : "Create billing plan"}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label>Code</Label>
                <Input value={planForm.code} onChange={(e) => setPlanForm({ ...planForm, code: e.target.value })} placeholder="growth-seat" />
              </div>
              <div className="space-y-1">
                <Label>Status</Label>
                <Select value={planForm.status} onValueChange={(value: any) => setPlanForm({ ...planForm, status: value })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">Draft</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="archived">Archived</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1">
              <Label>Name</Label>
              <Input value={planForm.name} onChange={(e) => setPlanForm({ ...planForm, name: e.target.value })} placeholder="Growth" />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label>Billing model</Label>
                <Select value={planForm.billingModel} onValueChange={(value: any) => setPlanForm({ ...planForm, billingModel: value })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="flat">Flat</SelectItem>
                    <SelectItem value="seat">Seat</SelectItem>
                    <SelectItem value="usage">Usage</SelectItem>
                    <SelectItem value="hybrid">Hybrid</SelectItem>
                    <SelectItem value="manual">Manual</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Interval</Label>
                <Select value={planForm.interval} onValueChange={(value: any) => setPlanForm({ ...planForm, interval: value })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="month">Monthly</SelectItem>
                    <SelectItem value="year">Yearly</SelectItem>
                    <SelectItem value="custom">Custom</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label>Base price AUD</Label>
                <Input type="number" min="0" step="0.01" value={planForm.basePrice} onChange={(e) => setPlanForm({ ...planForm, basePrice: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>Included seats</Label>
                <Input type="number" min="0" value={planForm.includedSeats} onChange={(e) => setPlanForm({ ...planForm, includedSeats: e.target.value })} />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Modules</Label>
              <Input value={planForm.modules} onChange={(e) => setPlanForm({ ...planForm, modules: e.target.value })} placeholder="sales, construction, manufacturing" />
            </div>
            <div className="space-y-1">
              <Label>Description</Label>
              <Textarea value={planForm.description} onChange={(e) => setPlanForm({ ...planForm, description: e.target.value })} rows={3} />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={submitPlan} disabled={createPlan.isPending || updatePlan.isPending || !planForm.code || !planForm.name}>
                {planForm.id ? "Save plan" : "Create plan"}
              </Button>
              {planForm.id && <Button variant="outline" onClick={() => setPlanForm(emptyPlanForm)}>Cancel edit</Button>}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Billing plans</CardTitle>
          </CardHeader>
          <CardContent>
            {plansQuery.isLoading ? (
              <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="py-2 pr-3">Plan</th>
                      <th className="py-2 pr-3">Model</th>
                      <th className="py-2 pr-3">Base</th>
                      <th className="py-2 pr-3">Status</th>
                      <th className="py-2 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(plansQuery.data || []).map((plan: any) => (
                      <tr key={plan.id} className="border-b last:border-0">
                        <td className="py-3 pr-3"><div className="font-medium">{plan.name}</div><div className="text-xs text-muted-foreground">{plan.code}</div></td>
                        <td className="py-3 pr-3 capitalize">{plan.billingModel} / {plan.interval}</td>
                        <td className="py-3 pr-3">{formatMoney(plan.basePriceCents)}</td>
                        <td className="py-3 pr-3"><Badge className={statusTone(plan.status)}>{plan.status}</Badge></td>
                        <td className="py-3 text-right"><Button variant="ghost" size="sm" onClick={() => setPlanForm(planFormFromPlan(plan))}><Pencil className="h-4 w-4" /></Button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Tenant billing health</CardTitle>
        </CardHeader>
        <CardContent>
          {tenantBillingQuery.isLoading ? (
            <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="py-2 pr-3">Tenant</th>
                    <th className="py-2 pr-3">Health</th>
                    <th className="py-2 pr-3">Plan</th>
                    <th className="py-2 pr-3">Account</th>
                    <th className="py-2 pr-3">MRR</th>
                    <th className="py-2 text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {(tenantBillingQuery.data || []).map((row: any) => (
                    <tr key={row.tenant.id} className="border-b last:border-0 align-top">
                      <td className="py-3 pr-3"><div className="font-medium">{row.tenant.name}</div><div className="text-xs text-muted-foreground">{row.tenant.slug}</div></td>
                      <td className="py-3 pr-3"><Badge className={healthTone(row.health.state)}>{row.health.state}</Badge><div className="text-xs text-muted-foreground mt-1">{row.health.reason}</div></td>
                      <td className="py-3 pr-3">{row.plan?.name || <span className="text-muted-foreground">Not assigned</span>}</td>
                      <td className="py-3 pr-3"><Badge className={statusTone(row.account?.status)}>{row.account?.status || "missing"}</Badge><div className="text-xs text-muted-foreground mt-1">{row.account?.billingEmail || row.account?.providerCustomerId || ""}</div></td>
                      <td className="py-3 pr-3">{formatMoney(row.subscription?.mrrCents)}</td>
                      <td className="py-3 text-right"><Button variant="outline" size="sm" onClick={() => setTenantForm(tenantFormFromRow(row))}>Manage</Button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Recent billing events</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {(eventsQuery.data || []).length === 0 ? (
              <p className="text-sm text-muted-foreground">No billing events recorded yet.</p>
            ) : (eventsQuery.data || []).map((event: any) => (
              <div key={event.id} className="flex flex-col gap-2 border-b pb-3 last:border-0 md:flex-row md:items-center md:justify-between">
                <div>
                  <div className="flex items-center gap-2"><Badge className={statusTone(event.status)}>{event.status}</Badge><span className="font-medium text-sm">{event.eventType}</span></div>
                  <p className="text-xs text-muted-foreground mt-1">{event.provider} {event.providerEventId ? `- ${event.providerEventId}` : ""}</p>
                  {event.errorMessage && <p className="text-xs text-red-600 mt-1">{event.errorMessage}</p>}
                </div>
                {event.status === "failed" && (
                  <Button variant="outline" size="sm" onClick={() => updateEventStatus.mutate({ id: event.id, status: "processed" })}>
                    <CheckCircle2 className="h-4 w-4 mr-1" /> Mark processed
                  </Button>
                )}
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Recent admin audit</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {(auditQuery.data || []).length === 0 ? (
              <p className="text-sm text-muted-foreground">No SaaS billing admin actions recorded yet.</p>
            ) : (auditQuery.data || []).map((entry: any) => (
              <div key={entry.id} className="border-b pb-3 last:border-0">
                <div className="flex items-center gap-2"><Badge variant="outline">{entry.entityType}</Badge><span className="font-medium text-sm">{entry.action}</span></div>
                <p className="text-xs text-muted-foreground mt-1">{entry.actorUserName || `User #${entry.actorUserId}`} - {new Date(entry.createdAt).toLocaleString()}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Dialog open={!!tenantForm} onOpenChange={(open) => !open && setTenantForm(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Manage tenant billing</DialogTitle></DialogHeader>
          {tenantForm && (
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1"><Label>Legal name</Label><Input value={tenantForm.legalName} onChange={(e) => setTenantForm({ ...tenantForm, legalName: e.target.value })} /></div>
              <div className="space-y-1"><Label>Billing email</Label><Input value={tenantForm.billingEmail} onChange={(e) => setTenantForm({ ...tenantForm, billingEmail: e.target.value })} /></div>
              <div className="space-y-1"><Label>Provider</Label><Select value={tenantForm.paymentProvider} onValueChange={(value: any) => setTenantForm({ ...tenantForm, paymentProvider: value })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="manual">Manual</SelectItem><SelectItem value="stripe">Stripe</SelectItem><SelectItem value="xero">Xero</SelectItem></SelectContent></Select></div>
              <div className="space-y-1"><Label>Provider customer ID</Label><Input value={tenantForm.providerCustomerId} onChange={(e) => setTenantForm({ ...tenantForm, providerCustomerId: e.target.value })} /></div>
              <div className="space-y-1"><Label>Account status</Label><Select value={tenantForm.accountStatus} onValueChange={(value: any) => setTenantForm({ ...tenantForm, accountStatus: value })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="manual">Manual</SelectItem><SelectItem value="trialing">Trialing</SelectItem><SelectItem value="active">Active</SelectItem><SelectItem value="past_due">Past due</SelectItem><SelectItem value="suspended">Suspended</SelectItem><SelectItem value="cancelled">Cancelled</SelectItem></SelectContent></Select></div>
              <div className="space-y-1"><Label>Account reconcile</Label><Select value={tenantForm.accountReconcileStatus} onValueChange={(value: any) => setTenantForm({ ...tenantForm, accountReconcileStatus: value })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="unknown">Unknown</SelectItem><SelectItem value="ok">OK</SelectItem><SelectItem value="attention">Attention</SelectItem><SelectItem value="failed">Failed</SelectItem></SelectContent></Select></div>
              <div className="space-y-1"><Label>Plan</Label><Select value={tenantForm.planId} onValueChange={(value) => setTenantForm({ ...tenantForm, planId: value })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">No subscription</SelectItem>{activePlans.map((plan: any) => <SelectItem key={plan.id} value={String(plan.id)}>{plan.name}</SelectItem>)}</SelectContent></Select></div>
              <div className="space-y-1"><Label>Subscription status</Label><Select value={tenantForm.subscriptionStatus} onValueChange={(value: any) => setTenantForm({ ...tenantForm, subscriptionStatus: value })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="trialing">Trialing</SelectItem><SelectItem value="active">Active</SelectItem><SelectItem value="paused">Paused</SelectItem><SelectItem value="past_due">Past due</SelectItem><SelectItem value="cancelled">Cancelled</SelectItem><SelectItem value="expired">Expired</SelectItem></SelectContent></Select></div>
              <div className="space-y-1"><Label>Seats</Label><Input type="number" min="0" value={tenantForm.seatQuantity} onChange={(e) => setTenantForm({ ...tenantForm, seatQuantity: e.target.value })} /></div>
              <div className="space-y-1"><Label>MRR AUD</Label><Input type="number" min="0" step="0.01" value={tenantForm.mrr} onChange={(e) => setTenantForm({ ...tenantForm, mrr: e.target.value })} /></div>
              <div className="space-y-1 md:col-span-2"><Label>Notes</Label><Textarea rows={3} value={tenantForm.notes} onChange={(e) => setTenantForm({ ...tenantForm, notes: e.target.value })} /></div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setTenantForm(null)}>Cancel</Button>
            <Button onClick={submitTenantBilling} disabled={upsertTenantBilling.isPending}>Save billing</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
