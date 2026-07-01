import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Activity,
  ChevronLeft,
  ChevronRight,
  Download,
  Filter,
  RefreshCw,
  Search,
  UserRound,
} from "lucide-react";

const PAGE_SIZE = 50;
const ALL_VALUE = "all";

const ACTION_LABELS: Record<string, string> = {
  login: "Login",
  create: "Create",
  update: "Update",
  delete: "Delete",
  archive: "Archive",
  send_email: "Email",
  send_sms: "SMS",
  send_push: "Push",
  upload_file: "Upload",
  status_change: "Status",
  approve: "Approve",
  submit: "Submit",
  export: "Export",
  permission_change: "Permission",
  mutation: "Mutation",
};

const ACTION_BADGES: Record<string, string> = {
  login: "border-sky-200 bg-sky-50 text-sky-700",
  export: "border-indigo-200 bg-indigo-50 text-indigo-700",
  upload_file: "border-emerald-200 bg-emerald-50 text-emerald-700",
  delete: "border-red-200 bg-red-50 text-red-700",
  archive: "border-amber-200 bg-amber-50 text-amber-800",
  permission_change: "border-purple-200 bg-purple-50 text-purple-700",
  send_email: "border-blue-200 bg-blue-50 text-blue-700",
  send_sms: "border-blue-200 bg-blue-50 text-blue-700",
  send_push: "border-blue-200 bg-blue-50 text-blue-700",
};

function actionLabel(action?: string | null) {
  return ACTION_LABELS[action || ""] || (action || "Activity").replace(/_/g, " ");
}

function formatDate(value: string | Date) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "—";
  return date.toLocaleString("en-AU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function metadataSummary(metadata: unknown) {
  if (!metadata || typeof metadata !== "object") return null;
  const data = metadata as Record<string, unknown>;
  return [data.filename, data.source, data.clientPath]
    .filter(Boolean)
    .map(String)
    .join(" · ") || null;
}

function detailsText(entry: any) {
  const pieces = [
    entry.entityType && `Entity: ${entry.entityType}${entry.entityId ? ` #${entry.entityId}` : ""}`,
    entry.requestPath && `Path: ${entry.requestPath}`,
    metadataSummary(entry.metadata),
  ].filter(Boolean);
  return pieces.join(" · ");
}

