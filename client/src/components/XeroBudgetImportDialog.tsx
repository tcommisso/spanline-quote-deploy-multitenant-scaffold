import { useState, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import {
  Upload, FileSpreadsheet, Loader2, CheckCircle2, AlertTriangle, Trash2, Link2, Search,
} from "lucide-react";
import { toast } from "sonner";

export default function XeroBudgetImportDialog() {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [unmatchedSearch, setUnmatchedSearch] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const utils = trpc.useUtils();

  const importMutation = trpc.xeroBudgetImport.importBudgetReport.useMutation({
    onSuccess: (data) => {
      setResult(data);
      setImporting(false);
      toast.success(`Imported ${data.imported} budget items across matched jobs`);
      utils.xeroBudgetImport.getImportHistory.invalidate();
      utils.xeroBudgetImport.getUnmatchedSummary.invalidate();
      utils.xeroBudgetImport.getJobBudget.invalidate();
      utils.constructionFinancial.invalidate();
      utils.constructionClients.invalidate();
    },
    onError: (err) => {
      setImporting(false);
      toast.error(err.message || "Import failed");
    },
  });

  const importHistory = trpc.xeroBudgetImport.getImportHistory.useQuery(undefined, {
    enabled: open,
  });

  const unmatchedSummary = trpc.xeroBudgetImport.getUnmatchedSummary.useQuery({
    search: unmatchedSearch || undefined,
    limit: 20,
    offset: 0,
  }, {
    enabled: open,
  });

  const deleteBatch = trpc.xeroBudgetImport.deleteBatch.useMutation({
    onSuccess: () => {
      toast.success("Budget import batch deleted");
      importHistory.refetch();
      unmatchedSummary.refetch();
      utils.xeroBudgetImport.getJobBudget.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const attachProject = trpc.xeroBudgetImport.attachUnmatchedProject.useMutation({
    onSuccess: (data) => {
      toast.success(`Attached ${data.attachedRows} budget line(s) to ${data.job.quoteNumber || data.job.clientName}`);
      unmatchedSummary.refetch();
      utils.xeroBudgetImport.getJobBudget.invalidate();
      utils.constructionFinancial.invalidate();
      utils.constructionClients.invalidate();
    },
    onError: (err) => toast.error(err.message || "Could not attach budget lines"),
  });

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) {
      setFile(f);
      setResult(null);
    }
  };

  const handleImport = async () => {
    if (!file) return;
    setImporting(true);
    setResult(null);

    try {
      const buffer = await file.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      let binary = "";
      for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      const fileBase64 = btoa(binary);

      importMutation.mutate({
        fileBase64,
        filename: file.name,
      });
    } catch (err) {
      setImporting(false);
      toast.error("Failed to read file");
    }
  };

  const handleClose = () => {
    setOpen(false);
    setFile(null);
    setResult(null);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); else setOpen(true); }}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Upload className="h-4 w-4 mr-1" /> Import Budgets
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" />
            Import Xero Project Budgets
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4">
          {/* Upload Area */}
          <div
            className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:border-primary/50 transition-colors"
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
            onDrop={(e) => {
              e.preventDefault();
              e.stopPropagation();
              const f = e.dataTransfer.files?.[0];
              if (f && (f.name.endsWith(".xlsx") || f.name.endsWith(".xls") || f.name.endsWith(".csv"))) {
                setFile(f);
                setResult(null);
              } else {
                toast.error("Please upload an Excel or CSV file (.xlsx, .xls or .csv)");
              }
            }}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={handleFileSelect}
              className="hidden"
            />
            {file ? (
              <div className="flex items-center justify-center gap-2">
                <FileSpreadsheet className="h-5 w-5 text-green-600" />
                <span className="text-sm font-medium">{file.name}</span>
                <span className="text-xs text-muted-foreground">({(file.size / 1024).toFixed(0)} KB)</span>
              </div>
            ) : (
              <div>
                <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground">
                  Drop your Xero Project Details budget/task export here or click to browse
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Accepts .xlsx, .xls or .csv files
                </p>
              </div>
            )}
          </div>

          {/* Instructions */}
          <div className="bg-muted/50 rounded-lg p-3 text-xs text-muted-foreground space-y-1">
            <p className="font-medium text-foreground">How to export from Xero:</p>
            <ol className="list-decimal list-inside space-y-0.5">
              <li>Go to Xero → Projects → Reports → Project Details</li>
              <li>Use the budget/task export with Contact, Project Name, Project State, Project Item Type, Project Item Name and Estimate</li>
              <li>Export as Excel or CSV and upload the file here</li>
            </ol>
            <p className="mt-2">
              <strong>Duplicate prevention:</strong> Uploads are cumulative. Existing rows are updated by hash, so the Manus baseline and future Xero exports do not duplicate each other.
            </p>
          </div>

          {/* Import Result */}
          {result && (
            <div className="bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-lg p-3 space-y-2">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <span className="text-sm font-medium text-green-700 dark:text-green-400">Import Complete</span>
              </div>
              <div className="grid grid-cols-3 md:grid-cols-6 gap-2 text-xs">
                <div>
                  <p className="text-muted-foreground">Total Rows</p>
                  <p className="font-semibold">{result.totalRows}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Matched</p>
                  <p className="font-semibold text-green-600">{result.imported}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Unmatched</p>
                  <p className="font-semibold text-amber-600">{result.skipped}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Duplicates</p>
                  <p className="font-semibold text-muted-foreground">{result.duplicates ?? 0}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Jobs Completed</p>
                  <p className="font-semibold text-blue-600">{result.closedJobsUpdated ?? 0}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Leads Completed</p>
                  <p className="font-semibold text-blue-600">{result.closedLeadsUpdated ?? 0}</p>
                </div>
              </div>
              {result.unmatchedProjects?.length > 0 && (
                <div className="mt-2">
                  <p className="text-xs text-amber-600 flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" />
                    {result.unmatchedProjects.length} project(s) not matched to jobs:
                  </p>
                  <ul className="text-xs text-muted-foreground mt-1 space-y-0.5">
                    {result.unmatchedProjects.slice(0, 5).map((p: string) => (
                      <li key={p} className="font-mono">• {p}</li>
                    ))}
                    {result.unmatchedProjects.length > 5 && (
                      <li className="text-muted-foreground">...and {result.unmatchedProjects.length - 5} more</li>
                    )}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Import History */}
          {(importHistory.data?.length || 0) > 0 && (
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase mb-2">Recent Budget Imports</p>
              <div className="space-y-1.5">
                {importHistory.data?.slice(0, 5).map((batch) => (
                  <div key={batch.id} className="flex items-center justify-between p-2 rounded-lg bg-muted/50 text-xs">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{batch.filename}</p>
                      <p className="text-muted-foreground">
                        {new Date(batch.createdAt).toLocaleDateString("en-AU")} · {batch.importedRows ?? 0} matched
                        {(batch.skippedRows ?? 0) > 0 && ` · ${batch.skippedRows} unmatched`}
                        {(batch.duplicateRows ?? 0) > 0 && ` · ${batch.duplicateRows} duplicates`}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 ml-2">
                      <Badge variant="outline" className="text-[10px]">
                        {batch.status}
                      </Badge>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-muted-foreground hover:text-destructive"
                        onClick={() => {
                          if (confirm("Delete this budget import batch?")) {
                            deleteBatch.mutate({ batchId: batch.id });
                          }
                        }}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Unmatched Budget Lines */}
          <div className="border rounded-lg p-3 space-y-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase">Unmatched Budget Lines</p>
                <p className="text-xs text-muted-foreground">
                  Attach imported Xero budget projects that did not automatically match a construction job.
                </p>
              </div>
              <Badge variant={(unmatchedSummary.data?.totalItems || 0) > 0 ? "secondary" : "outline"}>
                {unmatchedSummary.data?.totalItems || 0} rows
              </Badge>
            </div>

            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                value={unmatchedSearch}
                onChange={(e) => setUnmatchedSearch(e.target.value)}
                placeholder="Search unmatched project or contact..."
                className="pl-8 h-9"
              />
            </div>

            {unmatchedSummary.isLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-3">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading unmatched budgets...
              </div>
            ) : !unmatchedSummary.data?.rows?.length ? (
              <div className="text-sm text-muted-foreground py-3">
                No unmatched budget lines found.
              </div>
            ) : (
              <div className="space-y-2">
                {unmatchedSummary.data.rows.map((row) => (
                  <div key={`${row.projectName}-${row.contactName || ""}`} className="rounded-md border bg-muted/30 p-3 text-sm">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <p className="font-medium truncate">{row.projectName}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {row.contactName || "No contact"} · {row.itemCount} line{row.itemCount === 1 ? "" : "s"} · ${row.totalIncGst.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} inc GST
                        </p>
                      </div>
                    </div>

                    {row.suggestions.length > 0 ? (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {row.suggestions.map((job) => (
                          <Button
                            key={job.id}
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-auto min-h-8 justify-start gap-1.5 whitespace-normal text-left"
                            disabled={attachProject.isPending}
                            onClick={() => attachProject.mutate({
                              projectName: row.projectName,
                              contactName: row.contactName,
                              jobId: job.id,
                            })}
                          >
                            <Link2 className="h-3.5 w-3.5 shrink-0" />
                            <span>
                              Attach to {job.quoteNumber || `Job #${job.id}`} · {job.clientName}
                            </span>
                          </Button>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-2 text-xs text-amber-600">
                        No close job suggestion found. Search or rename the job/project mapping before re-importing.
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>Close</Button>
          <Button
            onClick={handleImport}
            disabled={!file || importing}
          >
            {importing ? (
              <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Importing...</>
            ) : (
              <><Upload className="h-4 w-4 mr-1" /> Import</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
