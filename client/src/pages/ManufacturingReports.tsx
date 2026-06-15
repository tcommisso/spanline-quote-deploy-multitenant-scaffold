import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BarChart3, CalendarDays, Clock, Package } from "lucide-react";

const STATUS_COLORS: Record<string, string> = {
  received: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  in_production: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  partially_complete: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
  completed: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  on_hold: "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300",
  cancelled: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
};

export default function ManufacturingReports() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <BarChart3 className="h-6 w-6" />
          Manufacturing Reports
        </h1>
        <p className="text-muted-foreground text-sm mt-1">Production analytics and reporting</p>
      </div>

      <Tabs defaultValue="schedule">
        <TabsList>
          <TabsTrigger value="schedule">Production Schedule</TabsTrigger>
          <TabsTrigger value="status">Jobs by Status</TabsTrigger>
          <TabsTrigger value="target">Jobs by Target Date</TabsTrigger>
          <TabsTrigger value="materials">Material Grouping</TabsTrigger>
        </TabsList>

        <TabsContent value="schedule" className="mt-4">
          <ProductionScheduleReport />
        </TabsContent>
        <TabsContent value="status" className="mt-4">
          <JobsByStatusReport />
        </TabsContent>
        <TabsContent value="target" className="mt-4">
          <JobsByTargetDateReport />
        </TabsContent>
        <TabsContent value="materials" className="mt-4">
          <MaterialGroupingReport />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ProductionScheduleReport() {
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - d.getDay()); // Start of week
    return d.toISOString().split("T")[0];
  });
  const [endDate, setEndDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + (6 - d.getDay())); // End of week
    return d.toISOString().split("T")[0];
  });
  const [branchId, setBranchId] = useState<string>("all");

  const { data: branches } = trpc.manufacturing.branches.useQuery();
  const { data: schedule } = trpc.manufacturing.reports.productionSchedule.useQuery({
    startDate,
    endDate,
    branchId: branchId !== "all" ? Number(branchId) : undefined,
  });

  // Group by date
  const byDate = useMemo(() => {
    const map: Record<string, any[]> = {};
    (schedule || []).forEach(item => {
      const key = new Date(item.scheduledDate).toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" });
      if (!map[key]) map[key] = [];
      map[key].push(item);
    });
    return map;
  }, [schedule]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <div>
          <label className="text-xs text-muted-foreground">Start</label>
          <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-[160px]" />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">End</label>
          <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-[160px]" />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Branch</label>
          <Select value={branchId} onValueChange={setBranchId}>
            <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Branches</SelectItem>
              {(branches || []).map(b => (
                <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {Object.keys(byDate).length === 0 ? (
        <p className="text-center py-8 text-muted-foreground">No scheduled items for this period</p>
      ) : (
        Object.entries(byDate).map(([date, items]) => (
          <div key={date} className="border rounded-lg overflow-hidden">
            <div className="bg-muted/50 px-4 py-2 font-medium text-sm flex items-center gap-2">
              <CalendarDays className="h-4 w-4" />
              {date}
              <Badge variant="secondary" className="ml-auto">{items.length} items</Badge>
            </div>
            <table className="w-full text-sm">
              <tbody className="divide-y">
                {items.map((item: any) => (
                  <tr key={item.id} className="hover:bg-muted/20">
                    <td className="px-4 py-2 font-medium">{item.title}</td>
                    <td className="px-4 py-2 text-xs">{item.branchName}</td>
                    <td className="px-4 py-2 text-xs">{item.orderNumber} - {item.clientName}</td>
                    <td className="px-4 py-2 text-xs">{item.assignedTo || "—"}</td>
                    <td className="px-4 py-2">
                      <Badge variant="secondary" className={`text-xs ${STATUS_COLORS[item.status] || ""}`}>
                        {item.status.replace(/_/g, " ")}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))
      )}
    </div>
  );
}

function JobsByStatusReport() {
  const { data: statusData } = trpc.manufacturing.reports.jobsByStatus.useQuery();

  const total = (statusData || []).reduce((sum, s) => sum + (s.count || 0), 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {(statusData || []).map(item => (
          <div key={item.status} className="bg-card border rounded-lg p-4">
            <Badge variant="secondary" className={`text-xs ${STATUS_COLORS[item.status] || ""}`}>
              {item.status.replace(/_/g, " ")}
            </Badge>
            <p className="text-2xl font-bold mt-2">{item.count}</p>
            <p className="text-xs text-muted-foreground">
              {total > 0 ? `${Math.round((item.count / total) * 100)}%` : "0%"}
            </p>
          </div>
        ))}
      </div>
      {(!statusData || statusData.length === 0) && (
        <p className="text-center py-8 text-muted-foreground">No orders to report</p>
      )}
    </div>
  );
}

function JobsByTargetDateReport() {
  const [startDate, setStartDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [endDate, setEndDate] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() + 1);
    return d.toISOString().split("T")[0];
  });

  const { data: jobs } = trpc.manufacturing.reports.jobsByTargetDate.useQuery({ startDate, endDate });

  return (
    <div className="space-y-4">
      <div className="flex gap-3">
        <div>
          <label className="text-xs text-muted-foreground">From</label>
          <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-[160px]" />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">To</label>
          <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-[160px]" />
        </div>
      </div>

      {!jobs?.length ? (
        <p className="text-center py-8 text-muted-foreground">No orders with target dates in this range</p>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left px-4 py-2 font-medium">Order #</th>
                <th className="text-left px-4 py-2 font-medium">Client</th>
                <th className="text-left px-4 py-2 font-medium">Status</th>
                <th className="text-left px-4 py-2 font-medium">Priority</th>
                <th className="text-left px-4 py-2 font-medium">Target Date</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {jobs.map(job => {
                const isOverdue = job.targetDate && new Date(job.targetDate) < new Date() && job.status !== "completed" && job.status !== "cancelled";
                return (
                  <tr key={job.id} className={`hover:bg-muted/20 ${isOverdue ? "bg-destructive/5" : ""}`}>
                    <td className="px-4 py-2 font-mono text-xs">{job.orderNumber}</td>
                    <td className="px-4 py-2">{job.clientName}</td>
                    <td className="px-4 py-2">
                      <Badge variant="secondary" className={`text-xs ${STATUS_COLORS[job.status] || ""}`}>
                        {job.status.replace(/_/g, " ")}
                      </Badge>
                    </td>
                    <td className="px-4 py-2 capitalize text-xs">{job.priority}</td>
                    <td className="px-4 py-2 text-xs">
                      {job.targetDate ? new Date(job.targetDate).toLocaleDateString() : "—"}
                      {isOverdue && <span className="ml-1 text-destructive font-medium">OVERDUE</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function MaterialGroupingReport() {
  const { data: grouped } = trpc.manufacturing.tasks.grouped.useQuery();

  // Group by category then colour
  const byCategory = useMemo(() => {
    const map: Record<string, any[]> = {};
    (grouped || []).forEach(item => {
      const cat = item.category || "Uncategorised";
      if (!map[cat]) map[cat] = [];
      map[cat].push(item);
    });
    return map;
  }, [grouped]);

  return (
    <div className="space-y-4">
      {Object.keys(byCategory).length === 0 ? (
        <p className="text-center py-8 text-muted-foreground">No material data available</p>
      ) : (
        Object.entries(byCategory).map(([category, items]) => (
          <div key={category} className="border rounded-lg overflow-hidden">
            <div className="bg-muted/50 px-4 py-2 font-medium text-sm flex items-center gap-2">
              <Package className="h-4 w-4" />
              {category}
              <Badge variant="secondary" className="ml-auto">{items.length} products</Badge>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">Product</th>
                  <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">Colour</th>
                  <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">Source</th>
                  <th className="text-center px-4 py-2 text-xs font-medium text-muted-foreground">Total Qty</th>
                  <th className="text-center px-4 py-2 text-xs font-medium text-muted-foreground">Pending</th>
                  <th className="text-center px-4 py-2 text-xs font-medium text-muted-foreground">Completed</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {items.map((item: any, idx: number) => (
                  <tr key={idx} className="hover:bg-muted/20">
                    <td className="px-4 py-2">
                      <div className="font-medium">{item.productName}</div>
                      {item.productCode && <div className="text-xs text-muted-foreground">{item.productCode}</div>}
                    </td>
                    <td className="px-4 py-2 text-xs">{item.colour || "—"}</td>
                    <td className="px-4 py-2">
                      <Badge variant="outline" className="text-xs">
                        {item.sourceType === "procure" ? "Procure" : "Manufacture"}
                      </Badge>
                    </td>
                    <td className="px-4 py-2 text-center font-medium">{item.totalQty}</td>
                    <td className="px-4 py-2 text-center text-amber-600">{item.pendingQty}</td>
                    <td className="px-4 py-2 text-center text-green-600">{item.completedQty}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))
      )}
    </div>
  );
}
