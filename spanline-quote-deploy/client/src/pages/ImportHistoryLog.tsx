import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { History, FileSpreadsheet, CheckCircle2, AlertCircle, Loader2, Sheet } from "lucide-react";
import { toast } from "sonner";
import XeroBudgetImportDialog from "@/components/XeroBudgetImportDialog";
import XeroCostImportDialog from "@/components/XeroCostImportDialog";

export default function ImportHistoryLog() {
  const { data: batches, isLoading } = trpc.xeroCostImport.getImportHistory.useQuery();

  // Google Sheets Import state
  const [showGsheetImport, setShowGsheetImport] = useState(false);
  const [gsheetStep, setGsheetStep] = useState<"preview" | "importing" | "done">("preview");
  const [gsheetResult, setGsheetResult] = useState<{ totalImported: number; totalSkipped: number } | null>(null);

  const gsheetPreview = trpc.gsheetImport.preview.useQuery(
    { cutoffDate: "2025-07-01" },
    { enabled: showGsheetImport }
  );

  const gsheetImportMut = trpc.gsheetImport.import.useMutation({
    onSuccess: (result) => {
      setGsheetResult(result);
      setGsheetStep("done");
      toast.success(`Imported ${result.totalImported} leads from Google Sheets`);
    },
    onError: (err) => {
      toast.error(err.message || "Google Sheets import failed");
      setGsheetStep("preview");
    },
  });

  const handleGsheetImport = () => {
    setGsheetStep("importing");
    gsheetImportMut.mutate({ cutoffDate: "2025-07-01" });
  };

  const resetGsheetImport = () => {
    setShowGsheetImport(false);
    setGsheetStep("preview");
    setGsheetResult(null);
  };

  return (
    <div className="container py-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <History className="h-6 w-6 text-muted-foreground" />
          <div>
            <h1 className="text-2xl font-bold">Import History</h1>
            <p className="text-sm text-muted-foreground">
              Import data from external sources and view import history
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={() => setShowGsheetImport(true)}>
            <Sheet className="h-4 w-4 mr-1" /> Import Leads from Sheets
          </Button>
          <XeroBudgetImportDialog />
          <XeroCostImportDialog />
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" />
            Import Batches
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              <span className="ml-2 text-muted-foreground">Loading import history...</span>
            </div>
          ) : !batches || batches.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <FileSpreadsheet className="h-12 w-12 mx-auto mb-3 opacity-40" />
              <p className="font-medium">No imports yet</p>
              <p className="text-sm mt-1">
                Import a Xero Project Details report or leads from Google Sheets.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[180px]">Date</TableHead>
                    <TableHead>Filename</TableHead>
                    <TableHead className="w-[120px]">Date Range</TableHead>
                    <TableHead className="text-right w-[100px]">New Records</TableHead>
                    <TableHead className="text-right w-[100px]">Duplicates</TableHead>
                    <TableHead className="text-right w-[100px]">Skipped</TableHead>
                    <TableHead className="text-right w-[80px]">Total</TableHead>
                    <TableHead className="w-[100px]">Status</TableHead>
                    <TableHead>Uploaded By</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {batches.map((batch) => (
                    <TableRow key={batch.id}>
                      <TableCell className="font-medium">
                        {batch.createdAt
                          ? new Date(batch.createdAt).toLocaleString("en-AU", {
                              day: "2-digit",
                              month: "short",
                              year: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })
                          : "—"}
                      </TableCell>
                      <TableCell>
                        <span className="text-sm" title={batch.filename}>
                          {batch.filename.length > 50
                            ? batch.filename.slice(0, 47) + "..."
                            : batch.filename}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {batch.dateRangeStart && batch.dateRangeEnd
                          ? `${batch.dateRangeStart} → ${batch.dateRangeEnd}`
                          : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <span className="font-semibold text-green-600 dark:text-green-400">
                          {batch.importedRows}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <span className="text-amber-600 dark:text-amber-400">
                          {batch.duplicateRows}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <span className="text-muted-foreground">
                          {batch.skippedRows}
                        </span>
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {batch.totalRows}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={batch.status} />
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {batch.uploadedByName || "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Summary stats */}
      {batches && batches.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold">{batches.length}</div>
              <p className="text-sm text-muted-foreground">Total Imports</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                {batches.reduce((sum, b) => sum + (b.importedRows || 0), 0).toLocaleString()}
              </div>
              <p className="text-sm text-muted-foreground">Total New Records</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold text-amber-600 dark:text-amber-400">
                {batches.reduce((sum, b) => sum + (b.duplicateRows || 0), 0).toLocaleString()}
              </div>
              <p className="text-sm text-muted-foreground">Total Duplicates Skipped</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold">
                {batches.reduce((sum, b) => sum + (b.totalRows || 0), 0).toLocaleString()}
              </div>
              <p className="text-sm text-muted-foreground">Total Rows Processed</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Google Sheets Import Dialog */}
      <Dialog open={showGsheetImport} onOpenChange={(open) => { if (!open) resetGsheetImport(); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Import from Google Sheets</DialogTitle>
            <DialogDescription>
              Import leads from your Altaspan leads spreadsheet (from 1 July 2025 onwards).
            </DialogDescription>
          </DialogHeader>

          {gsheetStep === "preview" && (
            <div className="space-y-4">
              {gsheetPreview.isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  <span className="ml-2 text-muted-foreground">Scanning spreadsheet...</span>
                </div>
              ) : gsheetPreview.error ? (
                <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg p-4">
                  <p className="text-sm text-red-700 dark:text-red-400">Failed to read spreadsheet. Make sure it's shared with "Anyone with the link can view".</p>
                </div>
              ) : (
                <>
                  <div className="bg-muted/50 rounded-lg p-4 space-y-2">
                    <p className="text-sm font-medium">Tabs found:</p>
                    {gsheetPreview.data?.tabs.map((tab) => (
                      <div key={tab.tab} className="flex justify-between text-sm">
                        <span>{tab.tab}</span>
                        <span className="text-muted-foreground">
                          {tab.afterCutoff} leads (from {tab.totalRows} total rows)
                        </span>
                      </div>
                    ))}
                    <div className="border-t pt-2 mt-2 flex justify-between font-medium text-sm">
                      <span>Total to import</span>
                      <span>{gsheetPreview.data?.tabs.reduce((sum, t) => sum + t.afterCutoff, 0) || 0} leads</span>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Only leads dated from 1 July 2025 onwards will be imported. Duplicates (matching email or phone) will be skipped.
                  </p>
                  <DialogFooter>
                    <Button variant="outline" onClick={resetGsheetImport}>Cancel</Button>
                    <Button onClick={handleGsheetImport} disabled={!gsheetPreview.data?.tabs.some(t => t.afterCutoff > 0)}>
                      <FileSpreadsheet className="h-4 w-4 mr-1" /> Import All
                    </Button>
                  </DialogFooter>
                </>
              )}
            </div>
          )}

          {gsheetStep === "importing" && (
            <div className="flex flex-col items-center justify-center py-8 space-y-3">
              <Loader2 className="h-10 w-10 animate-spin text-primary" />
              <p className="text-muted-foreground">Importing leads from all tabs...</p>
              <p className="text-xs text-muted-foreground">This may take a minute for large datasets.</p>
            </div>
          )}

          {gsheetStep === "done" && (
            <div className="text-center py-6 space-y-3">
              <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto" />
              <p className="text-lg font-medium">Import Complete</p>
              <p className="text-muted-foreground">
                Successfully imported <strong>{gsheetResult?.totalImported || 0}</strong> new leads.
              </p>
              {(gsheetResult?.totalSkipped ?? 0) > 0 && (
                <p className="text-sm text-amber-600 dark:text-amber-400">
                  Skipped {gsheetResult!.totalSkipped} duplicate(s) (matching email or phone).
                </p>
              )}
              <Button onClick={resetGsheetImport}>Close</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case "completed":
      return (
        <Badge variant="outline" className="text-green-600 border-green-200 dark:border-green-800">
          <CheckCircle2 className="h-3 w-3 mr-1" />
          Completed
        </Badge>
      );
    case "failed":
      return (
        <Badge variant="outline" className="text-red-600 border-red-200 dark:border-red-800">
          <AlertCircle className="h-3 w-3 mr-1" />
          Failed
        </Badge>
      );
    case "processing":
      return (
        <Badge variant="outline" className="text-blue-600 border-blue-200 dark:border-blue-800">
          <Loader2 className="h-3 w-3 mr-1 animate-spin" />
          Processing
        </Badge>
      );
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}
