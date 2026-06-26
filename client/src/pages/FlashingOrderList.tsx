import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import { ArrowRight, CalendarDays, FileText, Plus, Search } from "lucide-react";
import { toast } from "sonner";

const PAGE_SIZE = 25;

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  submitted: "Submitted",
  supplier_received: "Supplier Received",
  in_production: "In Production",
  purchase_ordered: "Purchase Ordered",
  ready: "Ready",
  completed: "Completed",
  cancelled: "Cancelled",
  archived: "Archived",
};

const STATUS_CLASSES: Record<string, string> = {
  draft: "bg-slate-100 text-slate-700 border-slate-200",
  submitted: "bg-blue-100 text-blue-800 border-blue-200",
  supplier_received: "bg-indigo-100 text-indigo-800 border-indigo-200",
  in_production: "bg-amber-100 text-amber-800 border-amber-200",
  purchase_ordered: "bg-purple-100 text-purple-800 border-purple-200",
  ready: "bg-emerald-100 text-emerald-800 border-emerald-200",
  completed: "bg-green-100 text-green-800 border-green-200",
  cancelled: "bg-red-100 text-red-800 border-red-200",
  archived: "bg-zinc-100 text-zinc-700 border-zinc-200",
};

function formatDate(value?: string | Date | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-AU", { day: "2-digit", month: "short", year: "numeric" });
}

function formatCurrency(value: unknown) {
  return new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(Number(value || 0));
}

export default function FlashingOrderList() {
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [offset, setOffset] = useState(0);
  const [showNew, setShowNew] = useState(false);
  const [jobId, setJobId] = useState("");
  const [manualClient, setManualClient] = useState("");
  const [manualAddress, setManualAddress] = useState("");
  const [siteNotes, setSiteNotes] = useState("");

  const ordersQuery = trpc.flashing.listOrders.useQuery({
    search,
    status: status as any || undefined,
    limit: PAGE_SIZE,
    offset,
  });
  const jobsQuery = trpc.flashing.jobsForSelect.useQuery({ search: "" });

  const createMutation = trpc.flashing.createOrder.useMutation({
    onSuccess: (result) => {
      toast.success(`Created ${result.orderNumber}`);
      utils.flashing.listOrders.invalidate();
      navigate(`/construction/flashing-orders/${result.id}`);
    },
    onError: (error) => toast.error(error.message),
  });

  const orders = ordersQuery.data?.orders || [];
  const total = ordersQuery.data?.total || 0;
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const selectedJob = useMemo(
    () => jobsQuery.data?.find((job) => String(job.id) === jobId),
    [jobId, jobsQuery.data],
  );

  const createOrder = () => {
    createMutation.mutate({
      jobId: jobId ? Number(jobId) : undefined,
      clientName: selectedJob?.clientName || manualClient || undefined,
      siteAddress: selectedJob?.siteAddress || manualAddress || undefined,
      siteNotes: siteNotes || undefined,
    });
  };

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <FileText className="h-6 w-6" />
            Flashing Orders
          </h1>
          <p className="text-sm text-muted-foreground">
            Design, specify, and manage custom flashing profiles for manufacturing or supplier orders.
          </p>
        </div>
        <Button onClick={() => setShowNew((value) => !value)}>
          <Plus className="h-4 w-4 mr-1.5" />
          New Flashing Order
        </Button>
      </div>

      {showNew && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Create Flashing Order</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
              <div className="space-y-1">
                <label className="text-sm font-medium">Construction Job</label>
                <select
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={jobId}
                  onChange={(event) => setJobId(event.target.value)}
                >
                  <option value="">Manual / not linked yet</option>
                  {jobsQuery.data?.map((job) => (
                    <option key={job.id} value={job.id}>
                      {job.jobNumber || `Job ${job.id}`} — {job.clientName}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">Client</label>
                <Input
                  value={selectedJob?.clientName || manualClient}
                  onChange={(event) => setManualClient(event.target.value)}
                  disabled={Boolean(selectedJob)}
                  placeholder="Client name"
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">Site Address</label>
                <Input
                  value={selectedJob?.siteAddress || manualAddress}
                  onChange={(event) => setManualAddress(event.target.value)}
                  disabled={Boolean(selectedJob)}
                  placeholder="Site address"
                />
              </div>
            </div>
            <Textarea
              value={siteNotes}
              onChange={(event) => setSiteNotes(event.target.value)}
              placeholder="Site notes, delivery notes, access requirements..."
            />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowNew(false)}>Cancel</Button>
              <Button onClick={createOrder} disabled={createMutation.isPending || (!selectedJob && !manualClient.trim())}>
                {createMutation.isPending ? <Spinner className="mr-2 h-4 w-4" /> : <Plus className="mr-2 h-4 w-4" />}
                Create Order
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="flex flex-col md:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-10"
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setOffset(0);
                }}
                placeholder="Search order, job, client, or site..."
              />
            </div>
            <select
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
              value={status}
              onChange={(event) => {
                setStatus(event.target.value);
                setOffset(0);
              }}
            >
              <option value="">All statuses</option>
              {Object.entries(STATUS_LABELS).map(([key, label]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
          </div>

          {ordersQuery.isLoading ? (
            <div className="flex justify-center py-16"><Spinner /></div>
          ) : orders.length === 0 ? (
            <div className="rounded-md border border-dashed p-10 text-center">
              <FileText className="h-8 w-8 mx-auto text-muted-foreground mb-3" />
              <p className="font-medium">No flashing orders yet</p>
              <p className="text-sm text-muted-foreground">Create the first order to start designing flashing profiles.</p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-muted-foreground">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium">Order</th>
                    <th className="text-left px-4 py-3 font-medium">Client / Job</th>
                    <th className="text-left px-4 py-3 font-medium">Status</th>
                    <th className="text-right px-4 py-3 font-medium">Lines</th>
                    <th className="text-right px-4 py-3 font-medium">LM</th>
                    <th className="text-right px-4 py-3 font-medium">Total</th>
                    <th className="text-left px-4 py-3 font-medium">Updated</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {orders.map((order: any) => (
                    <tr key={order.id} className="border-t hover:bg-muted/30">
                      <td className="px-4 py-3 font-semibold">{order.orderNumber}</td>
                      <td className="px-4 py-3">
                        <div className="font-medium">{order.clientName || "Manual order"}</div>
                        <div className="text-xs text-muted-foreground">{order.jobNumber || order.siteAddress || "No job linked"}</div>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant="outline" className={STATUS_CLASSES[order.status] || STATUS_CLASSES.draft}>
                          {STATUS_LABELS[order.status] || order.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">{order.lineCount || 0}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{Number(order.totalLinealMetres || 0).toFixed(2)}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{formatCurrency(order.totalExGst)}</td>
                      <td className="px-4 py-3 text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          <CalendarDays className="h-3.5 w-3.5" />
                          {formatDate(order.updatedAt)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button size="sm" variant="outline" onClick={() => navigate(`/construction/flashing-orders/${order.id}`)}>
                          Open <ArrowRight className="h-4 w-4 ml-1.5" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>Page {currentPage} of {totalPages}</span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}>
                Previous
              </Button>
              <Button variant="outline" size="sm" disabled={offset + PAGE_SIZE >= total} onClick={() => setOffset(offset + PAGE_SIZE)}>
                Next
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
