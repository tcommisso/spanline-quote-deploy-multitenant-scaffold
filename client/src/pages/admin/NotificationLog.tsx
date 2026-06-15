import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Bell, CheckCircle, XCircle, AlertTriangle, Trash2, RefreshCw } from "lucide-react";

export default function NotificationLog() {
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<"all" | "sent" | "suppressed" | "failed">("all");
  const [channelFilter, setChannelFilter] = useState<string>("");
  const [recipientTypeFilter, setRecipientTypeFilter] = useState<string>("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const { data, isLoading, refetch } = trpc.notificationLog.list.useQuery({
    page,
    pageSize: 50,
    status: statusFilter,
    channel: channelFilter || undefined,
    recipientType: recipientTypeFilter || undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
  });

  const { data: stats } = trpc.notificationLog.stats.useQuery();

  const clearOld = trpc.notificationLog.clearOld.useMutation({
    onSuccess: (result) => {
      toast.success(`Cleared ${result.deleted} old log entries`);
      refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const statusIcon = (status: string) => {
    switch (status) {
      case "sent": return <CheckCircle className="h-4 w-4 text-green-500" />;
      case "suppressed": return <AlertTriangle className="h-4 w-4 text-amber-500" />;
      case "failed": return <XCircle className="h-4 w-4 text-red-500" />;
      default: return <Bell className="h-4 w-4" />;
    }
  };

  const statusBadge = (status: string) => {
    const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
      sent: "default",
      suppressed: "secondary",
      failed: "destructive",
    };
    return <Badge variant={variants[status] || "outline"}>{status}</Badge>;
  };

  const totalPages = data ? Math.ceil(data.total / 50) : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Notification Log</h1>
          <p className="text-muted-foreground">Audit trail of all notification attempts</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4 mr-1" /> Refresh
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => clearOld.mutate({ olderThanDays: 90 })}
            disabled={clearOld.isPending}
          >
            <Trash2 className="h-4 w-4 mr-1" /> Clear 90d+
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-4 pb-4">
              <div className="text-2xl font-bold">{stats.total}</div>
              <div className="text-xs text-muted-foreground">Total</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-4">
              <div className="text-2xl font-bold text-green-600">{stats.sent}</div>
              <div className="text-xs text-muted-foreground">Sent</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-4">
              <div className="text-2xl font-bold text-amber-600">{stats.suppressed}</div>
              <div className="text-xs text-muted-foreground">Suppressed</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-4">
              <div className="text-2xl font-bold text-red-600">{stats.failed}</div>
              <div className="text-xs text-muted-foreground">Failed</div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filters */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v as any); setPage(1); }}>
              <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="sent">Sent</SelectItem>
                <SelectItem value="suppressed">Suppressed</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
              </SelectContent>
            </Select>

            <Select value={channelFilter || "all"} onValueChange={(v) => { setChannelFilter(v === "all" ? "" : v); setPage(1); }}>
              <SelectTrigger><SelectValue placeholder="Channel" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Channels</SelectItem>
                <SelectItem value="email">Email</SelectItem>
                <SelectItem value="sms">SMS</SelectItem>
                <SelectItem value="push">Push</SelectItem>
                <SelectItem value="owner_notify">Owner Notify</SelectItem>
                <SelectItem value="in_app">In-App</SelectItem>
              </SelectContent>
            </Select>

            <Select value={recipientTypeFilter || "all"} onValueChange={(v) => { setRecipientTypeFilter(v === "all" ? "" : v); setPage(1); }}>
              <SelectTrigger><SelectValue placeholder="Recipient" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Recipients</SelectItem>
                <SelectItem value="owner">Owner</SelectItem>
                <SelectItem value="user">User</SelectItem>
                <SelectItem value="client">Client</SelectItem>
                <SelectItem value="trade">Trade</SelectItem>
              </SelectContent>
            </Select>

            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
              placeholder="From"
            />
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
              placeholder="To"
            />
          </div>
        </CardContent>
      </Card>

      {/* Log Table */}
      <Card>
        <CardContent className="pt-4">
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading...</div>
          ) : !data?.entries.length ? (
            <div className="text-center py-8 text-muted-foreground">No notification log entries found</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="pb-2 pr-3 font-medium">Status</th>
                    <th className="pb-2 pr-3 font-medium">Title</th>
                    <th className="pb-2 pr-3 font-medium">Channel</th>
                    <th className="pb-2 pr-3 font-medium">Recipient</th>
                    <th className="pb-2 pr-3 font-medium">Setting Key</th>
                    <th className="pb-2 pr-3 font-medium">Reason</th>
                    <th className="pb-2 font-medium">Time</th>
                  </tr>
                </thead>
                <tbody>
                  {data.entries.map((entry) => (
                    <tr key={entry.id} className="border-b last:border-0 hover:bg-muted/50">
                      <td className="py-2 pr-3">
                        <div className="flex items-center gap-1.5">
                          {statusIcon(entry.status)}
                          {statusBadge(entry.status)}
                        </div>
                      </td>
                      <td className="py-2 pr-3 max-w-[200px] truncate" title={entry.title}>
                        {entry.title}
                      </td>
                      <td className="py-2 pr-3">
                        <Badge variant="outline" className="text-xs">{entry.channel}</Badge>
                      </td>
                      <td className="py-2 pr-3">
                        <span className="text-xs">{entry.recipientType}</span>
                        {entry.recipientId && (
                          <span className="text-xs text-muted-foreground ml-1">({entry.recipientId})</span>
                        )}
                      </td>
                      <td className="py-2 pr-3">
                        <code className="text-xs bg-muted px-1 py-0.5 rounded">{entry.settingKey || "—"}</code>
                      </td>
                      <td className="py-2 pr-3 text-xs text-muted-foreground">
                        {entry.suppressionReason || "—"}
                      </td>
                      <td className="py-2 text-xs text-muted-foreground whitespace-nowrap">
                        {new Date(entry.createdAt).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4 pt-3 border-t">
              <span className="text-sm text-muted-foreground">
                Page {page} of {totalPages} ({data?.total} entries)
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
