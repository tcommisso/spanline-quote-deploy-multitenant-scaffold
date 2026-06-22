import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  RefreshCw,
  Search,
  ShieldCheck,
  Sun,
} from "lucide-react";

type DiagnosticQuote = {
  id: number;
  tenantId: number | null;
  tenantName: string | null;
  tenantSlug: string | null;
  userId: number;
  creatorName: string | null;
  creatorEmail: string | null;
  quoteNumber: string;
  status: string;
  archived: boolean;
  clientId: number | null;
  clientName: string;
  clientEmail: string | null;
  clientPhone: string | null;
  clientAddress: string | null;
  designAdvisor: string | null;
  totalRRPInc: string | null;
  unitsCount: number | null;
  hasSpecData: boolean;
  hasChecklistSelections: boolean;
  createdAt: string | Date;
  updatedAt: string | Date;
  serverListVisible: boolean;
  defaultUiVisible: boolean;
  visibilityReasons: string[];
};

function formatDate(value: string | Date | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("en-AU", { dateStyle: "medium", timeStyle: "short" });
}

function formatMoney(value: string | number | null | undefined) {
  if (value == null || value === "") return "-";
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "-";
  return amount.toLocaleString("en-AU", { style: "currency", currency: "AUD" });
}

function statusClass(status: string) {
  if (status === "accepted") return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (status === "sent") return "bg-blue-50 text-blue-700 border-blue-200";
  if (status === "lost") return "bg-red-50 text-red-600 border-red-200";
  return "bg-muted text-muted-foreground";
}

