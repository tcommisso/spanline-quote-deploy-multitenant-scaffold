import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { DollarSign, Save, Sparkles } from "lucide-react";
import { toast } from "sonner";

const DEFAULT_RENDER_PRICING = {
  fullRenderCostAud: 0.08,
  quickRenderCostAud: 0.04,
  batchRenderCostAud: 0.06,
  monthlyBudgetAud: 10,
};

export default function AIRenderPricingSettings() {
  const utils = trpc.useUtils();
  const { data: renderPricing, isLoading } = trpc.globalSettings.getRenderPricing.useQuery();
  const setRenderPricing = trpc.globalSettings.setRenderPricing.useMutation({
    onSuccess: () => {
      toast.success("AI render pricing saved");
      utils.globalSettings.getRenderPricing.invalidate();
    },
    onError: (err) => toast.error(err.message || "Failed to save pricing"),
  });
  const [pricingForm, setPricingForm] = useState(DEFAULT_RENDER_PRICING);

  useEffect(() => {
    if (!renderPricing) return;
    setPricingForm({
      fullRenderCostAud: renderPricing.fullRenderCostAud,
      quickRenderCostAud: renderPricing.quickRenderCostAud,
      batchRenderCostAud: renderPricing.batchRenderCostAud,
      monthlyBudgetAud: renderPricing.monthlyBudgetAud,
    });
  }, [renderPricing]);

  const updateField = (field: keyof typeof pricingForm, value: string) => {
    setPricingForm((current) => ({
      ...current,
      [field]: Number.parseFloat(value) || 0,
    }));
  };

  const handleSave = () => {
    setRenderPricing.mutate(pricingForm);
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <Sparkles className="h-6 w-6 text-primary" />
            AI Render Pricing
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Set the AUD cost assumptions used for AI render generation budgets and usage reporting.
          </p>
        </div>
        <Button onClick={handleSave} disabled={setRenderPricing.isPending} className="gap-2 w-full sm:w-auto">
          <Save className="h-4 w-4" />
          Save Pricing
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <DollarSign className="h-4 w-4 text-green-600" />
            Render Cost Settings
          </CardTitle>
          <CardDescription>
            These rates do not charge customers directly. They give the app a consistent internal basis for render cost tracking.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Full Render Cost (AUD)</Label>
            <Input
              type="number"
              step="0.01"
              min="0"
              max="10"
              value={pricingForm.fullRenderCostAud}
              onChange={(e) => updateField("fullRenderCostAud", e.target.value)}
            />
            <p className="text-xs text-muted-foreground">High-quality detailed render.</p>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Quick Render Cost (AUD)</Label>
            <Input
              type="number"
              step="0.01"
              min="0"
              max="10"
              value={pricingForm.quickRenderCostAud}
              onChange={(e) => updateField("quickRenderCostAud", e.target.value)}
            />
            <p className="text-xs text-muted-foreground">Fast preview render.</p>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Batch Render Cost (AUD)</Label>
            <Input
              type="number"
              step="0.01"
              min="0"
              max="10"
              value={pricingForm.batchRenderCostAud}
              onChange={(e) => updateField("batchRenderCostAud", e.target.value)}
            />
            <p className="text-xs text-muted-foreground">Per render in batch mode.</p>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Monthly Budget (AUD)</Label>
            <Input
              type="number"
              step="1"
              min="0"
              max="10000"
              value={pricingForm.monthlyBudgetAud}
              onChange={(e) => updateField("monthlyBudgetAud", e.target.value)}
            />
            <p className="text-xs text-muted-foreground">Alert threshold for monthly spending.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