export default function AdminActivityLog() {
  const [offset, setOffset] = useState(0);
  const [search, setSearch] = useState("");
  const [action, setAction] = useState(ALL_VALUE);
  const [actorType, setActorType] = useState(ALL_VALUE);
  const [status, setStatus] = useState(ALL_VALUE);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const queryInput = useMemo(() => ({
    limit: PAGE_SIZE,
    offset,
    search: search.trim() || undefined,
    action: action === ALL_VALUE ? undefined : action as any,
    actorType: actorType === ALL_VALUE ? undefined : actorType as any,
    status: status === ALL_VALUE ? undefined : status as any,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
  }), [action, actorType, dateFrom, dateTo, offset, search, status]);

  const { data, isLoading, isFetching, refetch } = trpc.userActivity.list.useQuery(queryInput, {
    placeholderData: (previous) => previous,
  });

  const entries = data?.entries ?? [];
  const total = data?.total ?? 0;
  const actions = data?.actions ?? Object.keys(ACTION_LABELS);
  const page = Math.floor(offset / PAGE_SIZE) + 1;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const resetToFirstPage = () => setOffset(0);

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Activity className="h-6 w-6" />
            Activity Log
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Tenant-scoped audit trail for logins, changes, messages, uploads, exports, approvals, and client-side downloads.
          </p>
        </div>
        <Button variant="outline" onClick={() => refetch()} className="w-full gap-2 sm:w-auto">
          <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Filter className="h-4 w-4" />
            Filters
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(240px,1.4fr)_repeat(5,minmax(150px,1fr))]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  resetToFirstPage();
                }}
                placeholder="Search user, event, entity, path..."
                className="pl-9"
              />
            </div>

            <Select value={action} onValueChange={(value) => { setAction(value); resetToFirstPage(); }}>
              <SelectTrigger><SelectValue placeholder="Action" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_VALUE}>All actions</SelectItem>
                {actions.map((item) => (
                  <SelectItem key={item} value={item}>{actionLabel(item)}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={actorType} onValueChange={(value) => { setActorType(value); resetToFirstPage(); }}>
              <SelectTrigger><SelectValue placeholder="Actor" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_VALUE}>All actors</SelectItem>
                <SelectItem value="user">Users</SelectItem>
                <SelectItem value="client">Clients</SelectItem>
                <SelectItem value="trade">Trades</SelectItem>
                <SelectItem value="system">System</SelectItem>
              </SelectContent>
            </Select>

            <Select value={status} onValueChange={(value) => { setStatus(value); resetToFirstPage(); }}>
              <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_VALUE}>All statuses</SelectItem>
                <SelectItem value="success">Success</SelectItem>
                <SelectItem value="failure">Failure</SelectItem>
              </SelectContent>
            </Select>

            <Input
              type="date"
              value={dateFrom}
              onChange={(event) => {
                setDateFrom(event.target.value);
                resetToFirstPage();
              }}
            />
            <Input
              type="date"
              value={dateTo}
              onChange={(event) => {
                setDateTo(event.target.value);
                resetToFirstPage();
              }}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex flex-col gap-1 text-base sm:flex-row sm:items-center sm:justify-between">
            <span>Recent Activity</span>
            <span className="text-sm font-normal text-muted-foreground">
              {total === 0 ? "No entries" : `Showing ${offset + 1}-${Math.min(offset + entries.length, total)} of ${total}`}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 6 }).map((_, index) => (
                <Skeleton key={index} className="h-16 w-full" />
              ))}
            </div>
          ) : entries.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">
              <Activity className="mx-auto mb-3 h-10 w-10 opacity-40" />
              <p>No activity entries match the selected filters.</p>
            </div>
          ) : (
            <>
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full min-w-[980px] text-sm">
                  <thead>
                    <tr className="border-b text-left">
                      <th className="pb-2 pr-3 font-medium">Time</th>
                      <th className="pb-2 pr-3 font-medium">User</th>
                      <th className="pb-2 pr-3 font-medium">Action</th>
                      <th className="pb-2 pr-3 font-medium">Event</th>
                      <th className="pb-2 pr-3 font-medium">Entity</th>
                      <th className="pb-2 pr-3 font-medium">Details</th>
                      <th className="pb-2 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entries.map((entry: any) => (
                      <tr key={entry.id} className="border-b last:border-0 hover:bg-muted/40">
                        <td className="whitespace-nowrap py-3 pr-3 text-xs text-muted-foreground">{formatDate(entry.createdAt)}</td>
                        <td className="py-3 pr-3">
                          <div className="max-w-[180px] truncate font-medium">{entry.userName || entry.userEmail || entry.actorType}</div>
                          {entry.impersonatorName && (
                            <div className="text-xs text-amber-700">as {entry.impersonatorName}</div>
                          )}
                        </td>
                        <td className="py-3 pr-3">
                          <Badge variant="outline" className={`capitalize ${ACTION_BADGES[entry.action] || ""}`}>
                            {actionLabel(entry.action)}
                          </Badge>
                        </td>
                        <td className="py-3 pr-3">
                          <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{entry.eventName}</code>
                        </td>
                        <td className="py-3 pr-3 text-xs">
                          {entry.entityType ? (
                            <span>{entry.entityType}{entry.entityId ? ` #${entry.entityId}` : ""}</span>
                          ) : "—"}
                        </td>
                        <td className="max-w-[280px] py-3 pr-3 text-xs text-muted-foreground">
                          <span className="line-clamp-2">{detailsText(entry) || "—"}</span>
                        </td>
                        <td className="py-3">
                          <Badge variant={entry.status === "failure" ? "destructive" : "secondary"}>{entry.status}</Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="space-y-3 md:hidden">
                {entries.map((entry: any) => (
                  <div key={entry.id} className="rounded-lg border bg-card p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          {entry.action === "export" ? <Download className="h-4 w-4 text-indigo-600" /> : <UserRound className="h-4 w-4 text-muted-foreground" />}
                          <p className="truncate text-sm font-semibold">{entry.userName || entry.userEmail || entry.actorType}</p>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">{formatDate(entry.createdAt)}</p>
                      </div>
                      <Badge variant="outline" className={`shrink-0 capitalize ${ACTION_BADGES[entry.action] || ""}`}>
                        {actionLabel(entry.action)}
                      </Badge>
                    </div>
                    <div className="mt-3 space-y-1 text-xs">
                      <p className="font-mono text-foreground">{entry.eventName}</p>
                      {detailsText(entry) && <p className="text-muted-foreground">{detailsText(entry)}</p>}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {total > PAGE_SIZE && (
            <div className="mt-4 flex flex-col gap-3 border-t pt-3 sm:flex-row sm:items-center sm:justify-between">
              <span className="text-xs text-muted-foreground">Page {page} of {totalPages}</span>
              <div className="grid grid-cols-2 gap-2 sm:flex">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={offset === 0}
                  onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
                >
                  <ChevronLeft className="h-4 w-4" />
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={offset + PAGE_SIZE >= total}
                  onClick={() => setOffset(offset + PAGE_SIZE)}
                >
                  Next
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
