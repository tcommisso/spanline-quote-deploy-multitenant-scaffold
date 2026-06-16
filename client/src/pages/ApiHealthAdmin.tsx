import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertCircle, CheckCircle2, Database, Loader2, RefreshCw, Server, XCircle } from "lucide-react";
import { toast } from "sonner";

export default function ApiHealthAdmin() {
  const { data, isLoading, refetch } = trpc.apiHealth.list.useQuery();
  const tenantRepairPreview = trpc.system.tenantDataRepairPreview.useQuery();
  const [results, setResults] = useState<Record<string, { ok: boolean; detail: string; testedAt: string }>>({});
  const testMutation = trpc.apiHealth.test.useMutation({
    onSuccess: (result) => {
      setResults((prev) => ({ ...prev, [result.key]: result }));
      toast[result.ok ? "success" : "error"](`${result.key} test ${result.ok ? "passed" : "failed"}`);
    },
    onError: (err) => toast.error(err.message),
  });
  const repairTenantData = trpc.system.repairTenantData.useMutation({
    onSuccess: (result) => {
      toast.success(`Tenant repair complete: ${result.updatedRows} rows updated, ${result.createdColumns} columns created`);
      tenantRepairPreview.refetch();
    },
    onError: (err) => toast.error(err.message || "Tenant repair failed"),
  });

  const checks = data || [];
  const configured = checks.filter((item) => item.configured).length;
  const failed = Object.values(results).filter((item) => !item.ok).length;
  const repairTables = tenantRepairPreview.data?.tables || [];
  const missingTenantColumns = repairTables.filter((item) => item.exists && !item.hasColumn).length;
  const tenantRepairTables = repairTables.filter((item) => item.exists).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Server className="h-6 w-6" />
            API Health
          </h1>
          <p className="text-sm text-muted-foreground">
            Production provider configuration, polling status, and manual connectivity checks.
          </p>
        </div>
        <Button variant="outline" onClick={() => refetch()} disabled={isLoading}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Refresh
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Configured APIs</CardDescription>
            <CardTitle>{configured}/{checks.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Manual Test Failures</CardDescription>
            <CardTitle>{failed}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Scheduler</CardDescription>
            <CardTitle>Railway Cron</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>External Services</CardTitle>
          <CardDescription>
            Use Test Now after changing Railway variables or provider keys.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Service</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Configured</TableHead>
                    <TableHead>Schedule</TableHead>
                    <TableHead>Last Poll</TableHead>
                    <TableHead>Last Test</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {checks.map((item) => {
                    const result = results[item.key];
                    return (
                      <TableRow key={item.key}>
                        <TableCell>
                          <div className="font-medium">{item.name}</div>
                          <div className="max-w-[360px] truncate text-xs text-muted-foreground">{item.baseUrl}</div>
                        </TableCell>
                        <TableCell>{item.category}</TableCell>
                        <TableCell>
                          {item.configured ? (
                            <Badge className="gap-1 bg-green-100 text-green-800 hover:bg-green-100">
                              <CheckCircle2 className="h-3 w-3" /> Ready
                            </Badge>
                          ) : (
                            <Badge variant="destructive" className="gap-1">
                              <XCircle className="h-3 w-3" /> Missing
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">{item.schedule || "-"}</TableCell>
                        <TableCell className="text-sm">
                          {item.lastSuccessAt ? (
                            <span className="text-green-700">{new Date(item.lastSuccessAt).toLocaleString("en-AU")}</span>
                          ) : item.lastError ? (
                            <span className="text-red-700">{item.lastError}</span>
                          ) : (
                            <span className="text-muted-foreground">No poll log</span>
                          )}
                        </TableCell>
                        <TableCell className="text-sm">
                          {result ? (
                            <span className={result.ok ? "text-green-700" : "text-red-700"}>{result.detail}</span>
                          ) : (
                            <span className="text-muted-foreground">Not tested</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={testMutation.isPending}
                            onClick={() => testMutation.mutate({ key: item.key as any })}
                          >
                            {testMutation.isPending ? (
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : result?.ok === false ? (
                              <AlertCircle className="mr-2 h-4 w-4 text-red-600" />
                            ) : (
                              <RefreshCw className="mr-2 h-4 w-4" />
                            )}
                            Test Now
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            Tenant Data Repair
          </CardTitle>
          <CardDescription>
            For single-tenant imports, assign orphaned rows to the active tenant and add missing tenant columns on tenant-owned tables.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <div className="text-xs text-muted-foreground">Current tenant</div>
              <div className="font-semibold">{tenantRepairPreview.data?.tenantId || "-"}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Repairable tables</div>
              <div className="font-semibold">{tenantRepairTables}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Missing columns</div>
              <div className={missingTenantColumns > 0 ? "font-semibold text-amber-700" : "font-semibold text-green-700"}>
                {missingTenantColumns}
              </div>
            </div>
          </div>
          <Button
            onClick={() => repairTenantData.mutate()}
            disabled={repairTenantData.isPending || tenantRepairPreview.isLoading}
          >
            {repairTenantData.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Database className="mr-2 h-4 w-4" />
            )}
            Repair Tenant Data
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