function StatCard({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <Card className="gap-2 py-4">
      <CardContent className="px-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-2xl font-semibold text-foreground">{value}</p>
        {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}

function QuoteDiagnosticsTable({
  title,
  description,
  rows,
  currentTenantId,
  onOpenQuote,
}: {
  title: string;
  description?: string;
  rows: DiagnosticQuote[];
  currentTenantId: number;
  onOpenQuote: (id: number) => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Sun className="h-4 w-4 text-amber-600" />
          {title}
        </CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
            No Eclipse quote rows matched this diagnostic view.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Quote</TableHead>
                <TableHead>Client</TableHead>
                <TableHead>Tenant</TableHead>
                <TableHead>Created By</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Saved</TableHead>
                <TableHead>Data</TableHead>
                <TableHead>Visibility</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="w-24 text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => {
                const inCurrentTenant = row.tenantId === currentTenantId;
                return (
                  <TableRow key={`${title}-${row.id}`}>
                    <TableCell>
                      <div className="font-medium">{row.quoteNumber}</div>
                      <div className="text-xs text-muted-foreground">ID {row.id}</div>
                    </TableCell>
                    <TableCell className="min-w-52 whitespace-normal">
                      <div className="font-medium">{row.clientName || "No client name"}</div>
                      <div className="text-xs text-muted-foreground">{row.clientEmail || row.clientPhone || "No contact"}</div>
                      <div className="text-xs text-muted-foreground">{row.clientAddress || "No address"}</div>
                    </TableCell>
                    <TableCell>
                      <div>{row.tenantName || `Tenant ${row.tenantId || "-"}`}</div>
                      <div className="text-xs text-muted-foreground">{row.tenantSlug || "-"}</div>
                    </TableCell>
                    <TableCell>
                      <div>{row.creatorName || `User ${row.userId}`}</div>
                      <div className="text-xs text-muted-foreground">{row.creatorEmail || "-"}</div>
                      {row.designAdvisor && <div className="text-xs text-muted-foreground">DA: {row.designAdvisor}</div>}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        <Badge variant="outline" className={`capitalize ${statusClass(row.status)}`}>{row.status}</Badge>
                        {row.archived && <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">Archived</Badge>}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-xs">Created {formatDate(row.createdAt)}</div>
                      <div className="text-xs text-muted-foreground">Updated {formatDate(row.updatedAt)}</div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        <Badge variant="outline">Units {row.unitsCount ?? "-"}</Badge>
                        {row.hasSpecData && <Badge variant="outline">Spec</Badge>}
                        {row.hasChecklistSelections && <Badge variant="outline">Checklist</Badge>}
                      </div>
                    </TableCell>
                    <TableCell className="min-w-72 whitespace-normal">
                      {row.serverListVisible ? (
                        <div className="flex items-start gap-2 text-emerald-700">
                          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                          <span className="text-xs">Normal Eclipse list query returns this row.</span>
                        </div>
                      ) : (
                        <div className="flex items-start gap-2 text-amber-700">
                          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                          <span className="text-xs">Normal Eclipse list query does not return this row.</span>
                        </div>
                      )}
                      {row.visibilityReasons.length > 0 && (
                        <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                          {row.visibilityReasons.map((reason) => <li key={reason}>{reason}</li>)}
                        </ul>
                      )}
                    </TableCell>
                    <TableCell className="text-right">{formatMoney(row.totalRRPInc)}</TableCell>
                    <TableCell className="text-right">
                      {inCurrentTenant ? (
                        <Button variant="outline" size="sm" className="gap-1" onClick={() => onOpenQuote(row.id)}>
                          <ExternalLink className="h-3.5 w-3.5" />
                          Open
                        </Button>
                      ) : (
                        <span className="text-xs text-muted-foreground">Outside tenant</span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

export default function EclipseQuoteDiagnostics() {
  const [, navigate] = useLocation();
  const [search, setSearch] = useState("");
  const [submittedSearch, setSubmittedSearch] = useState("");

  const diagnostics = trpc.eclipseRoof.quotes.diagnostics.useQuery({
    search: submittedSearch || undefined,
    limit: 25,
  });

  const data = diagnostics.data;
  const statusSummary = useMemo(() => {
    const counts = data?.summary.statusCounts || {};
    return Object.entries(counts)
      .map(([status, count]) => `${status}: ${count}`)
      .join(" · ") || "No status counts";
  }, [data?.summary.statusCounts]);

  const currentTenantId = data?.context.tenant.id || 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Eclipse Quote Diagnostics</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Admin-only visibility check for saved Eclipse quotes, tenant context, and list-query behaviour.
          </p>
        </div>
        <Button variant="outline" className="gap-2 self-start" onClick={() => diagnostics.refetch()} disabled={diagnostics.isFetching}>
          <RefreshCw className={`h-4 w-4 ${diagnostics.isFetching ? "animate-spin" : ""}`} />
          Reload
        </Button>
      </div>

      <Card>
        <CardContent className="flex flex-col gap-3 pt-6 md:flex-row md:items-end">
          <div className="flex-1 space-y-2">
            <label className="text-sm font-medium">Search quote number, client, email, phone, address, or row ID</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") setSubmittedSearch(search.trim());
                }}
                placeholder="e.g. EQ-0123, client name, or saved row ID"
              />
            </div>
          </div>
          <Button onClick={() => setSubmittedSearch(search.trim())} className="gap-2">
            <Search className="h-4 w-4" />
            Run Diagnostic
          </Button>
          {(submittedSearch || search) && (
            <Button
              variant="ghost"
              onClick={() => {
                setSearch("");
                setSubmittedSearch("");
              }}
            >
              Clear
            </Button>
          )}
        </CardContent>
      </Card>

      {diagnostics.error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Diagnostic failed</AlertTitle>
          <AlertDescription>{diagnostics.error.message}</AlertDescription>
        </Alert>
      )}

      {diagnostics.isLoading ? (
        <div className="rounded-lg border p-10 text-center text-sm text-muted-foreground">Loading Eclipse diagnostics...</div>
      ) : data ? (
        <>
          <Alert>
            <ShieldCheck className="h-4 w-4" />
            <AlertTitle>Current Context</AlertTitle>
            <AlertDescription>
              Tenant: <strong>{data.context.tenant.name || data.context.tenant.id}</strong>
              {" "}({data.context.tenant.slug || "no slug"}, membership {data.context.tenant.membershipRole || "unknown"}).
              User: <strong>{data.context.user.name || data.context.user.email || data.context.user.id}</strong>
              {" "}({data.context.user.role}). Search: <strong>{data.context.search || "latest rows"}</strong>.
            </AlertDescription>
          </Alert>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <StatCard label="Normal List Rows" value={data.summary.serverListCount} hint="Rows returned by the same server list path" />
            <StatCard label="Diagnostic Matches" value={data.summary.currentTenantMatchCount} hint="Rows shown below for this tenant" />
            <StatCard label="Active / Archived" value={`${data.summary.activeCount} / ${data.summary.archivedCount}`} />
            <StatCard label="Statuses" value={statusSummary} />
            <StatCard
              label="Outside-Tenant Check"
              value={data.summary.globalDiagnosticsAvailable ? (data.outsideTenantMatches?.length || 0) : "Locked"}
              hint={data.summary.globalDiagnosticsAvailable ? `Null tenant rows: ${data.summary.nullTenantCount ?? 0}` : "Super admin only"}
            />
          </div>

          <QuoteDiagnosticsTable
            title={submittedSearch ? "Current Tenant Matches" : "Latest Current Tenant Quotes"}
            description="These rows are scoped to the currently selected tenant."
            rows={(data.latestQuotes || []) as DiagnosticQuote[]}
            currentTenantId={currentTenantId}
            onOpenQuote={(id) => navigate(`/eclipse-quotes/${id}`)}
          />

          <QuoteDiagnosticsTable
            title="Latest Quotes Saved By Current User"
            description="Useful when a save succeeds but the normal list does not show the new row."
            rows={(data.latestByCurrentUser || []) as DiagnosticQuote[]}
            currentTenantId={currentTenantId}
            onOpenQuote={(id) => navigate(`/eclipse-quotes/${id}`)}
          />

          {data.summary.globalDiagnosticsAvailable && submittedSearch && (
            <QuoteDiagnosticsTable
              title="Super Admin Outside-Tenant Matches"
              description="Only shown to super admins. Use this to confirm whether a quote was saved to another tenant or with no tenant."
              rows={(data.outsideTenantMatches || []) as DiagnosticQuote[]}
              currentTenantId={currentTenantId}
              onOpenQuote={(id) => navigate(`/eclipse-quotes/${id}`)}
            />
          )}
        </>
      ) : null}
    </div>
  );
}
