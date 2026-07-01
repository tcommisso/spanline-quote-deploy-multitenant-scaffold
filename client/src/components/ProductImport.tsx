import { useState, useCallback, useRef, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Upload, Download, FileSpreadsheet, CheckCircle2, XCircle, AlertTriangle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { logClientDownload } from "@/lib/userActivity";

// CSV column definitions matching the products table (with cost breakdown)
const CSV_HEADERS = ["productCode", "tabName", "subTab", "name", "uom", "baseCost", "materials", "installLabour", "consumables", "markupCategory", "fixedSell", "powderCoatSurcharge", "colourGroup", "coverageWidth", "sortOrder", "active"] as const;
const REQUIRED_COLUMNS = ["tabName", "name", "uom"];

type ParsedRow = {
  productCode: string | null;
  tabName: string;
  subTab: string | null;
  name: string;
  uom: string;
  baseCost: string;
  materials: string;
  installLabour: string;
  consumables: string;
  markupCategory: string | null;
  fixedSell: string | null;
  powderCoatSurcharge: string;
  colourGroup: string | null;
  coverageWidth: number | null;
  sortOrder: number;
  active: boolean;
};

type ValidationResult = {
  row: number;
  data: ParsedRow;
  status: "valid" | "warning" | "error";
  messages: string[];
};

function parseCSV(text: string): string[][] {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  return lines.map(line => {
    const result: string[] = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (inQuotes) {
        if (char === '"' && line[i + 1] === '"') {
          current += '"';
          i++;
        } else if (char === '"') {
          inQuotes = false;
        } else {
          current += char;
        }
      } else {
        if (char === '"') {
          inQuotes = true;
        } else if (char === ",") {
          result.push(current.trim());
          current = "";
        } else {
          current += char;
        }
      }
    }
    result.push(current.trim());
    return result;
  });
}

