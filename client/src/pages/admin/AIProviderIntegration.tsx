import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Bot,
  CheckCircle2,
  CircleDollarSign,
  ExternalLink,
  Image,
  KeyRound,
  Lock,
  Mic,
  Settings,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import { useLocation } from "wouter";

function formatAud(value: number | null | undefined) {
  const amount = Number(value || 0);
  if (amount >= 1000) return `$${(amount / 1000).toFixed(1)}k`;
  if (amount >= 1) return `$${amount.toFixed(2)}`;
  return `$${amount.toFixed(4)}`;
}

function ModelCard({
  title,
  icon: Icon,
  model,
  fallbackModels = [],
}: {
  title: string;
  icon: LucideIcon;
  model: string;
  fallbackModels?: string[];
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Icon className="h-4 w-4 text-primary" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div>
          <p className="text-xs text-muted-foreground">Primary model</p>
          <p className="font-mono text-sm break-all">{model}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Fallbacks</p>
          {fallbackModels.length > 0 ? (
            <div className="flex flex-wrap gap-1.5 mt-1">
              {fallbackModels.map(fallback => (
                <Badge key={fallback} variant="outline" className="font-mono text-[11px]">
                  {fallback}
                </Badge>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Built-in service fallback only</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default function AIProviderIntegration() {
  const [, setLocation] = useLocation();
  const { data: providerState, isLoading: providerLoading } = trpc.globalSettings.getAiProviderState.useQuery();
  const { data: renderSummary, isLoading: summaryLoading } = trpc.renderCost.summary.useQuery(undefined);

  const loading = providerLoading || summaryLoading;
  const budgetPercent = renderSummary?.budgetUsedPercent || 0;
  const configured = Boolean(providerState?.configured);

  if (loading) {
    return (
      <div className="space-y-6 max-w-5xl">
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-40 w-full" />
        <div className="grid gap-4 md:grid-cols-3">
          <Skeleton className="h-44 w-full" />
          <Skeleton className="h-44 w-full" />
          <Skeleton className="h-44 w-full" />
        </div>
      </div>
    );
  }

  if (!providerState) {
    return (
      <Alert variant="destructive">
        <TriangleAlert className="h-4 w-4" />
        <AlertTitle>AI provider state unavailable</AlertTitle>
        <AlertDescription>Reload the page or check server logs for the AI provider state endpoint.</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <Bot className="h-6 w-6 text-primary" />
            AI Provider
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Read-only OpenAI provider status from Railway plus tenant AI render limits.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={() => setLocation("/admin/api-health")} className="gap-2">
            <ExternalLink className="h-4 w-4" />
            API Health
          </Button>
          <Button variant="outline" onClick={() => setLocation("/admin/ai-render-pricing")} className="gap-2">
            <Settings className="h-4 w-4" />
            Render Limits
          </Button>
        </div>
      </div>

      <Alert className={configured ? "border-green-200 bg-green-50/60" : "border-amber-200 bg-amber-50/60"}>
        {configured ? <CheckCircle2 className="h-4 w-4 text-green-700" /> : <TriangleAlert className="h-4 w-4 text-amber-700" />}
        <AlertTitle className={configured ? "text-green-900" : "text-amber-900"}>
          {configured ? "OpenAI provider is configured" : "OpenAI provider is not configured"}
        </AlertTitle>
        <AlertDescription className={configured ? "text-green-800" : "text-amber-800"}>
          The API key is managed outside the app in Railway as `OPENAI_API_KEY`. This page intentionally does not show or edit secrets.
        </AlertDescription>
      </Alert>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-primary" />
              Connection
            </CardTitle>
            <CardDescription>Platform-managed provider configuration.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm text-muted-foreground">Provider</span>
              <Badge variant="secondary">{providerState.provider}</Badge>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm text-muted-foreground">Source</span>
              <Badge variant="outline">{providerState.connectionSource}</Badge>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm text-muted-foreground">API key</span>
              <Badge variant={configured ? "default" : "destructive"}>
                {configured ? "Configured" : "Missing"}
              </Badge>
            </div>
            <div className="flex items-start gap-2 rounded-md bg-muted/60 p-3 text-xs text-muted-foreground">
              <Lock className="h-4 w-4 shrink-0 mt-0.5" />
              <span>Secrets stay in Railway. Tenant admins can see status and limits, not credentials.</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <CircleDollarSign className="h-4 w-4 text-green-600" />
              Tenant Limits
            </CardTitle>
            <CardDescription>Current render budget and internal cost assumptions.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-xs text-muted-foreground">Full render</p>
                <p className="font-semibold">{formatAud(providerState.tenantLimits.fullRenderCostAud)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Quick render</p>
                <p className="font-semibold">{formatAud(providerState.tenantLimits.quickRenderCostAud)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Batch render</p>
                <p className="font-semibold">{formatAud(providerState.tenantLimits.batchRenderCostAud)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Monthly budget</p>
                <p className="font-semibold">{formatAud(providerState.tenantLimits.monthlyBudgetAud)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              This Month
            </CardTitle>
            <CardDescription>Tenant-scoped AI render usage against budget.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <p className="text-xs text-muted-foreground">Spend</p>
              <p className="text-2xl font-semibold">
                {formatAud(renderSummary?.monthlyCostAud)} / {formatAud(renderSummary?.monthlyBudgetAud)}
              </p>
            </div>
            <Progress value={Math.min(budgetPercent, 100)} />
            <p className="text-xs text-muted-foreground">
              {budgetPercent.toFixed(0)}% used across {renderSummary?.totalRenders || 0} total logged renders.
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <ModelCard title="Text Responses" icon={Bot} model={providerState.text.model} fallbackModels={providerState.text.fallbackModels} />
        <ModelCard title="Image Generation" icon={Image} model={providerState.image.model} fallbackModels={providerState.image.fallbackModels} />
        <ModelCard title="Transcription" icon={Mic} model={providerState.transcription.model} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-primary" />
            Multi-Tenant Control Boundary
          </CardTitle>
          <CardDescription>
            Platform credentials are shared and controlled outside the app; tenant settings control budget and usage assumptions only.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm text-muted-foreground sm:grid-cols-3">
          <div className="rounded-md border p-3">
            <p className="font-medium text-foreground">Platform</p>
            <p className="mt-1">Owns provider key, model env vars, fallback model env vars, and Railway deployment configuration.</p>
          </div>
          <div className="rounded-md border p-3">
            <p className="font-medium text-foreground">Tenant</p>
            <p className="mt-1">Owns monthly budget and render cost limits used for reporting and internal controls.</p>
          </div>
          <div className="rounded-md border p-3">
            <p className="font-medium text-foreground">Users</p>
            <p className="mt-1">Generate renders and AI outputs through existing permission-guarded app workflows.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
