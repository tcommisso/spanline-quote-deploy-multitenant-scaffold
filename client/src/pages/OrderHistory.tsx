/**
 * OrderHistory — View past Component Orders submitted via Teable.
 * Shows a list of orders with detail expansion and re-order capability.
 */
import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { isAdminRole } from "@shared/const";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ArrowLeft,
  Search,
  Package,
  ChevronLeft,
  ChevronRight,
  Eye,
  Copy,
  Calendar,
  MapPin,
  User,
  Mail,
  FileText,
  HardHat,
  Building2,
  History,
  Download,
  Loader2,
  Clock,
  ArrowRight,
} from "lucide-react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { logClientDownload } from "@/lib/userActivity";

const PAGE_SIZE = 20;

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  Submitted: { label: "Submitted", color: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300" },
  Processing: { label: "Processing", color: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300" },
  Shipped: { label: "Shipped", color: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300" },
  Delivered: { label: "Delivered", color: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300" },
  Cancelled: { label: "Cancelled", color: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300" },
};

function formatDate(dateStr: string | null) {
  if (!dateStr) return "—";
  try {
    return new Date(dateStr).toLocaleDateString("en-AU", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return dateStr;
  }
}

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    minimumFractionDigits: 2,
  }).format(amount);
}

/** CSV Export Button */
function ExportCsvButton({ jobNumber, status, dateFrom, dateTo }: {
  jobNumber?: string;
  status?: string;
  dateFrom?: string;
  dateTo?: string;
}) {
  const [exporting, setExporting] = useState(false);
  const { data, refetch } = trpc.smartshop.exportOrdersCsv.useQuery(
    { jobNumber, status, dateFrom, dateTo },
    { enabled: false }
  );

  const handleExport = async () => {
    setExporting(true);
    try {
      const result = await refetch();
      if (result.data?.csvContent) {
        const blob = new Blob([result.data.csvContent], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        const filename = `order-history-${new Date().toISOString().split("T")[0]}.csv`;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        logClientDownload({
          filename,
          source: "smartshop_order_history_export",
          entityType: "smartshop_order",
          mimeType: "text/csv",
          metadata: {
            rowCount: result.data.rowCount,
            jobNumber,
            status,
            dateFrom,
            dateTo,
          },
        });
        toast.success(`Exported ${result.data.rowCount} rows`);
      }
    } catch (err: any) {
      toast.error(`Export failed: ${err.message}`);
    } finally {
      setExporting(false);
    }
  };

  return (
    <Button variant="outline" size="sm" onClick={handleExport} disabled={exporting}>
      {exporting ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Download className="h-4 w-4 mr-1.5" />}
      Export CSV
    </Button>
  );
}

export default function OrderHistory() {
  const [, navigate] = useLocation();
  const [jobFilter, setJobFilter] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [offset, setOffset] = useState(0);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);

  // Parse jobNumber from URL if present
  const [urlJobNumber] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("jobNumber") || "";
  });

  const effectiveJobFilter = jobFilter || urlJobNumber;

  const { data, isLoading, isFetching } = trpc.smartshop.listOrders.useQuery(
    {
      jobNumber: effectiveJobFilter || undefined,
      status: statusFilter || undefined,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      limit: PAGE_SIZE,
      offset,
    }
  );

  const orders = data?.orders || [];
  const total = data?.total || 0;
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const handleSearch = () => {
    setJobFilter(searchInput);
    setOffset(0);
  };

  const handleClearFilter = () => {
    setJobFilter("");
    setSearchInput("");
    setStatusFilter("");
    setDateFrom("");
    setDateTo("");
    setOffset(0);
  };

  const hasActiveFilters = !!(effectiveJobFilter || statusFilter || dateFrom || dateTo);

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Page Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate("/construction/component-orders")}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <History className="h-7 w-7 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Order History</h1>
            <p className="text-sm text-muted-foreground flex items-center gap-1.5">
              <Package className="h-3.5 w-3.5" />
              Component Orders submitted to Smartshop
            </p>
          </div>
        </div>
        <ExportCsvButton
          jobNumber={effectiveJobFilter || undefined}
          status={statusFilter || undefined}
          dateFrom={dateFrom || undefined}
          dateTo={dateTo || undefined}
        />
      </div>

      {/* Main Content */}
      <div className="space-y-6">
        {/* Search / Filter */}
        <Card className="mb-6">
          <CardContent className="pt-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="pl-10"
                  placeholder="Filter by job number..."
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                />
              </div>
              <Button variant="outline" onClick={handleSearch}>
                <Search className="h-4 w-4 mr-1.5" /> Filter
              </Button>
              {hasActiveFilters && (
                <Button variant="ghost" onClick={handleClearFilter}>
                  Clear All
                </Button>
              )}
            </div>
            {/* Status & Date Range Filters */}
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Status</label>
                <select
                  className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                  value={statusFilter}
                  onChange={(e) => { setStatusFilter(e.target.value); setOffset(0); }}
                >
                  <option value="">All Statuses</option>
                  <option value="submitted">Submitted</option>
                  <option value="processing">Processing</option>
                  <option value="shipped">Shipped</option>
                  <option value="delivered">Delivered</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">From</label>
                <Input
                  type="date"
                  className="h-9 w-[150px]"
                  value={dateFrom}
                  onChange={(e) => { setDateFrom(e.target.value); setOffset(0); }}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">To</label>
                <Input
                  type="date"
                  className="h-9 w-[150px]"
                  value={dateTo}
                  onChange={(e) => { setDateTo(e.target.value); setOffset(0); }}
                />
              </div>
            </div>
            {hasActiveFilters && (
              <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                <span>Active filters:</span>
                {effectiveJobFilter && <Badge variant="outline">Job: {effectiveJobFilter}</Badge>}
                {statusFilter && <Badge variant="outline">Status: {statusFilter}</Badge>}
                {dateFrom && <Badge variant="outline">From: {dateFrom}</Badge>}
                {dateTo && <Badge variant="outline">To: {dateTo}</Badge>}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Loading */}
        {isLoading && (
          <div className="flex items-center justify-center py-20">
            <Spinner className="h-8 w-8" />
          </div>
        )}

        {/* Empty State */}
        {!isLoading && orders.length === 0 && (
          <Card>
            <CardContent className="py-16 text-center">
              <Package className="mx-auto h-12 w-12 text-muted-foreground/50" />
              <p className="mt-4 text-muted-foreground">
                {effectiveJobFilter
                  ? `No orders found for job "${effectiveJobFilter}".`
                  : "No orders found."}
              </p>
            </CardContent>
          </Card>
        )}

        {/* Orders List */}
        {!isLoading && orders.length > 0 && (
          <>
            <div className="space-y-3">
              {orders.map((order) => {
                const sc = STATUS_CONFIG[order.status] || STATUS_CONFIG.Submitted;
                return (
                  <Card
                    key={order.id}
                    className="hover:border-primary/30 transition-colors cursor-pointer"
                    onClick={() => setSelectedOrderId(order.id)}
                  >
                    <CardContent className="py-4">
                      <div className="flex items-center justify-between gap-4 flex-wrap">
                        <div className="flex items-center gap-4 min-w-0">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                            <FileText className="h-5 w-5 text-primary" />
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-semibold text-foreground">
                                Order #{order.orderNumber || "—"}
                              </span>
                              <Badge className={sc.color} variant="secondary">
                                {sc.label}
                              </Badge>
                            </div>
                            <div className="flex items-center gap-4 text-sm text-muted-foreground mt-1 flex-wrap">
                              <span className="flex items-center gap-1">
                                <Calendar className="h-3.5 w-3.5" />
                                {formatDate(order.orderDate)}
                              </span>
                              <span className="flex items-center gap-1">
                                <HardHat className="h-3.5 w-3.5" />
                                Job: {order.jobNumber || "—"}
                              </span>
                              <span className="flex items-center gap-1">
                                <MapPin className="h-3.5 w-3.5" />
                                {order.locationRequired || "—"}
                              </span>
                              <span className="flex items-center gap-1">
                                <User className="h-3.5 w-3.5" />
                                {order.requestedBy}
                              </span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button variant="outline" size="sm" className="gap-1.5">
                            <Eye className="h-3.5 w-3.5" /> View
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            {/* Pagination */}
            <div className="mt-6 flex items-center justify-between text-sm text-muted-foreground">
              <span>
                Showing {offset + 1}–{Math.min(offset + PAGE_SIZE, total)} of {total} orders
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
                  disabled={offset === 0 || isFetching}
                >
                  <ChevronLeft className="h-4 w-4" /> Previous
                </Button>
                <span className="px-2">
                  Page {currentPage} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setOffset(offset + PAGE_SIZE)}
                  disabled={offset + PAGE_SIZE >= total || isFetching}
                >
                  Next <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Order Detail Dialog */}
      {selectedOrderId && (
        <OrderDetailDialog
          orderId={selectedOrderId}
          onClose={() => setSelectedOrderId(null)}
          onReorder={(lines) => {
            // Navigate to component orders form with re-order data stored in sessionStorage
            sessionStorage.setItem("reorder_lines", JSON.stringify(lines));
            navigate("/construction/component-orders");
            toast.info("Lines copied — they will be loaded into the order form.");
          }}
        />
      )}
    </div>
  );
}

// ─── Order Detail Dialog ────────────────────────────────────────────────────

function OrderDetailDialog({
  orderId,
  onClose,
  onReorder,
}: {
  orderId: string;
  onClose: () => void;
  onReorder: (lines: any[]) => void;
}) {
  const utils = trpc.useUtils();
  const { user } = useAuth();
  const isAdmin = isAdminRole(user?.role || "");
  const [editingStatus, setEditingStatus] = useState(false);
  const [newStatus, setNewStatus] = useState("");
  const [statusNote, setStatusNote] = useState("");
  const { data, isLoading, error } = trpc.smartshop.getOrderDetail.useQuery({ orderId });
  const { data: statusHistory } = trpc.smartshop.getOrderStatusHistory.useQuery({ orderId });

  const statusMutation = trpc.smartshop.updateOrderStatus.useMutation({
    onSuccess: () => {
      toast.success("Order status updated");
      setEditingStatus(false);
      utils.smartshop.getOrderDetail.invalidate({ orderId });
      utils.smartshop.getOrderStatusHistory.invalidate({ orderId });
      utils.smartshop.listOrders.invalidate();
    },
    onError: (err) => {
      toast.error(`Failed to update status: ${err.message}`);
    },
  });

  const pdfMutation = trpc.smartshop.generateOrderPdf.useMutation({
    onSuccess: (result) => {
      // Convert base64 to blob and trigger download
      const byteChars = atob(result.pdfBase64);
      const byteNumbers = new Array(byteChars.length);
      for (let i = 0; i < byteChars.length; i++) {
        byteNumbers[i] = byteChars.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = result.fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      logClientDownload({
        filename: result.fileName,
        source: "smartshop_order_pdf",
        entityType: "smartshop_order",
        entityId: orderId,
        mimeType: "application/pdf",
      });
      toast.success("PDF downloaded successfully");
    },
    onError: (err) => {
      toast.error(`Failed to generate PDF: ${err.message}`);
    },
  });

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Order #{data?.order?.orderNumber || "—"}
          </DialogTitle>
        </DialogHeader>

        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <Spinner className="h-8 w-8" />
          </div>
        )}

        {error && (
          <div className="text-center py-8 text-destructive">
            <p>Failed to load order details.</p>
            <p className="text-sm text-muted-foreground mt-1">{error.message}</p>
          </div>
        )}

        {data && (
          <div className="space-y-6">
            {/* Order Header Info */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">Order Date</span>
                <p className="font-medium">{formatDate(data.order.orderDate)}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Date Required</span>
                <p className="font-medium">{formatDate(data.order.dateRequired)}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Status</span>
                {editingStatus ? (
                  <div className="space-y-2 mt-1">
                    <div className="flex items-center gap-2">
                      <select
                        className="h-8 rounded-md border border-input bg-background px-2 text-sm"
                        value={newStatus}
                        onChange={(e) => setNewStatus(e.target.value)}
                      >
                        <option value="submitted">Submitted</option>
                        <option value="processing">Processing</option>
                        <option value="shipped">Shipped</option>
                        <option value="delivered">Delivered</option>
                        <option value="cancelled">Cancelled</option>
                      </select>
                      <Button
                        size="sm"
                        className="h-8"
                        disabled={statusMutation.isPending || newStatus === data.order.status}
                        onClick={() => {
                          statusMutation.mutate({ orderId, status: newStatus as any, note: statusNote || undefined });
                          setStatusNote("");
                        }}
                      >
                        {statusMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : "Save"}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8"
                        onClick={() => { setEditingStatus(false); setStatusNote(""); }}
                      >
                        Cancel
                      </Button>
                    </div>
                    <textarea
                      className="w-full h-16 rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground resize-none"
                      placeholder="Optional note (e.g. Dispatched via XYZ courier, ETA tomorrow)"
                      value={statusNote}
                      onChange={(e) => setStatusNote(e.target.value)}
                    />
                  </div>
                ) : (
                  <p className="flex items-center gap-2">
                    <Badge
                      className={
                        (STATUS_CONFIG[data.order.status] || STATUS_CONFIG.Submitted).color
                      }
                      variant="secondary"
                    >
                      {data.order.status}
                    </Badge>
                    {isAdmin && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground"
                        onClick={() => { setNewStatus(data.order.status); setEditingStatus(true); }}
                      >
                        Change
                      </Button>
                    )}
                  </p>
                )}
              </div>
              <div>
                <span className="text-muted-foreground">Requested By</span>
                <p className="font-medium flex items-center gap-1">
                  <User className="h-3.5 w-3.5" /> {data.order.requestedBy}
                </p>
              </div>
              <div>
                <span className="text-muted-foreground">Email</span>
                <p className="font-medium flex items-center gap-1">
                  <Mail className="h-3.5 w-3.5" /> {data.order.email}
                </p>
              </div>
              <div>
                <span className="text-muted-foreground">Job Number</span>
                <p className="font-medium flex items-center gap-1">
                  <HardHat className="h-3.5 w-3.5" /> {data.order.jobNumber}
                </p>
              </div>
              <div className="md:col-span-2">
                <span className="text-muted-foreground">Location</span>
                <p className="font-medium flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5" /> {data.order.locationRequired}
                </p>
              </div>
              {data.order.notes && (
                <div className="col-span-full">
                  <span className="text-muted-foreground">Notes</span>
                  <p className="text-sm mt-0.5">{data.order.notes}</p>
                </div>
              )}
            </div>

            {/* Line Items Table */}
            <div>
              <h3 className="font-semibold mb-3">
                Line Items ({data.lines.length})
              </h3>
              {data.lines.length === 0 ? (
                <p className="text-sm text-muted-foreground">No line items found.</p>
              ) : (
                <div className="overflow-x-auto rounded-lg border border-border">
                  <table className="w-full text-sm">
                    <thead className="bg-muted text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2 text-left font-semibold">SPA Code</th>
                        <th className="px-3 py-2 text-left font-semibold">Description</th>
                        <th className="px-3 py-2 text-left font-semibold">Colour</th>
                        <th className="px-3 py-2 text-left font-semibold">Req. Colour</th>
                        <th className="px-3 py-2 text-left font-semibold">UOM</th>
                        <th className="px-3 py-2 text-right font-semibold">Price</th>
                        <th className="px-3 py-2 text-center font-semibold">Qty</th>
                        <th className="px-3 py-2 text-right font-semibold">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.lines.map((line, idx) => (
                        <tr
                          key={idx}
                          className={idx % 2 === 0 ? "bg-card" : "bg-muted/30"}
                        >
                          <td className="px-3 py-2 font-mono text-xs whitespace-nowrap">
                            {line.spaCode}
                          </td>
                          <td className="px-3 py-2 max-w-[200px]">
                            <span className="line-clamp-2">{line.description}</span>
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap">{line.colour}</td>
                          <td className="px-3 py-2 whitespace-nowrap">{line.requiredColour}</td>
                          <td className="px-3 py-2 whitespace-nowrap">{line.uom}</td>
                          <td className="px-3 py-2 text-right whitespace-nowrap">
                            {formatCurrency(line.unitPrice)}
                          </td>
                          <td className="px-3 py-2 text-center">{line.quantity}</td>
                          <td className="px-3 py-2 text-right font-medium whitespace-nowrap">
                            {formatCurrency(line.unitPrice * line.quantity)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-muted font-semibold">
                        <td colSpan={7} className="px-3 py-2 text-right">
                          Order Total:
                        </td>
                        <td className="px-3 py-2 text-right text-primary">
                          {formatCurrency(
                            data.lines.reduce(
                              (sum, l) => sum + l.unitPrice * l.quantity,
                              0
                            )
                          )}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>

            {/* Status History Timeline */}
            {statusHistory && statusHistory.length > 0 && (
              <div>
                <h3 className="font-semibold mb-3 flex items-center gap-2">
                  <History className="h-4 w-4" /> Status History
                </h3>
                <div className="relative ml-3 border-l-2 border-border pl-6 space-y-4">
                  {statusHistory.map((entry) => (
                    <div key={entry.id} className="relative">
                      <div className="absolute -left-[31px] top-1 h-4 w-4 rounded-full border-2 border-primary bg-background flex items-center justify-center">
                        <Clock className="h-2.5 w-2.5 text-primary" />
                      </div>
                      <div className="text-sm">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant="outline" className="text-xs capitalize">{entry.fromStatus}</Badge>
                          <ArrowRight className="h-3 w-3 text-muted-foreground" />
                          <Badge variant="secondary" className="text-xs capitalize">{entry.toStatus}</Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          by <span className="font-medium text-foreground">{entry.changedByName}</span>
                          {entry.createdAt && (
                            <> &middot; {new Date(entry.createdAt).toLocaleString()}</>
                          )}
                        </p>
                        {entry.note && (
                          <p className="text-xs text-muted-foreground mt-0.5 italic">"{entry.note}"</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Action Buttons */}
            {data.lines.length > 0 && (
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  className="gap-2"
                  onClick={() => pdfMutation.mutate({ orderId })}
                  disabled={pdfMutation.isPending}
                >
                  {pdfMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Download className="h-4 w-4" />
                  )}
                  {pdfMutation.isPending ? "Generating..." : "Download PDF"}
                </Button>
                <Button
                  variant="outline"
                  className="gap-2"
                  onClick={() => onReorder(data.lines)}
                >
                  <Copy className="h-4 w-4" /> Re-order (Copy Lines)
                </Button>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