function validateRows(rows: string[][], headers: string[], validTabs: string[], validUoms: string[]): ValidationResult[] {
  const results: ValidationResult[] = [];

  // Map CSV headers to expected columns
  const colMap: Record<string, number> = {};
  for (const expected of CSV_HEADERS) {
    const idx = headers.findIndex(h => h.toLowerCase().replace(/\s+/g, "") === expected.toLowerCase());
    if (idx >= 0) colMap[expected] = idx;
  }

  // Track seen entries for duplicate detection (tabName + name as key)
  const seen = new Map<string, number>(); // key -> first row number

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const messages: string[] = [];
    let status: "valid" | "warning" | "error" = "valid";

    const productCode = colMap["productCode"] !== undefined ? (row[colMap["productCode"]] || "").trim() || null : null;
    const subTab = colMap["subTab"] !== undefined ? (row[colMap["subTab"]] || "").trim() || null : null;
    const tabName = (row[colMap["tabName"]] || "").trim();
    const name = (row[colMap["name"]] || "").trim();
    const uom = (row[colMap["uom"]] || "m").trim();
    const baseCostStr = (row[colMap["baseCost"]] || "0").trim();
    const materialsStr = colMap["materials"] !== undefined ? (row[colMap["materials"]] || "0").trim() : "0";
    const installLabourStr = colMap["installLabour"] !== undefined ? (row[colMap["installLabour"]] || "0").trim() : "0";
    const consumablesStr = colMap["consumables"] !== undefined ? (row[colMap["consumables"]] || "0").trim() : "0";
    const markupCategory = colMap["markupCategory"] !== undefined ? (row[colMap["markupCategory"]] || "").trim() || null : null;
    const fixedSell = colMap["fixedSell"] !== undefined ? (row[colMap["fixedSell"]] || "").trim() || null : null;
    const pcSurcharge = colMap["powderCoatSurcharge"] !== undefined ? (row[colMap["powderCoatSurcharge"]] || "0").trim() : "0";
    const colourGroup = colMap["colourGroup"] !== undefined ? (row[colMap["colourGroup"]] || "").trim() || null : null;
    const coverageWidthStr = colMap["coverageWidth"] !== undefined ? (row[colMap["coverageWidth"]] || "").trim() : "";
    const sortOrderStr = colMap["sortOrder"] !== undefined ? (row[colMap["sortOrder"]] || "0").trim() : "0";
    const activeStr = colMap["active"] !== undefined ? (row[colMap["active"]] || "true").trim().toLowerCase() : "true";

    // Validate required fields
    if (!tabName) { messages.push("Missing tabName"); status = "error"; }
    if (!name) { messages.push("Missing name"); status = "error"; }
    // baseCost is auto-computed from breakdown fields on the server, so it's not required if breakdown is provided
    const hasBreakdownCols = colMap["materials"] !== undefined || colMap["installLabour"] !== undefined || colMap["consumables"] !== undefined;
    if ((!baseCostStr || isNaN(parseFloat(baseCostStr))) && !hasBreakdownCols) { messages.push("Invalid baseCost (provide baseCost or breakdown fields)"); status = "error"; }

    // Validate tabName against master data
    if (tabName && validTabs.length > 0 && !validTabs.includes(tabName)) {
      messages.push(`Unknown tab "${tabName}", expected: ${validTabs.join(", ")}`);
      status = "error";
    }

    // Validate UoM against master data
    if (uom && validUoms.length > 0 && !validUoms.includes(uom)) {
      messages.push(`Unknown UoM "${uom}", expected: ${validUoms.join(", ")}`);
      if (status !== "error") status = "warning";
    }

    // Duplicate detection: check if same tabName + name already appeared in this CSV
    if (tabName && name) {
      const dupeKey = `${tabName.toLowerCase()}||${name.toLowerCase()}`;
      if (seen.has(dupeKey)) {
        messages.push(`Duplicate of row ${seen.get(dupeKey)!} (same tab + name)`);
        if (status !== "error") status = "warning";
      } else {
        seen.set(dupeKey, i + 1);
      }
    }

    // Validate numeric fields
    if (fixedSell && isNaN(parseFloat(fixedSell))) {
      messages.push("Invalid fixedSell value");
      status = "error";
    }
    if (pcSurcharge && pcSurcharge !== "0" && isNaN(parseFloat(pcSurcharge))) {
      messages.push("Invalid powderCoatSurcharge");
      status = "error";
    }

    const baseCost = parseFloat(baseCostStr) || 0;
    const materials = parseFloat(materialsStr) || 0;
    const installLabour = parseFloat(installLabourStr) || 0;
    const consumables = parseFloat(consumablesStr) || 0;

    // Validate no negative cost values
    if (materials < 0 || installLabour < 0 || consumables < 0) {
      messages.push("Negative cost values not allowed");
      status = "error";
    }
    if (baseCost < 0) {
      messages.push("Negative baseCost not allowed");
      status = "error";
    }

    const breakdownSum = materials + installLabour + consumables;
    if (baseCost <= 0 && breakdownSum <= 0 && status !== "error") {
      messages.push("No cost data (baseCost and breakdown fields are all zero)");
      status = "warning";
    }

    if (messages.length === 0) messages.push("OK");

    results.push({
      row: i + 1,
      data: {
        productCode,
        tabName,
        subTab,
        name,
        uom: (validUoms.length === 0 || validUoms.includes(uom)) ? uom : "ea",
        baseCost: baseCost.toFixed(2),
        materials: materials.toFixed(2),
        installLabour: installLabour.toFixed(2),
        consumables: consumables.toFixed(2),
        markupCategory,
        fixedSell: fixedSell ? parseFloat(fixedSell).toFixed(2) : null,
        powderCoatSurcharge: parseFloat(pcSurcharge || "0").toFixed(2),
        colourGroup,
        coverageWidth: coverageWidthStr ? (parseInt(coverageWidthStr) || null) : null,
        sortOrder: parseInt(sortOrderStr) || 0,
        active: activeStr !== "false" && activeStr !== "0",
      },
      status,
      messages,
    });
  }

  return results;
}

