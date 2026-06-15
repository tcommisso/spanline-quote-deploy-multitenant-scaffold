import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import {
  CreditCard, Users, DollarSign, TrendingUp, AlertCircle,
  Calendar, Mail, Phone, MapPin, ExternalLink, ChevronDown,
  ChevronUp, FileText, XCircle, CheckCircle2, PauseCircle,
  Clock,
} from "lucide-react";

const STATUS_BADGE: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; label: string }> = {
  active: { variant: "default", label: "Active" },
  cancelled: { variant: "destructive", label: "Cancelled" },
  paused: { variant: "secondary", label: "Paused" },
  expired: { variant: "outline", label: "Expired" },
  pending: { variant: "outline", label: "Pending" },
};

const STRIPE_STATUS_BADGE: Record<string, string> = {
  active: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  past_due: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  canceled: "bg-slate-100 text-slate-800 dark:bg-slate-900/30 dark:text-slate-300",
  trialing: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  incomplete: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  unpaid: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
};

export default function SubscriptionManagement() {
  const statsQuery = trpc.subscriptionManagement.getStats.useQuery();
  const subsQuery = trpc.subscriptionManagement.listSubscriptions.useQuery();
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [paymentDialogSub, setPaymentDialogSub] = useState<number | null>(null);

  const stats = statsQuery.data;
  const subs = subsQuery.data || [];

  const fmtCurrency = (cents: number) =>
    "$" + (cents / 100).toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const fmtDate = (ts: number | string | null) => {
    if (!ts) return "—";
    return new Date(ts).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <CreditCard className="h-7 w-7 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">Subscription Management</h1>
          <p className="text-sm text-muted-foreground">CPC subscription overview and payment history</p>
        </div>
      </div>

      {/* Stats Cards */}
      {statsQuery.isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
      ) : stats ? (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <StatCard icon={Users} label="Total" value={String(stats.totalSubscriptions)} color="text-primary" />
          <StatCard icon={CheckCircle2} label="Active" value={String(stats.totalActive)} color="text-green-600" />
          <StatCard icon={XCircle} label="Cancelled" value={String(stats.totalCancelled)} color="text-red-600" />
          <StatCard icon={PauseCircle} label="Paused" value={String(stats.totalPaused)} color="text-amber-600" />
          <StatCard
            icon={DollarSign}
            label="Annual Revenue"
            value={"$" + stats.annualRevenue.toLocaleString("en-AU", { minimumFractionDigits: 0 })}
            color="text-green-600"
          />
        </div>
      ) : null}

      {/* Subscriptions List */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="h-4 w-4" />
            All Subscriptions ({subs.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {subsQuery.isLoading ? (
            <div className="p-6 space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-16 rounded-lg" />
              ))}
            </div>
          ) : subs.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              <CreditCard className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p>No subscriptions yet</p>
              <p className="text-xs mt-1">Subscriptions will appear here once clients sign up through the portal</p>
            </div>
          ) : (
            <div className="divide-y">
              {subs.map((sub) => {
                const isExpanded = expandedId === sub.id;
                const statusCfg = STATUS_BADGE[sub.status] || STATUS_BADGE.pending;
                return (
                  <div key={sub.id} className="hover:bg-muted/30 transition-colors">
                    {/* Main Row */}
                    <div
                      className="flex items-center gap-4 p-4 cursor-pointer"
                      onClick={() => setExpandedId(isExpanded ? null : sub.id)}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-medium truncate">{sub.clientName}</p>
                          <Badge variant={statusCfg.variant} className="text-[10px]">
                            {statusCfg.label}
                          </Badge>
                          {sub.stripeStatus && sub.stripeStatus !== sub.status && (
                            <Badge className={`text-[10px] ${STRIPE_STATUS_BADGE[sub.stripeStatus] || ""}`}>
                              Stripe: {sub.stripeStatus}
                            </Badge>
                          )}
                          {sub.cancelAtPeriodEnd && (
                            <Badge variant="outline" className="text-[10px] border-amber-300 text-amber-600">
                              Cancels at period end
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1 flex-wrap">
                          <span>{sub.planName}</span>
                          <span className="text-muted-foreground/50">|</span>
                          <span className="capitalize">{sub.structureSize}</span>
                          {sub.structureAreaM2 && <span>({sub.structureAreaM2}m²)</span>}
                          {sub.siteAddress && (
                            <>
                              <span className="text-muted-foreground/50">|</span>
                              <span className="flex items-center gap-0.5"><MapPin className="h-3 w-3" />{sub.siteAddress}</span>
                            </>
                          )}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="font-semibold">
                          {sub.amountPaid ? fmtCurrency(sub.amountPaid) : "—"}
                          <span className="text-xs text-muted-foreground font-normal">/yr</span>
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {sub.nextServiceDate ? `Next: ${fmtDate(sub.nextServiceDate as any)}` : ""}
                        </p>
                      </div>
                      {isExpanded ? (
                        <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" />
                      ) : (
                        <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                      )}
                    </div>

                    {/* Expanded Details */}
                    {isExpanded && (
                      <div className="px-4 pb-4 pt-0 border-t bg-muted/10">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-3">
                          {/* Client Info */}
                          <div className="space-y-2">
                            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Client</p>
                            <div className="space-y-1 text-sm">
                              <p className="font-medium">{sub.clientName}</p>
                              {sub.clientEmail && (
                                <p className="flex items-center gap-1.5 text-muted-foreground">
                                  <Mail className="h-3.5 w-3.5" /> {sub.clientEmail}
                                </p>
                              )}
                              {sub.clientPhone && (
                                <p className="flex items-center gap-1.5 text-muted-foreground">
                                  <Phone className="h-3.5 w-3.5" /> {sub.clientPhone}
                                </p>
                              )}
                              {sub.siteAddress && (
                                <p className="flex items-center gap-1.5 text-muted-foreground">
                                  <MapPin className="h-3.5 w-3.5" /> {sub.siteAddress}
                                </p>
                              )}
                            </div>
                          </div>

                          {/* Subscription Details */}
                          <div className="space-y-2">
                            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Subscription</p>
                            <div className="space-y-1 text-sm">
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">Plan</span>
                                <span className="font-medium">{sub.planName}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">Size</span>
                                <span className="capitalize">{sub.structureSize} {sub.structureAreaM2 ? `(${sub.structureAreaM2}m²)` : ""}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">Started</span>
                                <span>{fmtDate(sub.startDate as any)}</span>
                              </div>
                              {sub.currentPeriodEnd && (
                                <div className="flex justify-between">
                                  <span className="text-muted-foreground">Period End</span>
                                  <span>{fmtDate(sub.currentPeriodEnd)}</span>
                                </div>
                              )}
                              {sub.cancelledAt && (
                                <div className="flex justify-between">
                                  <span className="text-muted-foreground">Cancelled</span>
                                  <span className="text-red-600">{fmtDate(sub.cancelledAt as any)}</span>
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Stripe Info */}
                          <div className="space-y-2">
                            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Stripe</p>
                            <div className="space-y-1 text-sm">
                              {sub.stripeSubscriptionId ? (
                                <>
                                  <div className="flex justify-between items-center">
                                    <span className="text-muted-foreground">Sub ID</span>
                                    <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{sub.stripeSubscriptionId.slice(0, 20)}...</code>
                                  </div>
                                  {sub.stripeCustomerId && (
                                    <div className="flex justify-between items-center">
                                      <span className="text-muted-foreground">Customer</span>
                                      <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{sub.stripeCustomerId.slice(0, 20)}...</code>
                                    </div>
                                  )}
                                  <div className="flex gap-2 mt-2">
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      className="text-xs"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setPaymentDialogSub(sub.id);
                                      }}
                                    >
                                      <FileText className="h-3 w-3 mr-1" /> Payment History
                                    </Button>
                                    {sub.stripeCustomerId && (
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        className="text-xs"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          window.open(`https://dashboard.stripe.com/customers/${sub.stripeCustomerId}`, "_blank");
                                        }}
                                      >
                                        <ExternalLink className="h-3 w-3 mr-1" /> Stripe
                                      </Button>
                                    )}
                                  </div>
                                </>
                              ) : (
                                <p className="text-muted-foreground text-xs">No Stripe subscription linked</p>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Payment History Dialog */}
      {paymentDialogSub !== null && (
        <PaymentHistoryDialog
          subscriptionId={paymentDialogSub}
          onClose={() => setPaymentDialogSub(null)}
        />
      )}
    </div>
  );
}

// ─── Payment History Dialog ──────────────────────────────────────────────────
function PaymentHistoryDialog({
  subscriptionId,
  onClose,
}: {
  subscriptionId: number;
  onClose: () => void;
}) {
  const historyQuery = trpc.subscriptionManagement.getPaymentHistory.useQuery({ subscriptionId });
  const data = historyQuery.data;

  const fmtCurrency = (cents: number) =>
    "$" + (cents / 100).toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const fmtDate = (ts: number) =>
    new Date(ts).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });

  return (
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Payment History
          </DialogTitle>
        </DialogHeader>

        {historyQuery.isLoading ? (
          <div className="space-y-3 py-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-16 rounded-lg" />
            ))}
          </div>
        ) : !data?.invoices.length ? (
          <div className="py-8 text-center text-muted-foreground">
            <CreditCard className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p>No payment history found</p>
            <p className="text-xs mt-1">Invoices will appear here after the first billing cycle</p>
          </div>
        ) : (
          <div className="space-y-2">
            {data.invoices.map((inv) => (
              <div key={inv.id} className="flex items-center gap-3 p-3 rounded-lg border bg-muted/20">
                <div className={`w-2 h-2 rounded-full ${
                  inv.status === "paid" ? "bg-green-500" :
                  inv.status === "open" ? "bg-amber-500" :
                  inv.status === "void" ? "bg-slate-400" :
                  "bg-red-500"
                }`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium">{inv.number || inv.id.slice(0, 20)}</p>
                    <Badge variant="outline" className="text-[10px] capitalize">{inv.status}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {fmtDate(inv.created)} — Period: {fmtDate(inv.periodStart)} to {fmtDate(inv.periodEnd)}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="font-semibold text-sm">{fmtCurrency(inv.amountPaid)}</p>
                  {inv.amountDue > inv.amountPaid && (
                    <p className="text-xs text-red-600">Due: {fmtCurrency(inv.amountDue)}</p>
                  )}
                </div>
                <div className="flex gap-1 shrink-0">
                  {inv.hostedInvoiceUrl && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => window.open(inv.hostedInvoiceUrl!, "_blank")}
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  {inv.pdfUrl && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => window.open(inv.pdfUrl!, "_blank")}
                    >
                      <FileText className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Stat Card ───────────────────────────────────────────────────────────────
function StatCard({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: any;
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-muted-foreground">{label}</span>
          <Icon className={`h-4 w-4 ${color || "text-muted-foreground"}`} />
        </div>
        <p className={`text-2xl font-bold ${color || ""}`}>{value}</p>
      </CardContent>
    </Card>
  );
}
