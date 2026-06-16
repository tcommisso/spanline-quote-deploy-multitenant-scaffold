import { useState, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import {
  Upload, FileSpreadsheet, Loader2, CheckCircle2, AlertTriangle, Trash2,
} from "lucide-react";
import { toast } from "sonner";

export default function XeroCostImportDialog() {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const utils = trpc.useUtils();

  const importMutation = trpc.xeroCostImport.importCostReport.useMutation({
    onSuccess: (data) => {
      setResult(data);
      setImporting(false);
      toast.success(`Imported ${data.imported} cost items`);
      utils.xeroCostImport.getImportHistory.invalidate();
      utils.xeroCostImport.getJobCosts.invalidate();
      utils.xeroCostImport.getJobCostSummary.invalidate();
      utils.constructionFinancial.invalidate();
      utils.constructionClients.invalidate();
    },
    onError: (err) => {
      setImporting(false);
      toast.error(err.message || "Import failed");
    },
  });

  const importHistory = trpc.xeroCostImport.getImportHistory.useQuery(undefined, {
    enabled: open,
  });

  const deleteBatch = trpc.xeroCostImport.deleteBatch.useMutation({
    onSuccess: () => {
      toast.success("Import batch deleted");
      importHistory.refetch();
      utils.xeroCostImport.getJobCosts.invalidate();
      utils.xeroCostImport.getJobCostSummary.invalidate();
    },
    onError: (err) => toast.error(err.message),
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
          <Upload className="h-4 w-4 mr-1" /> Import Costs
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" />
            Import Xero Project Details Report
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
                  Drop your Xero Project Details report here or click to browse
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
              <li>Export the actual expenses view as CSV or Excel</li>
              <li>Upload the file here — only Expense rows with non-zero cost are imported</li>
            </ol>
            <p className="mt-2">
              <strong>Duplicate prevention:</strong> Re-uploading the same report skips already-imported items. Closed Xero projects update matching jobs to Completed.
            </p>
          </div>

          {/* Import Result */}
          {result && (
            <div className="bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-lg p-3 space-y-2">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <span className="text-sm font-medium text-green-700 dark:text-green-400">Import Complete</span>
              </div>
              <div className="grid grid-cols-3 md:grid-cols-5 gap-2 text-xs">
                <div>
                  <p className="text-muted-foreground">Imported</p>
                  <p className="font-semibold text-green-600">{result.imported}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Duplicates</p>
                  <p className="font-semibold text-amber-600">{result.duplicates}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Skipped</p>
                  <p className="font-semibold text-slate-600">{result.skipped}</p>
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
              {result.dateRange && (
                <p className="text-xs text-muted-foreground">Date range: {result.dateRange}</p>
              )}
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
              <p className="text-xs font-medium text-muted-foreground uppercase mb-2">Recent Imports</p>
              <div className="space-y-1.5">
                {importHistory.data?.slice(0, 5).map((batch) => (
                  <div key={batch.id} className="flex items-center justify-between p-2 rounded-lg bg-muted/50 text-xs">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{batch.filename}</p>
                      <p className="text-muted-foreground">
                        {new Date(batch.createdAt).toLocaleDateString("en-AU")} · {batch.importedRows} imported
                        {(batch.duplicateRows ?? 0) > 0 && ` · ${batch.duplicateRows} duplicates`}
                        {batch.dateRangeStart && batch.dateRangeEnd && ` · ${batch.dateRangeStart} to ${batch.dateRangeEnd}`}
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
                          if (confirm("Delete this import batch and all its cost items?")) {
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
