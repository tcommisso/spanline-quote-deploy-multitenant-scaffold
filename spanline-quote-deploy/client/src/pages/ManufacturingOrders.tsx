import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Link } from "wouter";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, ClipboardList, ExternalLink, ArrowUpDown } from "lucide-react";

const STATUS_OPTIONS = [
  { value: "all", label: "All Statuses" },
  { value: "received", label: "Received" },
  { value: "in_production", label: "In Production" },
  { value: "partially_complete", label: "Partially Complete" },
  { value: "completed", label: "Completed" },
  { value: "on_hold", label: "On Hold" },
  { value: "cancelled", label: "Cancelled" },
];

const STATUS_COLORS: Record<string, string> = {
  received: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  in_production: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  partially_complete: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
  completed: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  on_hold: "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300",
  cancelled: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
};

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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ClipboardList className="h-6 w-6" />
            Manufacturing Orders
          </h1>
          <p className="text-muted-foreground text-sm mt-1">Component orders received from Construction</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search orders..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map(opt => (
              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Orders Table */}
      <div className="border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Order #</th>
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
                <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">Loading...</td></tr>
              ) : !orders?.length ? (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">No manufacturing orders found</td></tr>
              ) : (
                orders.map(order => (
                  <tr key={order.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 font-mono text-xs">{order.orderNumber || `#${order.id}`}</td>
                    <td className="px-4 py-3">
                      <div>{order.clientName}</div>
                      {order.siteAddress && <div className="text-xs text-muted-foreground truncate max-w-[200px]">{order.siteAddress}</div>}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="secondary" className={STATUS_COLORS[order.status] || ""}>
                        {order.status.replace(/_/g, " ")}
                      </Badge>
                    </td>
                    <td className={`px-4 py-3 capitalize ${PRIORITY_COLORS[order.priority] || ""}`}>
                      {order.priority}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {order.targetDate ? new Date(order.targetDate).toLocaleDateString() : "—"}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {new Date(order.receivedAt).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3">
                      <Link href={`/manufacturing/orders/${order.id}`}>
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
