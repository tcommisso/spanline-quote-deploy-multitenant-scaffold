import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Link } from "wouter";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, ClipboardList, ExternalLink, UploadCloud } from "lucide-react";

const STATUS_OPTIONS = [
  { value: "all", label: "All Statuses" },
  { value: "received", label: "Received" },
  { value: "submitted", label: "Flashing Submitted" },
  { value: "supplier_received", label: "Trade Portal Pending Review" },
  { value: "imported", label: "Uploaded" },
  { value: "in_review", label: "Upload Review" },
  { value: "accepted", label: "Upload Accepted" },
  { value: "in_production", label: "In Production" },
  { value: "partially_complete", label: "Partially Complete" },
  { value: "purchase_ordered", label: "Purchase Ordered" },
  { value: "ready", label: "Ready" },
  { value: "ready_for_dispatch", label: "Ready for Dispatch" },
  { value: "dispatched", label: "Dispatched" },
  { value: "completed", label: "Completed" },
  { value: "on_hold", label: "On Hold" },
  { value: "cancelled", label: "Cancelled" },
  { value: "archived", label: "Archived" },
];

const STATUS_LABELS = Object.fromEntries(STATUS_OPTIONS.map((option) => [option.value, option.label]));

const STATUS_COLORS: Record<string, string> = {
  received: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  submitted: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  supplier_received: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300",
  in_production: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  partially_complete: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
  purchase_ordered: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
  ready: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
  ready_for_dispatch: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
  dispatched: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  completed: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  on_hold: "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300",
  cancelled: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  imported: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  in_review: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  accepted: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
  archived: "bg-slate-100 text-slate-800 dark:bg-slate-900/30 dark:text-slate-300",
};

const SOURCE_COLORS: Record<string, string> = {
  component: "bg-slate-100 text-slate-800 dark:bg-slate-900/30 dark:text-slate-300",
  flashing: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-300",
  transition: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
};

function formatStatus(status: string) {
  return STATUS_LABELS[status] || status.replace(/_/g, " ");
}

function formatDate(value: string | Date | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString();
}

const PRIORITY_COLORS: Record<string, string> = {
  low: "text-muted-foreground",
  normal: "",
  high: "text-amber-600 dark:text-amber-400",
  urgent: "text-destructive font-semibold",
};

export default function ManufacturingOrders() {
  const [status, setStatus] = useState("all");
  const [search, setSearch] = useState("");

  const { data: orders, isLoading } = trpc.manufacturing.orders.list.useQuery({ status, search });

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ClipboardList className="h-6 w-6" />
            Manufacturing Orders
          </h1>
          <p className="text-muted-foreground text-sm mt-1">Component and flashing orders received for manufacturing</p>
        </div>
        <Link href="/manufacturing/transition-assistant">
          <Button variant="outline" className="w-full sm:w-auto">
            <UploadCloud className="mr-2 h-4 w-4" />
            Upload legacy order
          </Button>
        </Link>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 sm:max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search orders..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-full sm:w-[220px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map(opt => (
              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="md:hidden">
        {isLoading ? (
          <div className="rounded-lg border px-4 py-8 text-center text-sm text-muted-foreground">Loading...</div>
        ) : !orders?.length ? (
          <div className="rounded-lg border px-4 py-8 text-center text-sm text-muted-foreground">No manufacturing orders found</div>
        ) : (
          <div className="grid gap-3">
            {orders.map((order: any) => (
              <div key={`${order.sourceType}-${order.id}`} className="rounded-lg border bg-card p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-mono text-xs text-muted-foreground">{order.orderNumber || `#${order.id}`}</div>
                    <div className="mt-1 font-semibold leading-tight">{order.clientName}</div>
                    {order.siteAddress && <div className="mt-1 line-clamp-2 text-xs text-muted-foreground">{order.siteAddress}</div>}
                  </div>
                  <Badge variant="secondary" className={SOURCE_COLORS[order.sourceType] || ""}>
                    {order.sourceLabel || "Order"}
                  </Badge>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  <Badge variant="secondary" className={STATUS_COLORS[order.status] || ""}>
                    {formatStatus(order.status)}
                  </Badge>
                  <span className={`text-sm capitalize ${PRIORITY_COLORS[order.priority] || ""}`}>{order.priority}</span>
                  {order.sourceType === "flashing" && (
                    <span className="text-sm text-muted-foreground">
                      {order.lineCount || 0} lines · {Number(order.totalLinealMetres || 0).toFixed(2)} LM
                    </span>
                  )}
                  {order.sourceType === "transition" && (
                    <span className="text-sm text-muted-foreground">
                      {order.matchedLineCount || 0}/{order.lineCount || 0} matched
                    </span>
                  )}
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                  <div className="rounded-md bg-muted/40 p-2">
                    <div className="font-semibold text-foreground">{formatDate(order.targetDate)}</div>
                    Target
                  </div>
                  <div className="rounded-md bg-muted/40 p-2">
                    <div className="font-semibold text-foreground">{formatDate(order.receivedAt)}</div>
                    Received
                  </div>
                </div>

                <Link href={order.sourceHref || `/manufacturing/orders/${order.id}`}>
                  <Button variant="outline" className="mt-4 w-full">
                    Open order
                    <ExternalLink className="ml-2 h-4 w-4" />
                  </Button>
                </Link>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Orders Table */}
      <div className="hidden overflow-hidden rounded-lg border md:block">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Order #</th>
                <th className="text-left px-4 py-3 font-medium">Source</th>
                <th className="text-left px-4 py-3 font-medium">Client</th>
                <th className="text-left px-4 py-3 font-medium">Status</th>
                <th className="text-left px-4 py-3 font-medium">Priority</th>
                <th className="text-left px-4 py-3 font-medium">Target Date</th>
                <th className="text-left px-4 py-3 font-medium">Received</th>
                <th className="text-left px-4 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {isLoading ? (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">Loading...</td></tr>
              ) : !orders?.length ? (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">No manufacturing orders found</td></tr>
              ) : (
                orders.map((order: any) => (
                  <tr key={`${order.sourceType}-${order.id}`} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 font-mono text-xs">{order.orderNumber || `#${order.id}`}</td>
                    <td className="px-4 py-3">
                      <Badge variant="secondary" className={SOURCE_COLORS[order.sourceType] || ""}>
                        {order.sourceLabel || "Order"}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div>{order.clientName}</div>
                      {order.siteAddress && <div className="text-xs text-muted-foreground truncate max-w-[200px]">{order.siteAddress}</div>}
                      {order.sourceType === "flashing" && (
                        <div className="text-xs text-muted-foreground">
                          {order.lineCount || 0} lines · {Number(order.totalLinealMetres || 0).toFixed(2)} LM
                        </div>
                      )}
                      {order.sourceType === "transition" && (
                        <div className="text-xs text-muted-foreground">
                          {order.matchedLineCount || 0}/{order.lineCount || 0} matched
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="secondary" className={STATUS_COLORS[order.status] || ""}>
                        {formatStatus(order.status)}
                      </Badge>
                    </td>
                    <td className={`px-4 py-3 capitalize ${PRIORITY_COLORS[order.priority] || ""}`}>
                      {order.priority}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {formatDate(order.targetDate)}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {formatDate(order.receivedAt)}
                    </td>
                    <td className="px-4 py-3">
                      <Link href={order.sourceHref || `/manufacturing/orders/${order.id}`}>
                        <Button variant="ghost" size="sm">
                          <ExternalLink className="h-4 w-4" />
                        </Button>
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
