import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BarChart3, AlertTriangle, Trash2, DollarSign } from "lucide-react";

export default function InventoryReports() {
  const [branchFilter, setBranchFilter] = useState("all");
  const { data: branches } = trpc.manufacturing.branches.useQuery();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <BarChart3 className="h-6 w-6" /> Inventory Reports
          </h1>
          <p className="text-muted-foreground text-sm mt-1">Stock on hand, reorder alerts, and waste tracking</p>
        </div>
        <Select value={branchFilter} onValueChange={setBranchFilter}>
          <SelectTrigger className="w-[160px]"><SelectValue placeholder="Branch" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Branches</SelectItem>
            {branches?.map(b => <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <Tabs defaultValue="onhand">
        <TabsList>
          <TabsTrigger value="onhand">Stock On Hand</TabsTrigger>
          <TabsTrigger value="valuation">Valuation</TabsTrigger>
          <TabsTrigger value="reorder">Reorder Alerts</TabsTrigger>
          <TabsTrigger value="waste">Waste Report</TabsTrigger>
        </TabsList>

        <TabsContent value="onhand">
          <OnHandReport branchId={branchFilter !== "all" ? Number(branchFilter) : undefined} branches={branches || []} />
        </TabsContent>
        <TabsContent value="valuation">
          <ValuationReport branchId={branchFilter !== "all" ? Number(branchFilter) : undefined} branches={branches || []} />
        </TabsContent>
        <TabsContent value="reorder">
          <ReorderAlerts branchId={branchFilter !== "all" ? Number(branchFilter) : undefined} />
        </TabsContent>
        <TabsContent value="waste">
          <WasteReport branchId={branchFilter !== "all" ? Number(branchFilter) : undefined} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function OnHandReport({ branchId, branches }: { branchId?: number; branches: any[] }) {
  const { data: report, isLoading } = trpc.inventory.reports.onHandByCategory.useQuery({ branchId });

  if (isLoading) return <div className="text-center py-8 text-muted-foreground">Loading...</div>;
  if (!report?.length) return <div className="text-center py-8 text-muted-foreground">No stock items found</div>;

  // Group by category
  const grouped = report.reduce((acc: Record<string, any[]>, item: any) => {
    if (!acc[item.category]) acc[item.category] = [];
    acc[item.category].push(item);
    return acc;
  }, {});

  const totalValue = report.reduce((sum: number, r: any) => sum + (r.totalValue || 0), 0);

  return (
    <div className="space-y-4 mt-4">
      <div className="bg-muted/50 rounded-lg p-4 flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">Total Items</p>
          <p className="text-2xl font-bold">{report.length}</p>
        </div>
        <div>
          <p className="text-sm text-muted-foreground">Total Value</p>
          <p className="text-2xl font-bold">${totalValue.toLocaleString("en-AU", { minimumFractionDigits: 2 })}</p>
        </div>
        <div>
          <p className="text-sm text-muted-foreground">Below Reorder</p>
          <p className="text-2xl font-bold text-amber-600">{report.filter((r: any) => r.belowReorder).length}</p>
        </div>
      </div>

      {Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b)).map(([category, items]) => (
        <div key={category} className="border rounded-lg">
          <div className="bg-muted/30 px-3 py-2 font-semibold text-sm border-b">{category} ({(items as any[]).length} items)</div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-muted-foreground text-xs">
                <th className="text-left p-2">Code</th>
                <th className="text-left p-2">Name</th>
                <th className="text-left p-2">Branch</th>
                <th className="text-left p-2">Condition</th>
                <th className="text-right p-2">On Hand</th>
                <th className="text-right p-2">Reorder Qty</th>
                <th className="text-right p-2">Value</th>
              </tr>
            </thead>
            <tbody>
              {(items as any[]).map(item => (
                <tr key={item.id} className={`border-t ${item.belowReorder ? "bg-amber-50 dark:bg-amber-950/20" : ""}`}>
                  <td className="p-2 font-mono text-xs">{item.code}</td>
                  <td className="p-2">{item.name}</td>
                  <td className="p-2 text-muted-foreground text-xs">{branches.find(b => b.id === item.branchId)?.name || "-"}</td>
                  <td className="p-2">
                    <Badge variant={item.conditionIndicator === "new" ? "default" : item.conditionIndicator === "damaged" ? "destructive" : "secondary"} className="text-xs">
                      {item.conditionIndicator === "off_cut" ? "Off Cut" : item.conditionIndicator}
                    </Badge>
                  </td>
                  <td className="p-2 text-right font-semibold">
                    {item.onHand} {item.unitType === "lm" ? "LM" : item.unit}
                    {item.belowReorder && <AlertTriangle className="h-3 w-3 inline ml-1 text-amber-500" />}
                  </td>
                  <td className="p-2 text-right text-muted-foreground">{item.reorderQty ?? "-"}</td>
                  <td className="p-2 text-right">{item.totalValue != null ? `$${item.totalValue.toFixed(2)}` : "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}

function ReorderAlerts({ branchId }: { branchId?: number }) {
  const { data: alerts, isLoading } = trpc.inventory.reports.reorderAlerts.useQuery({ branchId });

  if (isLoading) return <div className="text-center py-8 text-muted-foreground">Loading...</div>;
  if (!alerts?.length) return (
    <div className="text-center py-12 text-muted-foreground mt-4">
      <AlertTriangle className="h-12 w-12 mx-auto mb-3 opacity-30" />
      <p>No reorder alerts — all items are above minimum levels</p>
    </div>
  );

  return (
    <div className="mt-4 border rounded-lg overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-amber-50 dark:bg-amber-950/20">
          <tr>
            <th className="text-left p-2 font-medium">Code</th>
            <th className="text-left p-2 font-medium">Name</th>
            <th className="text-left p-2 font-medium">Category</th>
            <th className="text-right p-2 font-medium">On Hand</th>
            <th className="text-right p-2 font-medium">Reorder Qty</th>
            <th className="text-right p-2 font-medium">Deficit</th>
          </tr>
        </thead>
        <tbody>
          {alerts.map((a: any) => (
            <tr key={a.id} className="border-t">
              <td className="p-2 font-mono text-xs">{a.code}</td>
              <td className="p-2 font-medium">{a.name}</td>
              <td className="p-2">{a.category}</td>
              <td className="p-2 text-right text-red-600 font-semibold">{a.onHand}</td>
              <td className="p-2 text-right">{a.reorderQty}</td>
              <td className="p-2 text-right font-bold text-red-700">{a.deficit}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ValuationReport({ branchId, branches }: { branchId?: number; branches: any[] }) {
  const { data, isLoading } = trpc.inventory.reports.valuation.useQuery({ branchId });

  if (isLoading) return <div className="text-center py-8 text-muted-foreground">Loading...</div>;
  if (!data?.items?.length) return (
    <div className="text-center py-12 text-muted-foreground mt-4">
      <DollarSign className="h-12 w-12 mx-auto mb-3 opacity-30" />
      <p>No inventory with value to report</p>
    </div>
  );

  const { items, summary } = data;

  return (
    <div className="space-y-4 mt-4">
      {/* Summary KPIs */}
      <div className="bg-muted/50 rounded-lg p-4 grid grid-cols-3 gap-4">
        <div>
          <p className="text-sm text-muted-foreground">Total Items with Stock</p>
          <p className="text-2xl font-bold">{summary.totalItems}</p>
        </div>
        <div>
          <p className="text-sm text-muted-foreground">Total Inventory Value</p>
          <p className="text-2xl font-bold text-green-700">${summary.totalValue.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
        </div>
        <div>
          <p className="text-sm text-muted-foreground">Categories</p>
          <p className="text-2xl font-bold">{summary.byCategory.length}</p>
        </div>
      </div>

      {/* Value by Category */}
      {summary.byCategory.length > 0 && (
        <div className="border rounded-lg">
          <div className="bg-muted/30 px-3 py-2 font-semibold text-sm border-b">Value by Category</div>
          <div className="p-3 space-y-2">
            {summary.byCategory.map((cat: any) => {
              const pct = summary.totalValue > 0 ? (cat.value / summary.totalValue) * 100 : 0;
              return (
                <div key={cat.category} className="flex items-center gap-3">
                  <span className="text-sm w-32 truncate">{cat.category}</span>
                  <div className="flex-1 bg-muted rounded-full h-4 overflow-hidden">
                    <div className="bg-green-600 h-full rounded-full" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="text-sm font-semibold w-28 text-right">${cat.value.toLocaleString("en-AU", { minimumFractionDigits: 2 })}</span>
                  <span className="text-xs text-muted-foreground w-12 text-right">{pct.toFixed(1)}%</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Value by Branch */}
      {summary.byBranch.length > 0 && (
        <div className="border rounded-lg">
          <div className="bg-muted/30 px-3 py-2 font-semibold text-sm border-b">Value by Branch</div>
          <div className="p-3 space-y-2">
            {summary.byBranch.map((br: any) => {
              const branchName = branches.find(b => b.id === br.branchId)?.name || `Branch ${br.branchId}`;
              const pct = summary.totalValue > 0 ? (br.value / summary.totalValue) * 100 : 0;
              return (
                <div key={br.branchId} className="flex items-center gap-3">
                  <span className="text-sm w-32 truncate">{branchName}</span>
                  <div className="flex-1 bg-muted rounded-full h-4 overflow-hidden">
                    <div className="bg-blue-600 h-full rounded-full" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="text-sm font-semibold w-28 text-right">${br.value.toLocaleString("en-AU", { minimumFractionDigits: 2 })}</span>
                  <span className="text-xs text-muted-foreground w-12 text-right">{pct.toFixed(1)}%</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Detail table */}
      <div className="border rounded-lg overflow-x-auto">
        <div className="bg-muted/30 px-3 py-2 font-semibold text-sm border-b">Item Detail</div>
        <table className="w-full text-sm">
          <thead className="bg-muted/20">
            <tr>
              <th className="text-left p-2 font-medium">Code</th>
              <th className="text-left p-2 font-medium">Name</th>
              <th className="text-left p-2 font-medium">Category</th>
              <th className="text-left p-2 font-medium">Branch</th>
              <th className="text-right p-2 font-medium">On Hand</th>
              <th className="text-right p-2 font-medium">Unit Cost</th>
              <th className="text-right p-2 font-medium">Total Value</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item: any) => (
              <tr key={item.id} className="border-t">
                <td className="p-2 font-mono text-xs">{item.code}</td>
                <td className="p-2">{item.name}</td>
                <td className="p-2 text-muted-foreground text-xs">{item.category}</td>
                <td className="p-2 text-muted-foreground text-xs">{branches.find(b => b.id === item.branchId)?.name || "-"}</td>
                <td className="p-2 text-right font-semibold">{item.onHand} {item.unitType === "lm" ? "LM" : item.unit}</td>
                <td className="p-2 text-right">${item.unitCost.toFixed(2)}</td>
                <td className="p-2 text-right font-semibold text-green-700">${item.totalValue.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function WasteReport({ branchId }: { branchId?: number }) {
  const { data: waste, isLoading } = trpc.inventory.reports.wasteReport.useQuery({ branchId });
  const { data: stockItems } = trpc.inventory.stockItems.list.useQuery({});

  if (isLoading) return <div className="text-center py-8 text-muted-foreground">Loading...</div>;
  if (!waste?.length) return (
    <div className="text-center py-12 text-muted-foreground mt-4">
      <Trash2 className="h-12 w-12 mx-auto mb-3 opacity-30" />
      <p>No waste adjustments recorded</p>
    </div>
  );

  const totalWaste = waste.reduce((sum: number, w: any) => sum + Number(w.quantity), 0);

  return (
    <div className="space-y-4 mt-4">
      <div className="bg-red-50 dark:bg-red-950/20 rounded-lg p-4">
        <p className="text-sm text-muted-foreground">Total Waste Adjustments</p>
        <p className="text-2xl font-bold text-red-700">{waste.length} entries ({totalWaste.toFixed(2)} units)</p>
      </div>
      <div className="border rounded-lg overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left p-2 font-medium">Date</th>
              <th className="text-left p-2 font-medium">Item</th>
              <th className="text-right p-2 font-medium">Qty</th>
              <th className="text-left p-2 font-medium">Unit</th>
              <th className="text-left p-2 font-medium">Notes</th>
              <th className="text-left p-2 font-medium">By</th>
            </tr>
          </thead>
          <tbody>
            {waste.map((w: any) => {
              const item = stockItems?.find(s => s.id === w.stockItemId);
              return (
                <tr key={w.id} className="border-t">
                  <td className="p-2 text-xs text-muted-foreground">{new Date(w.createdAt).toLocaleDateString()}</td>
                  <td className="p-2 font-medium">{item?.name || `#${w.stockItemId}`}</td>
                  <td className="p-2 text-right font-semibold text-red-600">{w.quantity}</td>
                  <td className="p-2 text-muted-foreground">{w.unitType === "lm" ? "LM" : "EA"}</td>
                  <td className="p-2 text-xs text-muted-foreground max-w-[200px] truncate">{w.notes || "-"}</td>
                  <td className="p-2 text-xs">{w.createdBy || "-"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
