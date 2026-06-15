import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { CheckCircle2, Calendar, Star, CreditCard, XCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useState, useEffect } from "react";
import { useSearch } from "wouter";

export default function PortalSubscription() {
  const subscriptionQuery = trpc.portal.getMySubscription.useQuery();
  const plansQuery = trpc.portal.getPlans.useQuery();
  const utils = trpc.useUtils();
  const search = useSearch();
  const params = new URLSearchParams(search);

  const [selectedSize, setSelectedSize] = useState<"small" | "medium" | "large">("medium");
  const [checkoutLoading, setCheckoutLoading] = useState<number | null>(null);
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);

  // Handle success/cancel URL params from Stripe redirect
  useEffect(() => {
    if (params.get("success") === "true") {
      toast.success("Subscription activated! Your first service will be scheduled shortly.");
      utils.portal.getMySubscription.invalidate();
    }
    if (params.get("cancelled") === "true") {
      toast.info("Checkout was cancelled. You can subscribe anytime.");
    }
  }, []);

  const checkoutMutation = trpc.portal.createSubscriptionCheckout.useMutation({
    onSuccess: (data) => {
      if (data.checkoutUrl) {
        toast.info("Redirecting to secure checkout...");
        window.open(data.checkoutUrl, "_blank");
      }
      setCheckoutLoading(null);
    },
    onError: (err) => {
      toast.error(err.message || "Failed to create checkout session");
      setCheckoutLoading(null);
    },
  });

  const cancelMutation = trpc.portal.cancelSubscription.useMutation({
    onSuccess: () => {
      toast.success("Subscription cancelled. It will remain active until the end of the billing period.");
      utils.portal.getMySubscription.invalidate();
      setCancelDialogOpen(false);
    },
    onError: (err) => {
      toast.error(err.message || "Failed to cancel subscription");
    },
  });

  const handleSubscribe = (planId: number) => {
    setCheckoutLoading(planId);
    checkoutMutation.mutate({
      planId,
      structureSize: selectedSize,
      origin: window.location.origin,
    });
  };

  const subscriptionData = subscriptionQuery.data;
  const subscription = subscriptionData ? {
    plan: subscriptionData.plan?.name || null,
    planFrequency: subscriptionData.plan?.frequency || null,
    status: subscriptionData.subscription?.status || "active",
    nextServiceDate: subscriptionData.subscription?.nextServiceDate || null,
    stripeSubscriptionId: subscriptionData.subscription?.stripeSubscriptionId || null,
    serviceHistory: subscriptionData.history || [],
  } : null;

  const sizeLabels: Record<string, string> = {
    small: "Small (up to 30m²)",
    medium: "Medium (30–60m²)",
    large: "Large (60m²+)",
  };

  const getPlanPrice = (plan: any) => {
    const price = selectedSize === "small" ? plan.priceSmall
      : selectedSize === "medium" ? plan.priceMedium
      : plan.priceLarge;
    return parseFloat(price);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Care Plans</h1>
        <p className="text-muted-foreground">Capital Patio Cleaners — keep your investment looking its best</p>
      </div>

      {/* Current Subscription */}
      {subscriptionQuery.isLoading ? (
        <Skeleton className="h-32 w-full" />
      ) : subscription?.plan && subscription.status !== "cancelled" ? (
        <Card className="border-primary">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-green-600" />
                  <p className="font-bold text-lg">Active: {subscription.plan}</p>
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  Status: <Badge variant="secondary">{subscription.status}</Badge>
                </p>
              </div>
              <div className="flex items-center gap-3">
                {subscription.nextServiceDate && (
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground">Next Service</p>
                    <p className="font-medium flex items-center gap-1">
                      <Calendar className="w-4 h-4" />
                      {new Date(subscription.nextServiceDate).toLocaleDateString("en-AU")}
                    </p>
                  </div>
                )}
                <Dialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
                  <DialogTrigger asChild>
                    <Button variant="outline" size="sm" className="text-destructive border-destructive hover:bg-destructive/10">
                      <XCircle className="w-4 h-4 mr-1" /> Cancel Plan
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Cancel Subscription</DialogTitle>
                    </DialogHeader>
                    <p className="text-sm text-muted-foreground">
                      Are you sure you want to cancel your <strong>{subscription.plan}</strong> plan?
                      Your subscription will remain active until the end of the current billing period.
                    </p>
                    <DialogFooter>
                      <DialogClose asChild>
                        <Button variant="outline">Keep Plan</Button>
                      </DialogClose>
                      <Button
                        variant="destructive"
                        onClick={() => cancelMutation.mutate()}
                        disabled={cancelMutation.isPending}
                      >
                        {cancelMutation.isPending ? (
                          <><Loader2 className="w-4 h-4 mr-1 animate-spin" /> Cancelling...</>
                        ) : "Yes, Cancel"}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {/* Service History */}
      {subscription?.serviceHistory && subscription.serviceHistory.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Service History</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {subscription.serviceHistory.map((service: any, i: number) => (
                <div key={i} className="flex items-center justify-between py-2 border-b last:border-0">
                  <div>
                    <p className="font-medium text-sm">{service.technicianName || "Service Visit"}</p>
                    <p className="text-xs text-muted-foreground">{new Date(service.serviceDate).toLocaleDateString("en-AU")}</p>
                    {service.notes && <p className="text-xs text-muted-foreground mt-1">{service.notes}</p>}
                  </div>
                  <Badge variant="secondary">{service.status}</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Available Plans */}
      {(!subscription?.plan || subscription.status === "cancelled") && (
        <>
          <div className="flex items-center justify-between flex-wrap gap-3 pt-4">
            <h2 className="text-lg font-semibold">Choose a Care Plan</h2>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Structure size:</span>
              <Select value={selectedSize} onValueChange={(v) => setSelectedSize(v as any)}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="small">{sizeLabels.small}</SelectItem>
                  <SelectItem value="medium">{sizeLabels.medium}</SelectItem>
                  <SelectItem value="large">{sizeLabels.large}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {plansQuery.isLoading ? (
            <div className="grid gap-4 md:grid-cols-3">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-64" />)}
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-3">
              {(plansQuery.data || []).map((plan) => {
                const price = getPlanPrice(plan);
                const isPopular = plan.frequency === "premium";
                return (
                  <Card key={plan.id} className={isPopular ? "border-primary ring-1 ring-primary" : ""}>
                    <CardContent className="pt-6">
                      {isPopular && (
                        <Badge className="mb-3 bg-primary">
                          <Star className="w-3 h-3 mr-1" /> Most Popular
                        </Badge>
                      )}
                      <h3 className="font-bold text-lg">{plan.name}</h3>
                      <p className="text-sm text-muted-foreground mb-3">{plan.description}</p>
                      <p className="text-xl font-bold text-primary mb-4">
                        ${price.toLocaleString("en-AU", { minimumFractionDigits: 0 })}/year
                      </p>
                      <ul className="space-y-2 mb-4">
                        {(plan.features || []).map((f: string, i: number) => (
                          <li key={i} className="flex items-center gap-2 text-sm">
                            <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
                            {f}
                          </li>
                        ))}
                      </ul>
                      <Button
                        className="w-full"
                        variant={isPopular ? "default" : "outline"}
                        onClick={() => handleSubscribe(plan.id)}
                        disabled={checkoutLoading === plan.id}
                      >
                        {checkoutLoading === plan.id ? (
                          <><Loader2 className="w-4 h-4 mr-1 animate-spin" /> Processing...</>
                        ) : (
                          <><CreditCard className="w-4 h-4 mr-1" /> Subscribe Now</>
                        )}
                      </Button>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
          <p className="text-xs text-muted-foreground text-center">
            Pricing varies based on structure size. Select your size above to see exact pricing.
            Payments are securely processed via Stripe.
          </p>
        </>
      )}
    </div>
  );
}