export default function ProductImport() {
  const utils = trpc.useUtils();
  const [dragOver, setDragOver] = useState(false);
  const [parsed, setParsed] = useState<ValidationResult[] | null>(null);
  const [fileName, setFileName] = useState("");
  const [showConfirm, setShowConfirm] = useState(false);
  const [importResult, setImportResult] = useState<{ inserted: number; updated: number; errors: Array<{ row: number; message: string }> } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: exportData } = trpc.products.exportCsv.useQuery();
  const { data: tabsAndUoms } = trpc.products.getTabsAndUoms.useQuery();

  // Derive valid tabs and UoMs from master data
  const validTabs = useMemo(() => tabsAndUoms?.tabs?.map(t => t.key) || [], [tabsAndUoms]);
  const validUoms = useMemo(() => tabsAndUoms?.uoms?.map(u => u.key) || [], [tabsAndUoms]);
  const bulkImportMutation = trpc.products.bulkImport.useMutation({
    onSuccess: (result) => {
      setImportResult(result);
      utils.products.getAll.invalidate();
      utils.products.getByTab.invalidate();
      utils.products.getRatesForTab.invalidate();
      if (result.errors.length === 0) {
        toast.success(`Import complete: ${result.inserted} inserted, ${result.updated} updated`);
      } else {
        toast.warning(`Import complete with ${result.errors.length} errors`);
      }
    },
    onError: (err) => toast.error(`Import failed: ${err.message}`),
  });

  const handleFile = useCallback((file: File) => {
    if (!file.name.endsWith(".csv")) {
      toast.error("Please upload a CSV file");
      return;
    }
    setFileName(file.name);
    setImportResult(null);

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const allRows = parseCSV(text);
      if (allRows.length < 2) {
        toast.error("CSV must have a header row and at least one data row");
        return;
      }
      const headers = allRows[0];
      const dataRows = allRows.slice(1);

      // Check required headers exist
      const missingHeaders = REQUIRED_COLUMNS.filter(
        col => !headers.some(h => h.toLowerCase().replace(/\s+/g, "") === col.toLowerCase())
      );
      if (missingHeaders.length > 0) {
        toast.error(`Missing required columns: ${missingHeaders.join(", ")}`);
        return;
      }

      const results = validateRows(dataRows, headers, validTabs, validUoms);
      setParsed(results);
    };
    reader.readAsText(file);
  }, [validTabs, validUoms]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => setDragOver(false), []);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    if (e.target) e.target.value = "";
  }, [handleFile]);

  const downloadTemplate = useCallback(() => {
    const csvContent = exportData?.csv || CSV_HEADERS.join(",");
    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "altaspan_products.csv";
    a.click();
    URL.revokeObjectURL(url);
    logClientDownload({
      filename: "altaspan_products.csv",
      source: "product_import_template",
      entityType: "product",
      mimeType: "text/csv",
    });
  }, [exportData]);

  const executeImport = useCallback(() => {
    if (!parsed) return;
    const validRows = parsed.filter(r => r.status !== "error").map(r => r.data);
    if (validRows.length === 0) {
      toast.error("No valid rows to import");
      return;
    }
    bulkImportMutation.mutate({ rows: validRows });
    setShowConfirm(false);
  }, [parsed, bulkImportMutation]);

  const validCount = parsed?.filter(r => r.status === "valid").length ?? 0;
  const warningCount = parsed?.filter(r => r.status === "warning").length ?? 0;
  const errorCount = parsed?.filter(r => r.status === "error").length ?? 0;
  const duplicateCount = parsed?.filter(r => r.messages.some(m => m.startsWith("Duplicate of row"))).length ?? 0;

  return (
    <div className="space-y-6">
      {/* Upload Area */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-sm font-medium">Product CSV Import</CardTitle>
              <CardDescription className="text-xs mt-1">
                Upload a CSV file to bulk-update product rates. Existing products are matched by Tab Name + Product Name.
              </CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={downloadTemplate} className="h-8 text-xs gap-1.5">
              <Download className="h-3.5 w-3.5" /> Download Current Data
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onClick={() => fileInputRef.current?.click()}
            className={`
              relative border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-all duration-200
              ${dragOver
                ? "border-primary bg-primary/5 scale-[1.01]"
                : "border-border hover:border-primary/50 hover:bg-muted/30"
              }
            `}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              onChange={handleFileInput}
              className="hidden"
            />
            <div className="flex flex-col items-center gap-3">
              <div className={`p-3 rounded-full transition-colors ${dragOver ? "bg-primary/10" : "bg-muted"}`}>
                <Upload className={`h-6 w-6 ${dragOver ? "text-primary" : "text-muted-foreground"}`} />
              </div>
              <div>
                <p className="text-sm font-medium">
                  {dragOver ? "Drop your CSV file here" : "Drag & drop a CSV file, or click to browse"}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Required columns: tabName, name, uom, baseCost
                </p>
              </div>
            </div>
          </div>

          {/* Column reference */}
          <div className="mt-4 p-3 bg-muted/30 rounded-lg">
            <p className="text-xs font-medium text-muted-foreground mb-2">CSV Column Reference</p>
            <div className="grid grid-cols-3 gap-x-6 gap-y-1 text-xs">
              <div><span className="font-mono text-primary">productCode</span> <span className="text-muted-foreground">— Product code (optional)</span></div>
              <div><span className="font-mono text-primary">tabName</span> <span className="text-muted-foreground">— {validTabs.length > 0 ? validTabs.join(", ") : "(loading...)"}</span></div>
              <div><span className="font-mono text-primary">subTab</span> <span className="text-muted-foreground">— Sub-tab name (optional)</span></div>
              <div><span className="font-mono text-primary">name</span> <span className="text-muted-foreground">— Product name</span></div>
              <div><span className="font-mono text-primary">uom</span> <span className="text-muted-foreground">— {validUoms.length > 0 ? validUoms.join(", ") : "(loading...)"}</span></div>
              <div><span className="font-mono text-primary">baseCost</span> <span className="text-muted-foreground">— Total cost (auto-computed if breakdown provided)</span></div>
              <div><span className="font-mono text-primary">materials</span> <span className="text-muted-foreground">— Material cost ($)</span></div>
              <div><span className="font-mono text-primary">installLabour</span> <span className="text-muted-foreground">— Install labour ($)</span></div>
              <div><span className="font-mono text-primary">consumables</span> <span className="text-muted-foreground">— Consumables ($)</span></div>
              <div><span className="font-mono text-primary">markupCategory</span> <span className="text-muted-foreground">— e.g. product_roof</span></div>
              <div><span className="font-mono text-primary">fixedSell</span> <span className="text-muted-foreground">— Override sell price</span></div>
              <div><span className="font-mono text-primary">powderCoatSurcharge</span> <span className="text-muted-foreground">— PC surcharge ($)</span></div>
              <div><span className="font-mono text-primary">sortOrder</span> <span className="text-muted-foreground">— Display order (0-99)</span></div>
              <div><span className="font-mono text-primary">active</span> <span className="text-muted-foreground">— true/false</span></div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Preview Table */}
      {parsed && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <FileSpreadsheet className="h-4 w-4 text-muted-foreground" />
                <div>
                  <CardTitle className="text-sm font-medium">{fileName}</CardTitle>
                  <CardDescription className="text-xs mt-0.5">{parsed.length} rows parsed</CardDescription>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-4 text-xs">
                  <span className="flex items-center gap-1">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> {validCount} valid
                  </span>
                  {warningCount > 0 && (
                    <span className="flex items-center gap-1">
                      <AlertTriangle className="h-3.5 w-3.5 text-amber-500" /> {warningCount} warnings
                    </span>
                  )}
                  {errorCount > 0 && (
                    <span className="flex items-center gap-1">
                      <XCircle className="h-3.5 w-3.5 text-red-500" /> {errorCount} errors
                    </span>
                  )}
                  {duplicateCount > 0 && (
                    <span className="flex items-center gap-1 text-amber-600">
                      ⚠ {duplicateCount} duplicates
                    </span>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => { setParsed(null); setFileName(""); setImportResult(null); }} className="h-7 text-xs">
                    Clear
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => setShowConfirm(true)}
                    disabled={validCount + warningCount === 0 || bulkImportMutation.isPending}
                    className="h-7 text-xs gap-1.5"
                  >
                    {bulkImportMutation.isPending ? (
                      <><Loader2 className="h-3 w-3 animate-spin" /> Importing...</>
                    ) : (
                      <><Upload className="h-3 w-3" /> Import {validCount + warningCount} Rows</>
                    )}
                  </Button>
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="max-h-[400px] overflow-auto rounded-md border">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-muted/80 backdrop-blur-sm">
                  <tr>
                    <th className="text-left py-2 px-3 font-medium text-muted-foreground w-10">#</th>
                    <th className="text-left py-2 px-3 font-medium text-muted-foreground w-12">Status</th>
                    <th className="text-left py-2 px-3 font-medium text-muted-foreground">Tab</th>
                    <th className="text-left py-2 px-3 font-medium text-muted-foreground">Product Name</th>
                    <th className="text-left py-2 px-3 font-medium text-muted-foreground w-12">UoM</th>
                    <th className="text-right py-2 px-3 font-medium text-muted-foreground w-16">Matl</th>
                    <th className="text-right py-2 px-3 font-medium text-muted-foreground w-16">Install</th>
                    <th className="text-right py-2 px-3 font-medium text-muted-foreground w-16">Consum.</th>
                    <th className="text-right py-2 px-3 font-medium text-muted-foreground w-20">Cost Amt</th>
                    <th className="text-left py-2 px-3 font-medium text-muted-foreground">Markup</th>
                    <th className="text-left py-2 px-3 font-medium text-muted-foreground">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {parsed.map((r) => (
                    <tr
                      key={r.row}
                      className={`border-b border-border/20 ${
                        r.status === "error" ? "bg-red-50 dark:bg-red-950/20" :
                        r.status === "warning" ? "bg-amber-50 dark:bg-amber-950/20" : ""
                      }`}
                    >
                      <td className="py-1.5 px-3 text-muted-foreground">{r.row}</td>
                      <td className="py-1.5 px-3">
                        {r.status === "valid" && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />}
                        {r.status === "warning" && <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />}
                        {r.status === "error" && <XCircle className="h-3.5 w-3.5 text-red-500" />}
                      </td>
                      <td className="py-1.5 px-3">
                        <Badge variant="outline" className="text-[10px] font-normal">{r.data.tabName}</Badge>
                      </td>
                      <td className="py-1.5 px-3 font-medium">{r.data.name}</td>
                      <td className="py-1.5 px-3 text-muted-foreground">{r.data.uom}</td>
                      <td className="py-1.5 px-3 text-right font-mono text-muted-foreground">{parseFloat(r.data.materials) > 0 ? `$${r.data.materials}` : "—"}</td>
                      <td className="py-1.5 px-3 text-right font-mono text-muted-foreground">{parseFloat(r.data.installLabour) > 0 ? `$${r.data.installLabour}` : "—"}</td>
                      <td className="py-1.5 px-3 text-right font-mono text-muted-foreground">{parseFloat(r.data.consumables) > 0 ? `$${r.data.consumables}` : "—"}</td>
                      <td className="py-1.5 px-3 text-right font-mono font-medium">${r.data.baseCost}</td>
                      <td className="py-1.5 px-3 text-muted-foreground">{r.data.markupCategory || "—"}</td>
                      <td className="py-1.5 px-3">
                        {r.messages.filter(m => m !== "OK").map((m, i) => (
                          <span key={i} className={`text-[10px] ${r.status === "error" ? "text-red-600" : "text-amber-600"}`}>
                            {m}
                          </span>
                        ))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Import Result */}
      {importResult && (
        <Card className={importResult.errors.length > 0 ? "border-amber-300" : "border-emerald-300"}>
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              {importResult.errors.length === 0 ? (
                <CheckCircle2 className="h-5 w-5 text-emerald-500 mt-0.5" />
              ) : (
                <AlertTriangle className="h-5 w-5 text-amber-500 mt-0.5" />
              )}
              <div>
                <p className="text-sm font-medium">
                  Import Complete
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {importResult.inserted} new products inserted, {importResult.updated} existing products updated
                  {importResult.errors.length > 0 && `, ${importResult.errors.length} rows failed`}
                </p>
                {importResult.errors.length > 0 && (
                  <div className="mt-3 space-y-1">
                    {importResult.errors.map((err, i) => (
                      <p key={i} className="text-xs text-red-600">
                        Row {err.row}: {err.message}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Confirmation Dialog */}
      <AlertDialog open={showConfirm} onOpenChange={setShowConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Bulk Import</AlertDialogTitle>
            <AlertDialogDescription>
              This will import <strong>{validCount + warningCount}</strong> product rows.
              {warningCount > 0 && ` (${warningCount} with warnings)`}
              {errorCount > 0 && ` ${errorCount} rows with errors will be skipped.`}
              {duplicateCount > 0 && (<><br /><span className="text-amber-600 font-medium">{duplicateCount} duplicate rows detected</span> — only the last occurrence of each duplicate will take effect.</>)}
              <br /><br />
              Existing products matched by <strong>Tab Name + Product Name</strong> will be updated.
              New products will be inserted. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={executeImport}>
              Import {validCount + warningCount} Products
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
