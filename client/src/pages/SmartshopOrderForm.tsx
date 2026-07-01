/**
 * SmartshopOrderForm — Construction Order Form (Component Orders)
 * Ported from the standalone Smartshop / Altaspan Product Catalogue app.
 * Uses tRPC to query Teable product tables and submit orders.
 */
import { useState, useCallback, useMemo, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command";
import { toast } from "sonner";
import {
  HardHat,
  Building2,
  ClipboardList,
  Package,
  Search,
  Plus,
  Trash2,
  ShoppingCart,
  ShoppingBag,
  Send,
  ChevronLeft,
  ChevronRight,
  PlusCircle,
  Save,
  Star,
  ChevronsUpDown,
  Check,
  MapPin,
  History,
  Download,
  Loader2,
  Tag,
  Filter,
  ChevronDown,
  ChevronUp,
  Layers,
  LayoutTemplate,
  Copy,
  GripVertical,
  Pencil,
} from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useLocation } from "wouter";

// ─── Types ──────────────────────────────────────────────────────────────────

interface Product {
  spaCode: string;
  description: string;
  colour: string;
  uom: string;
  packQtySizes: string;
  price: number;
  category?: string;
  subGroup?: string;
  tags?: string;
  colourInputAllowed?: boolean;
  colourGroup?: string;
}

interface OrderLine {
  id: string;
  category: string;
  spaCode: string;
  description: string;
  colour: string;
  requiredColour: string;
  uom: string;
  packQtySizes: string;
  unitPrice: number;
  quantity: number;
  length: string;
  lineNotes: string;
  lineTotal: number;
  colourInputAllowed?: boolean;
  colourGroup?: string;
}

interface OrderTemplateItem {
  spaCode: string;
  description: string;
  category: string;
  colour?: string | null;
  uom?: string | null;
  defaultQuantity: number;
  unitPrice?: string | null;
}

interface OrderDetails {
  orderDate: string;
  requestedBy: string;
  email: string;
  locationRequired: string;
  jobNumber: string;
  dateRequired: string;
  notes: string;
}

interface SelectedJob {
  id: number;
  clientName: string;
  quoteNumber: string | null;
  siteAddress: string | null;
}

interface OrderDraftPayload {
  orderDetails: OrderDetails;
  selectedJob?: SelectedJob | null;
  lines: OrderLine[];
}

function generateId() {
  return `line-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}
function getToday() {
  return new Date().toISOString().split("T")[0];
}
function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    minimumFractionDigits: 2,
  }).format(amount);
}
function defaultDraftName(orderDetails: OrderDetails, selectedJob: SelectedJob | null) {
  const jobNumber = orderDetails.jobNumber || selectedJob?.quoteNumber;
  return jobNumber ? `Component order ${jobNumber}` : `Component order ${getToday()}`;
}

function normalizeLoadedLine(line: Partial<OrderLine>): OrderLine {
  const unitPrice = Number(line.unitPrice || 0);
  const quantity = Math.max(1, Number(line.quantity || 1));
  const lineTotal = Number(line.lineTotal || unitPrice * quantity);
  return {
    id: typeof line.id === "string" && line.id ? line.id : generateId(),
    category: line.category || "",
    spaCode: line.spaCode || "",
    description: line.description || "",
    colour: line.colour || "",
    requiredColour: line.requiredColour || "",
    uom: line.uom || "",
    packQtySizes: line.packQtySizes || "",
    unitPrice,
    quantity,
    length: line.length || "",
    lineNotes: line.lineNotes || "",
    lineTotal,
    colourInputAllowed: line.colourInputAllowed,
    colourGroup: line.colourGroup || "",
  };
}

// ─── Main Component ─────────────────────────────────────────────────────────

export default function SmartshopOrderForm() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();
  const [orderDetails, setOrderDetails] = useState<OrderDetails>({
    orderDate: getToday(),
    requestedBy: "",
    email: "",
    locationRequired: "",
    jobNumber: "",
    dateRequired: "",
    notes: "",
  });
  const [orderLines, setOrderLines] = useState<OrderLine[]>([]);
  const [currentDraftId, setCurrentDraftId] = useState<number | null>(null);
  const [draftName, setDraftName] = useState("");

  const [lastSubmittedOrderId, setLastSubmittedOrderId] = useState<string | null>(null);
  const [showKitPicker, setShowKitPicker] = useState(false);

  // Job picker state
  const [jobPickerOpen, setJobPickerOpen] = useState(false);
  const [jobSearch, setJobSearch] = useState("");
  const [selectedJob, setSelectedJob] = useState<SelectedJob | null>(null);

  // Query construction clients for the job picker
  const { data: jobsData } = trpc.constructionClients.list.useQuery(
    { search: jobSearch, limit: 20, excludeCompleted: false },
    { enabled: jobSearch.length > 1 }
  );

  // Auto-populate user name/email from auth on mount
  useEffect(() => {
    if (user && !orderDetails.requestedBy && !orderDetails.email) {
      setOrderDetails((prev) => ({
        ...prev,
        requestedBy: prev.requestedBy || user.name || "",
        email: prev.email || user.email || "",
      }));
    }
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-select job from URL params (?jobId=123)
  const [urlJobId] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("jobId") ? Number(params.get("jobId")) : null;
  });

  const { data: urlJobData } = trpc.constructionClients.detail.useQuery(
    { jobId: urlJobId! },
    { enabled: !!urlJobId && !selectedJob }
  );

  useEffect(() => {
    if (urlJobData && !selectedJob) {
      const job = urlJobData.job;
      setSelectedJob({
        id: job.id,
        clientName: job.clientName,
        quoteNumber: job.quoteNumber,
        siteAddress: job.siteAddress,
      });
      setOrderDetails((prev) => ({
        ...prev,
        jobNumber: job.quoteNumber || String(job.id),
        locationRequired: job.siteAddress || prev.locationRequired,
      }));
    }
  }, [urlJobData]); // eslint-disable-line react-hooks/exhaustive-deps

  // Handle job selection from the picker
  const handleSelectJob = useCallback(
    (job: { id: number; clientName: string; quoteNumber: string | null; siteAddress: string | null }) => {
      setSelectedJob(job);
      setJobPickerOpen(false);
      setJobSearch("");
      setOrderDetails((prev) => ({
        ...prev,
        jobNumber: job.quoteNumber || String(job.id),
        locationRequired: job.siteAddress || prev.locationRequired,
      }));
      toast.success(`Job selected: ${job.clientName}`);
    },
    []
  );

  const handleClearJob = useCallback(() => {
    setSelectedJob(null);
    setOrderDetails((prev) => ({
      ...prev,
      jobNumber: "",
      locationRequired: "",
    }));
  }, []);

  const pdfMutation = trpc.smartshop.generateOrderPdf.useMutation({
    onSuccess: (result) => {
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
      toast.success("PDF downloaded successfully");
    },
    onError: () => {
      toast.error("Failed to generate PDF. You can download it later from Order History.");
    },
  });

  const draftsQuery = trpc.smartshop.listDrafts.useQuery();

  const saveDraftMutation = trpc.smartshop.saveDraft.useMutation({
    onSuccess: (result) => {
      setCurrentDraftId(result.id);
      setDraftName(result.name);
      utils.smartshop.listDrafts.invalidate();
      toast.success("Draft saved");
    },
    onError: (err) => toast.error(err.message || "Failed to save draft"),
  });

  const deleteDraftMutation = trpc.smartshop.deleteDraft.useMutation({
    onSuccess: () => {
      setCurrentDraftId(null);
      setDraftName("");
      utils.smartshop.listDrafts.invalidate();
      toast.success("Draft deleted");
    },
    onError: (err) => toast.error(err.message || "Failed to delete draft"),
  });

  const submitMutation = trpc.smartshop.submitOrder.useMutation({
    onSuccess: (result) => {
      toast.success(`Order #${result.orderNumber || "N/A"} submitted successfully!`, {
        description: "You can download the PDF from Order History.",
        duration: 6000,
      });
      // Store the orderId so we can offer PDF download
      if (result.orderId) {
        setLastSubmittedOrderId(result.orderId);
      }
      if (currentDraftId) {
        deleteDraftMutation.mutate({ id: currentDraftId }, {
          onSettled: () => utils.smartshop.listDrafts.invalidate(),
        });
      }
      resetForm();
    },
    onError: (err) => {
      toast.error(err.message || "Failed to submit order");
    },
  });

  const handleAddToOrder = useCallback((lineData: Omit<OrderLine, "id">) => {
    const newLine: OrderLine = { ...lineData, id: generateId() };
    setOrderLines((prev) => [...prev, newLine]);
    toast.success(`${lineData.spaCode} added to order`);
  }, []);

  const handleUpdateLine = useCallback((id: string, updates: Partial<OrderLine>) => {
    setOrderLines((prev) =>
      prev.map((line) => (line.id === id ? { ...line, ...updates } : line))
    );
  }, []);

  const handleRemoveLine = useCallback((id: string) => {
    setOrderLines((prev) => prev.filter((line) => line.id !== id));
    toast.info("Item removed from order");
  }, []);

  const handleDuplicateLine = useCallback((id: string) => {
    setOrderLines((prev) => {
      const idx = prev.findIndex((line) => line.id === id);
      if (idx === -1) return prev;
      const copy: OrderLine = { ...prev[idx], id: generateId(), length: "", lineNotes: "" };
      const updated = [...prev];
      updated.splice(idx + 1, 0, copy);
      return updated;
    });
    toast.success("Line duplicated");
  }, []);

  const handleReorderLines = useCallback((fromIndex: number, toIndex: number) => {
    setOrderLines((prev) => {
      const updated = [...prev];
      const [moved] = updated.splice(fromIndex, 1);
      updated.splice(toIndex, 0, moved);
      return updated;
    });
  }, []);

  const orderTotal = useMemo(
    () => orderLines.reduce((sum, line) => sum + line.lineTotal, 0),
    [orderLines]
  );
  const hasDraftContent = useMemo(
    () =>
      orderLines.length > 0 ||
      Boolean(selectedJob) ||
      Boolean(orderDetails.jobNumber.trim()) ||
      Boolean(orderDetails.locationRequired.trim()) ||
      Boolean(orderDetails.notes.trim()),
    [orderDetails.jobNumber, orderDetails.locationRequired, orderDetails.notes, orderLines.length, selectedJob]
  );

  const resetForm = useCallback(() => {
    setOrderDetails({
      orderDate: getToday(),
      requestedBy: user?.name || "",
      email: user?.email || "",
      locationRequired: "",
      jobNumber: "",
      dateRequired: "",
      notes: "",
    });
    setOrderLines([]);
    setSelectedJob(null);
    setCurrentDraftId(null);
    setDraftName("");
  }, [user]);

  const handleSaveDraft = useCallback(() => {
    if (!hasDraftContent) {
      toast.error("Add a job, delivery location, note, or order line before saving a draft");
      return;
    }
    saveDraftMutation.mutate({
      id: currentDraftId,
      name: draftName.trim() || defaultDraftName(orderDetails, selectedJob),
      payload: {
        orderDetails,
        selectedJob,
        lines: orderLines,
      },
    });
  }, [currentDraftId, draftName, hasDraftContent, orderDetails, orderLines, saveDraftMutation, selectedJob]);

  const handleLoadDraft = useCallback(async (value: string) => {
    const draftId = Number(value);
    if (!draftId) return;
    if (hasDraftContent && draftId !== currentDraftId) {
      const ok = window.confirm("Load this draft and replace the current working order?");
      if (!ok) return;
    }
    try {
      const draft = await utils.client.smartshop.getDraft.query({ id: draftId });
      const payload = draft.payload as OrderDraftPayload;
      setOrderDetails({
        orderDate: payload.orderDetails?.orderDate || getToday(),
        requestedBy: payload.orderDetails?.requestedBy || user?.name || "",
        email: payload.orderDetails?.email || user?.email || "",
        locationRequired: payload.orderDetails?.locationRequired || "",
        jobNumber: payload.orderDetails?.jobNumber || "",
        dateRequired: payload.orderDetails?.dateRequired || "",
        notes: payload.orderDetails?.notes || "",
      });
      setSelectedJob(payload.selectedJob || null);
      setOrderLines((payload.lines || []).map(normalizeLoadedLine));
      setCurrentDraftId(draft.id);
      setDraftName(draft.name || "");
      toast.success("Draft loaded");
    } catch (err: any) {
      toast.error(err?.message || "Failed to load draft");
    }
  }, [currentDraftId, hasDraftContent, user?.email, user?.name, utils]);

  const handleDeleteCurrentDraft = useCallback(() => {
    if (!currentDraftId) return;
    const ok = window.confirm("Delete this saved draft? Your current on-screen order will remain open.");
    if (!ok) return;
    deleteDraftMutation.mutate({ id: currentDraftId });
  }, [currentDraftId, deleteDraftMutation]);

  const handleSubmit = useCallback(() => {
    if (!orderDetails.requestedBy || !orderDetails.email || !orderDetails.locationRequired || !orderDetails.jobNumber || !orderDetails.dateRequired) {
      toast.error("Please fill in all required order details");
      return;
    }
    if (orderLines.length === 0) {
      toast.error("Please add at least one item to the order");
      return;
    }
    submitMutation.mutate({
      ...orderDetails,
      lines: orderLines.map((l) => ({
        category: l.category,
        spaCode: l.spaCode,
        description: l.description,
        colour: l.colour,
        requiredColour: l.requiredColour,
        uom: l.uom,
        packQtySizes: l.packQtySizes,
        unitPrice: l.unitPrice,
        quantity: l.quantity,
        lineNotes: l.lineNotes,
      })),
    });
  }, [orderDetails, orderLines, submitMutation]);

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Page Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <HardHat className="h-7 w-7 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Component Orders</h1>
            <p className="text-sm text-muted-foreground flex items-center gap-1.5">
              <Building2 className="h-3.5 w-3.5" />
              Altaspan Product Catalogue
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="gap-2"
          onClick={() => navigate("/construction/component-orders/history")}
        >
          <History className="h-4 w-4" />
          Order History
        </Button>
      </div>

      {/* Success Banner with PDF Download */}
      {lastSubmittedOrderId && (
        <Card className="border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950/30">
          <CardContent className="py-4">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/50">
                  <Check className="h-5 w-5 text-green-600 dark:text-green-400" />
                </div>
                <div>
                  <p className="font-semibold text-green-800 dark:text-green-200">Order submitted successfully!</p>
                  <p className="text-sm text-green-600 dark:text-green-400">Download the PDF for your records or for site use.</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2 border-green-300 text-green-700 hover:bg-green-100 dark:border-green-700 dark:text-green-300 dark:hover:bg-green-900/50"
                  onClick={() => pdfMutation.mutate({ orderId: lastSubmittedOrderId })}
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
                  variant="ghost"
                  size="sm"
                  className="text-green-600 hover:text-green-800 dark:text-green-400"
                  onClick={() => setLastSubmittedOrderId(null)}
                >
                  Dismiss
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Main Content */}
      <div className="space-y-6">
          {/* Section 0: Job Selector */}
          <JobSelectorCard
            selectedJob={selectedJob}
            jobPickerOpen={jobPickerOpen}
            setJobPickerOpen={setJobPickerOpen}
            jobSearch={jobSearch}
            setJobSearch={setJobSearch}
            jobsData={jobsData}
            onSelectJob={handleSelectJob}
            onClearJob={handleClearJob}
          />

          {/* Section 1: Order Details */}
          <OrderHeaderSection orderDetails={orderDetails} onChange={setOrderDetails} />

          {/* Section 2: Product Browser */}
          <ProductBrowserSection onAddToOrder={handleAddToOrder} />

          {/* Section 2.5: Apply Kit */}
          <ApplyKitSection
            showKitPicker={showKitPicker}
            setShowKitPicker={setShowKitPicker}
            onApplyKit={(kitLines) => {
              kitLines.forEach((line) => {
                const newLine: OrderLine = { ...line, id: generateId() };
                setOrderLines((prev) => [...prev, newLine]);
              });
              toast.success(`Kit applied: ${kitLines.length} items added`);
            }}
          />

          {/* Section 3: Custom Product */}
          <CustomProductSection onAddToOrder={handleAddToOrder} />

          {/* Section 4: Order Lines */}
          <OrderLinesSection
            lines={orderLines}
            onUpdateLine={handleUpdateLine}
            onRemoveLine={handleRemoveLine}
            onDuplicateLine={handleDuplicateLine}
            onReorderLines={handleReorderLines}
          />
      </div>

      {/* Order Summary & Submit */}
      <Card className="border-primary/20">
        <CardContent className="py-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2 text-muted-foreground">
                <ShoppingBag className="h-5 w-5" />
                <span className="font-medium">
                  {orderLines.length} {orderLines.length === 1 ? "item" : "items"}
                </span>
              </div>
              <div className="h-8 w-px bg-border" />
              <div className="flex items-baseline gap-2">
                <span className="text-sm font-medium text-muted-foreground">Order Total:</span>
                <span className="text-2xl font-bold text-primary">
                  {formatCurrency(orderTotal)}
                </span>
              </div>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
              <Input
                value={draftName}
                onChange={(event) => setDraftName(event.target.value)}
                placeholder={defaultDraftName(orderDetails, selectedJob)}
                className="w-full sm:w-56"
              />
              <Select
                value={currentDraftId ? String(currentDraftId) : undefined}
                onValueChange={handleLoadDraft}
                disabled={draftsQuery.isLoading || !draftsQuery.data?.length}
              >
                <SelectTrigger className="w-full sm:w-56">
                  <SelectValue placeholder={draftsQuery.isLoading ? "Loading drafts..." : "Load draft"} />
                </SelectTrigger>
                <SelectContent>
                  {(draftsQuery.data || []).map((draft) => (
                    <SelectItem key={draft.id} value={String(draft.id)}>
                      {draft.name} · {draft.lineCount} item{draft.lineCount === 1 ? "" : "s"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                size="lg"
                onClick={handleSaveDraft}
                disabled={saveDraftMutation.isPending || !hasDraftContent}
                className="gap-2"
              >
                {saveDraftMutation.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Save className="h-5 w-5" />}
                Save Draft
              </Button>
              {currentDraftId && (
                <Button
                  variant="ghost"
                  size="lg"
                  onClick={handleDeleteCurrentDraft}
                  disabled={deleteDraftMutation.isPending}
                  className="gap-2 text-destructive hover:text-destructive"
                >
                  <Trash2 className="h-5 w-5" />
                  Delete Draft
                </Button>
              )}
              <Button
                size="lg"
                onClick={handleSubmit}
                disabled={submitMutation.isPending || orderLines.length === 0}
                className="gap-2 px-8 text-base font-semibold"
              >
                {submitMutation.isPending ? (
                  <>
                    <Spinner className="h-5 w-5" />
                    Submitting...
                  </>
                ) : (
                  <>
                    <Send className="h-5 w-5" />
                    Submit Order
                  </>
                )}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Job Selector Card ─────────────────────────────────────────────────────

function JobSelectorCard({
  selectedJob,
  jobPickerOpen,
  setJobPickerOpen,
  jobSearch,
  setJobSearch,
  jobsData,
  onSelectJob,
  onClearJob,
}: {
  selectedJob: { id: number; clientName: string; quoteNumber: string | null; siteAddress: string | null } | null;
  jobPickerOpen: boolean;
  setJobPickerOpen: (open: boolean) => void;
  jobSearch: string;
  setJobSearch: (search: string) => void;
  jobsData: { clients: any[]; total: number } | undefined;
  onSelectJob: (job: { id: number; clientName: string; quoteNumber: string | null; siteAddress: string | null }) => void;
  onClearJob: () => void;
}) {
  const jobs = jobsData?.clients || [];

  return (
    <Card className="border-primary/20 bg-primary/5">
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2 text-lg font-semibold">
          <Building2 className="h-5 w-5 text-primary" />
          Select Construction Job
        </CardTitle>
      </CardHeader>
      <CardContent>
        {selectedJob ? (
          <div className="flex items-center gap-4 rounded-lg border border-primary/20 bg-card p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
              <Building2 className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-foreground">{selectedJob.clientName}</p>
              <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                {selectedJob.quoteNumber && (
                  <span className="flex items-center gap-1">
                    <ClipboardList className="h-3.5 w-3.5" />
                    {selectedJob.quoteNumber}
                  </span>
                )}
                {selectedJob.siteAddress && (
                  <span className="flex items-center gap-1">
                    <MapPin className="h-3.5 w-3.5" />
                    {selectedJob.siteAddress}
                  </span>
                )}
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={onClearJob}>
              Change
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              Search and select a construction job to auto-populate job number and delivery location.
            </p>
            <Popover open={jobPickerOpen} onOpenChange={setJobPickerOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={jobPickerOpen}
                  className="w-full justify-between text-left font-normal"
                >
                  <span className="flex items-center gap-2 text-muted-foreground">
                    <Search className="h-4 w-4" />
                    Search by client name, address, or quote number...
                  </span>
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
                <Command shouldFilter={false}>
                  <CommandInput
                    placeholder="Search jobs..."
                    value={jobSearch}
                    onValueChange={setJobSearch}
                  />
                  <CommandList>
                    {jobSearch.length <= 1 ? (
                      <CommandEmpty>Type at least 2 characters to search...</CommandEmpty>
                    ) : jobs.length === 0 ? (
                      <CommandEmpty>No jobs found.</CommandEmpty>
                    ) : (
                      <CommandGroup heading="Construction Jobs">
                        {jobs.map((job: any) => (
                          <CommandItem
                            key={job.id}
                            value={String(job.id)}
                            onSelect={() =>
                              onSelectJob({
                                id: job.id,
                                clientName: job.clientName,
                                quoteNumber: job.quoteNumber,
                                siteAddress: job.siteAddress,
                              })
                            }
                            className="flex flex-col items-start gap-0.5 py-2"
                          >
                            <div className="flex items-center gap-2 w-full">
                              <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                              <span className="font-medium">{job.clientName}</span>
                              {job.quoteNumber && (
                                <Badge variant="outline" className="ml-auto text-xs">
                                  {job.quoteNumber}
                                </Badge>
                              )}
                            </div>
                            {job.siteAddress && (
                              <span className="ml-6 text-xs text-muted-foreground line-clamp-1">
                                {job.siteAddress}
                              </span>
                            )}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    )}
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Order Header Section ───────────────────────────────────────────────────

function OrderHeaderSection({
  orderDetails,
  onChange,
}: {
  orderDetails: OrderDetails;
  onChange: (d: OrderDetails) => void;
}) {
  const handleChange = (field: keyof OrderDetails, value: string) => {
    onChange({ ...orderDetails, [field]: value });
  };
  return (
    <Card>
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2 text-lg font-semibold">
          <ClipboardList className="h-5 w-5 text-primary" />
          Order Details
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="orderDate" className="font-medium">Order Request Date</Label>
            <Input id="orderDate" type="date" value={orderDetails.orderDate} onChange={(e) => handleChange("orderDate", e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="requestedBy" className="font-medium">Requested By <span className="text-destructive">*</span></Label>
            <Input id="requestedBy" placeholder="Enter your name" value={orderDetails.requestedBy} onChange={(e) => handleChange("requestedBy", e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email" className="font-medium">Email <span className="text-destructive">*</span></Label>
            <Input id="email" type="email" placeholder="your.email@example.com" value={orderDetails.email} onChange={(e) => handleChange("email", e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="locationRequired" className="font-medium">Location Required <span className="text-destructive">*</span></Label>
            <Input id="locationRequired" placeholder="Delivery location" value={orderDetails.locationRequired} onChange={(e) => handleChange("locationRequired", e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="jobNumber" className="font-medium">Job Number <span className="text-destructive">*</span></Label>
            <Input id="jobNumber" placeholder="Enter job number" value={orderDetails.jobNumber} onChange={(e) => handleChange("jobNumber", e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="dateRequired" className="font-medium">Date Required <span className="text-destructive">*</span></Label>
            <Input id="dateRequired" type="date" value={orderDetails.dateRequired} onChange={(e) => handleChange("dateRequired", e.target.value)} />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="notes" className="font-medium">General Notes</Label>
            <Textarea id="notes" placeholder="Any general notes for this order..." value={orderDetails.notes} onChange={(e) => handleChange("notes", e.target.value)} rows={3} className="resize-none" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Product Browser Section ────────────────────────────────────────────────

function ProductBrowserSection({
  onAddToOrder,
}: {
  onAddToOrder: (line: Omit<OrderLine, "id">) => void;
}) {
  const PAGE_SIZE = 100;
  const [browseMode, setBrowseMode] = useState<"category" | "tag">("category");
  const [category, setCategory] = useState("");
  const [selectedTag, setSelectedTag] = useState("");
  const [selectedSubGroup, setSelectedSubGroup] = useState("");
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [offset, setOffset] = useState(0);
  const [showFavouritesOnly, setShowFavouritesOnly] = useState(false);
  const [categoryPickerCollapsed, setCategoryPickerCollapsed] = useState(true);
  const [scopePickerCollapsed, setScopePickerCollapsed] = useState(true);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  // Colour group queries for dropdown
  const { data: allColourGroups } = trpc.colourGroups.getAll.useQuery();
  const { data: allColourMembers } = trpc.colourGroups.getAllMembers.useQuery();

  // Build colour group map: groupName -> colour values
  const colourGroupMap = useMemo(() => {
    const map = new Map<string, string[]>();
    if (!allColourGroups || !allColourMembers) return map;
    for (const g of allColourGroups) {
      const members = allColourMembers
        .filter((m) => m.colourGroupId === g.id)
        .map((m) => m.colourValue)
        .sort();
      map.set(g.name, members);
    }
    return map;
  }, [allColourGroups, allColourMembers]);

  // Get colour options for a specific product based on its colourGroup, fallback to Standard Colorbond
  const getColourOptionsForProduct = useCallback((product: Product): string[] => {
    // If product has a specific colour group assigned, use it
    if (product.colourGroup && colourGroupMap.has(product.colourGroup)) {
      return colourGroupMap.get(product.colourGroup) || [];
    }
    // Fallback to Standard Colorbond
    return colourGroupMap.get('Standard Colorbond') || [];
  }, [colourGroupMap]);

  // Determine if a product should show the colour dropdown
  const shouldShowColourDropdown = useCallback((product: Product): boolean => {
    if (product.colourInputAllowed) return true;
    if (product.colourGroup) return true;
    if (!product.colour) return true;
    if (product.colour.toLowerCase().includes('mill')) return true;
    return false;
  }, []);

  // Favourites
  const { data: favourites = [], refetch: refetchFavourites } =
    trpc.smartshop.getFavourites.useQuery();
  const toggleFavMutation = trpc.smartshop.toggleFavourite.useMutation({
    onSuccess: (result) => {
      toast.success(result.favourited ? "Added to favourites" : "Removed from favourites");
      refetchFavourites();
    },
  });
  const isFavourite = (cat: string, spaCode: string) =>
    favourites.some((f: { category: string; spaCode: string }) => f.category === cat && f.spaCode === spaCode);

  // Per-product input state (required colour, quantity, line notes)
  const [productInputs, setProductInputs] = useState<
    Record<string, { requiredColour: string; quantity: number; length: string; lineNotes: string }>
  >({});

  const { data: categories } = trpc.smartshop.categories.useQuery();
  const { data: allTags } = trpc.smartshop.allTags.useQuery();
  const { data: subGroupsList } = trpc.smartshop.subGroups.useQuery();

  // Build query params based on browse mode
  const queryEnabled = browseMode === "category" ? true : !!selectedTag;
  const queryParams = useMemo(() => {
    if (browseMode === "tag") {
      return {
        tag: selectedTag,
        subGroup: selectedSubGroup || undefined,
        search,
        offset,
        limit: PAGE_SIZE,
      };
    }
    return {
      category: category || undefined,
      search,
      offset,
      limit: PAGE_SIZE,
    };
  }, [browseMode, category, selectedTag, selectedSubGroup, search, offset]);

  const { data, isFetching } = trpc.smartshop.fetchProducts.useQuery(
    queryParams,
    { enabled: queryEnabled }
  );

  const products = data?.products ?? [];
  const total = data?.total ?? 0;
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // Group products by sub-group when in tag mode
  const groupedProducts = useMemo(() => {
    if (browseMode !== "tag" || !selectedTag) return null;
    const groups: Record<string, Product[]> = {};
    for (const p of products) {
      const group = p.subGroup || "Other";
      if (!groups[group]) groups[group] = [];
      groups[group].push(p);
    }
    // Sort groups alphabetically, but put "Other" last
    const sorted = Object.entries(groups).sort(([a], [b]) => {
      if (a === "Other") return 1;
      if (b === "Other") return -1;
      return a.localeCompare(b);
    });
    return sorted;
  }, [products, browseMode, selectedTag]);

  const getInput = (spaCode: string) =>
    productInputs[spaCode] || { requiredColour: "", quantity: 1, length: "", lineNotes: "" };

  const updateProductInput = (
    spaCode: string,
    field: string,
    value: string | number
  ) => {
    setProductInputs((prev) => ({
      ...prev,
      [spaCode]: { ...getInput(spaCode), [field]: value },
    }));
  };

  const resetFilters = () => {
    setSearch("");
    setSearchInput("");
    setOffset(0);
    setProductInputs({});
    setCollapsedGroups(new Set());
    setSelectedSubGroup("");
  };

  const handleCategoryChange = (cat: string) => {
    setCategory(cat);
    resetFilters();
    setCategoryPickerCollapsed(true);
  };

  const handleTagChange = (tag: string) => {
    setSelectedTag(tag);
    resetFilters();
    setScopePickerCollapsed(true);
  };

  const handleBrowseModeChange = (mode: "category" | "tag") => {
    setBrowseMode(mode);
    setCategory("");
    setSelectedTag("");
    setCategoryPickerCollapsed(true);
    setScopePickerCollapsed(true);
    resetFilters();
  };

  const handleSearch = () => {
    setSearch(searchInput);
    setOffset(0);
  };

  const toggleGroupCollapsed = (group: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });
  };

  const handleAddProduct = (product: Product) => {
    const input = getInput(product.spaCode);
    onAddToOrder({
      category: product.category || category,
      spaCode: product.spaCode,
      description: product.description,
      colour: product.colour,
      requiredColour: input.requiredColour,
      uom: product.uom,
      packQtySizes: product.packQtySizes,
      unitPrice: product.price,
      quantity: input.quantity,
      length: input.length,
      lineNotes: input.lineNotes,
      lineTotal: product.price * input.quantity,
      colourInputAllowed: product.colourInputAllowed,
      colourGroup: product.colourGroup,
    });
    setProductInputs((prev) => {
      const next = { ...prev };
      delete next[product.spaCode];
      return next;
    });
  };

  // Filter products by favourites if toggled
  const displayProducts = showFavouritesOnly
    ? products.filter((p) => isFavourite(p.category || category, p.spaCode))
    : products;

  // Render a product row
  const renderProductRow = (product: Product, index: number, effectiveCategory: string) => {
    const input = getInput(product.spaCode);
    const fav = isFavourite(effectiveCategory, product.spaCode);
    const showDropdown = shouldShowColourDropdown(product);
    return (
      <tr
        key={product.spaCode + index}
        className={`border-b last:border-b-0 transition-colors hover:bg-muted/30 ${index % 2 === 0 ? "" : "bg-muted/10"}`}
      >
        <td className="px-2 py-1.5 text-center">
          <button
            onClick={() =>
              toggleFavMutation.mutate({ category: effectiveCategory, spaCode: product.spaCode })
            }
            className="p-1 rounded hover:bg-muted transition-colors"
            title={fav ? "Remove from favourites" : "Add to favourites"}
          >
            <Star
              className={`h-3.5 w-3.5 ${
                fav
                  ? "fill-amber-400 text-amber-400"
                  : "text-muted-foreground/40 hover:text-amber-400"
              }`}
            />
          </button>
        </td>
        <td className="px-3 py-1.5 font-mono text-xs whitespace-nowrap">
          {product.spaCode}
        </td>
        <td className="px-3 py-1.5 max-w-[200px]">
          <span className="line-clamp-2 text-xs">{product.description}</span>
        </td>
        <td className="px-3 py-1.5 whitespace-nowrap text-xs">{product.colour}</td>
        <td className="px-3 py-1.5 whitespace-nowrap text-xs">{product.uom}</td>
        <td className="px-3 py-1.5 text-right font-medium whitespace-nowrap text-xs">
          {formatCurrency(product.price)}
        </td>
        <td className="px-2 py-1.5">
          {showDropdown ? (
            (() => {
              const colourOpts = getColourOptionsForProduct(product);
              return colourOpts.length > 0 ? (
                <Select
                  value={input.requiredColour || ""}
                  onValueChange={(val) =>
                    updateProductInput(product.spaCode, "requiredColour", val === "__clear__" ? "" : val)
                  }
                >
                  <SelectTrigger className="h-7 w-28 text-xs border-0 bg-muted/50 focus:ring-1">
                    <SelectValue placeholder="Select colour..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__clear__">— None —</SelectItem>
                    {colourOpts.map(c => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  className="h-7 w-28 text-xs border-0 bg-muted/50 focus-visible:ring-1"
                  value={input.requiredColour}
                  onChange={(e) =>
                    updateProductInput(product.spaCode, "requiredColour", e.target.value)
                  }
                  placeholder="Colour needed"
                />
              );
            })()
          ) : (
            <span className="text-xs text-muted-foreground px-1">—</span>
          )}
        </td>
        <td className="px-2 py-1.5">
          <Input
            type="number"
            min={1}
            className="h-7 w-14 text-center text-xs border-0 bg-muted/50 focus-visible:ring-1"
            value={input.quantity}
            onChange={(e) =>
              updateProductInput(
                product.spaCode,
                "quantity",
                Math.max(1, parseInt(e.target.value) || 1)
              )
            }
          />
        </td>
        <td className="px-2 py-1.5">
          <Input
            className="h-7 w-20 text-xs border-0 bg-muted/50 focus-visible:ring-1"
            value={input.length}
            onChange={(e) =>
              updateProductInput(product.spaCode, "length", e.target.value)
            }
            placeholder="e.g. 3.6m"
          />
        </td>
        <td className="px-2 py-1.5">
          <Input
            className="h-7 w-24 text-xs border-0 bg-muted/50 focus-visible:ring-1"
            value={input.lineNotes}
            onChange={(e) =>
              updateProductInput(product.spaCode, "lineNotes", e.target.value)
            }
            placeholder="Notes"
          />
        </td>
        <td className="px-2 py-1.5 text-center">
          <Button
            size="sm"
            onClick={() => handleAddProduct(product)}
            className="h-7 text-xs gap-1"
          >
            <Plus className="h-3 w-3" />
            Add
          </Button>
        </td>
      </tr>
    );
  };

  const tableHeader = (
    <thead>
      <tr className="border-b bg-muted/50">
        <th className="w-[28px]"></th>
        <th className="text-left px-3 py-2.5 font-medium text-xs">SPA Code</th>
        <th className="text-left px-3 py-2.5 font-medium text-xs">Description</th>
        <th className="text-left px-3 py-2.5 font-medium text-xs">Colour</th>
        <th className="text-left px-3 py-2.5 font-medium text-xs">UOM</th>
        <th className="text-right px-3 py-2.5 font-medium text-xs">Price</th>
        <th className="text-left px-2 py-2.5 font-medium text-xs">Req. Colour</th>
        <th className="text-center px-2 py-2.5 font-medium text-xs">Qty</th>
        <th className="text-left px-2 py-2.5 font-medium text-xs">Length</th>
        <th className="text-left px-2 py-2.5 font-medium text-xs">Notes</th>
        <th className="w-[60px]"></th>
      </tr>
    </thead>
  );

  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg font-semibold">
            <Package className="h-5 w-5 text-primary" />
            Product Catalogue
          </CardTitle>
          {queryEnabled && total > 0 && (
            <Badge variant="secondary" className="text-xs">
              {total} {total === 1 ? "product" : "products"}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {/* Browse Mode Toggle */}
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <span className="text-sm font-medium text-muted-foreground">Browse by:</span>
          <div className="flex rounded-lg border border-border overflow-hidden">
            <button
              type="button"
              onClick={() => handleBrowseModeChange("category")}
              className={`px-4 py-2 text-sm font-medium transition-colors flex items-center gap-2 ${
                browseMode === "category"
                  ? "bg-primary text-primary-foreground"
                  : "bg-card text-foreground hover:bg-muted"
              }`}
            >
              <Layers className="h-4 w-4" />
              Category
            </button>
            <button
              type="button"
              onClick={() => handleBrowseModeChange("tag")}
              className={`px-4 py-2 text-sm font-medium transition-colors flex items-center gap-2 ${
                browseMode === "tag"
                  ? "bg-primary text-primary-foreground"
                  : "bg-card text-foreground hover:bg-muted"
              }`}
            >
              <Tag className="h-4 w-4" />
              Scope
            </button>
          </div>
        </div>

        {/* Category picker (category mode) */}
        {browseMode === "category" && categories && categories.length > 0 && (
          <div className="mb-4 overflow-hidden rounded-lg border border-border bg-muted/20">
            <button
              type="button"
              onClick={() => setCategoryPickerCollapsed((value) => !value)}
              className="flex w-full flex-wrap items-center justify-between gap-2 px-3 py-2 text-left transition-colors hover:bg-muted/40"
              aria-expanded={!categoryPickerCollapsed}
            >
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <Layers className="h-4 w-4 shrink-0 text-primary" />
                <span className="text-sm font-medium">Categories</span>
                <Badge variant="secondary" className="max-w-full truncate text-xs">
                  {category || "All products"}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {categories.length} {categories.length === 1 ? "category" : "categories"}
                </span>
              </div>
              <span className="ml-auto flex shrink-0 items-center gap-1 text-xs font-medium text-muted-foreground">
                {categoryPickerCollapsed ? "Show" : "Hide"}
                {categoryPickerCollapsed ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronUp className="h-4 w-4" />
                )}
              </span>
            </button>
            {!categoryPickerCollapsed && (
              <div className="border-t border-border bg-card px-3 py-3">
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant={!category ? "default" : "outline"}
                    size="sm"
                    onClick={() => handleCategoryChange("")}
                    className="text-xs"
                  >
                    All products
                  </Button>
                  {categories.map((cat: string) => (
                    <Button
                      key={cat}
                      variant={category === cat ? "default" : "outline"}
                      size="sm"
                      onClick={() => handleCategoryChange(cat)}
                      className="text-xs"
                    >
                      {cat}
                    </Button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Scope picker (tag/scope mode) */}
        {browseMode === "tag" && allTags && allTags.length > 0 && (
          <div className="mb-4 overflow-hidden rounded-lg border border-border bg-muted/20">
            <button
              type="button"
              onClick={() => setScopePickerCollapsed((value) => !value)}
              className="flex w-full flex-wrap items-center justify-between gap-2 px-3 py-2 text-left transition-colors hover:bg-muted/40"
              aria-expanded={!scopePickerCollapsed}
            >
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <Tag className="h-4 w-4 shrink-0 text-primary" />
                <span className="text-sm font-medium">Scopes</span>
                <Badge variant="secondary" className="max-w-full truncate text-xs">
                  {selectedTag || "Select scope"}
                </Badge>
                {selectedSubGroup && (
                  <Badge variant="outline" className="max-w-full truncate text-xs">
                    {selectedSubGroup}
                  </Badge>
                )}
                <span className="text-xs text-muted-foreground">
                  {allTags.length} {allTags.length === 1 ? "scope" : "scopes"}
                </span>
              </div>
              <span className="ml-auto flex shrink-0 items-center gap-1 text-xs font-medium text-muted-foreground">
                {scopePickerCollapsed ? "Show" : "Hide"}
                {scopePickerCollapsed ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronUp className="h-4 w-4" />
                )}
              </span>
            </button>
            {!scopePickerCollapsed && (
              <div className="space-y-3 border-t border-border bg-card px-3 py-3">
                <div className="flex flex-wrap gap-2">
                  {allTags.map((tag: string) => (
                    <Button
                      key={tag}
                      variant={selectedTag === tag ? "default" : "outline"}
                      size="sm"
                      onClick={() => handleTagChange(tag)}
                      className="text-xs gap-1"
                    >
                      <Tag className="h-3 w-3" />
                      {tag}
                    </Button>
                  ))}
                </div>
                {/* Sub-group filter chips when a tag is selected */}
                {selectedTag && subGroupsList && subGroupsList.length > 0 && (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                      <Filter className="h-3 w-3" />
                      Sub-group:
                    </span>
                    <Button
                      variant={selectedSubGroup === "" ? "secondary" : "ghost"}
                      size="sm"
                      onClick={() => { setSelectedSubGroup(""); setOffset(0); }}
                      className="text-xs h-7"
                    >
                      All
                    </Button>
                    {subGroupsList.map((sg: string) => (
                      <Button
                        key={sg}
                        variant={selectedSubGroup === sg ? "secondary" : "ghost"}
                        size="sm"
                        onClick={() => { setSelectedSubGroup(sg); setOffset(0); }}
                        className="text-xs h-7"
                      >
                        {sg}
                      </Button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Tag empty state */}
        {browseMode === "tag" && (!allTags || allTags.length === 0) && (
          <div className="py-8 text-center text-muted-foreground">
            <Tag className="mx-auto h-10 w-10 opacity-50" />
            <p className="mt-3 text-sm">No tags have been assigned to products yet.</p>
            <p className="text-xs mt-1">Use Component Order Data to tag products with scopes like Roof, Deck, etc.</p>
          </div>
        )}

        {/* Search + Favourites filter */}
        {queryEnabled && (
          <div className="mb-4 flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-10"
                placeholder="Search products by code, description, or colour..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              />
            </div>
            <Button variant="outline" size="sm" onClick={handleSearch}>
              <Search className="h-4 w-4" />
            </Button>
            <Button
              variant={showFavouritesOnly ? "default" : "outline"}
              size="sm"
              onClick={() => setShowFavouritesOnly(!showFavouritesOnly)}
              className="gap-1"
            >
              <Star className={`h-4 w-4 ${showFavouritesOnly ? "fill-current" : ""}`} />
              Favourites
            </Button>
          </div>
        )}

        {/* Loading */}
        {isFetching && (
          <div className="flex items-center justify-center py-12">
            <Spinner className="h-8 w-8" />
          </div>
        )}

        {/* Grouped Product View (tag mode) */}
        {!isFetching && browseMode === "tag" && selectedTag && groupedProducts && groupedProducts.length > 0 && !showFavouritesOnly && (
          <div className="space-y-3">
            {groupedProducts.map(([groupName, groupProducts]) => {
              const isCollapsed = collapsedGroups.has(groupName);
              return (
                <Card key={groupName} className="overflow-hidden">
                  {/* Group Header */}
                  <button
                    onClick={() => toggleGroupCollapsed(groupName)}
                    className="w-full flex items-center justify-between px-4 py-2.5 bg-muted/50 hover:bg-muted transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <Layers className="h-4 w-4 text-primary" />
                      <span className="font-semibold text-sm">{groupName}</span>
                      <Badge variant="secondary" className="text-xs">
                        {groupProducts.length} {groupProducts.length === 1 ? "item" : "items"}
                      </Badge>
                    </div>
                    {isCollapsed ? (
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <ChevronUp className="h-4 w-4 text-muted-foreground" />
                    )}
                  </button>
                  {/* Group Products */}
                  {!isCollapsed && (
                    <CardContent className="p-0">
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          {tableHeader}
                          <tbody>
                            {groupProducts.map((product, idx) =>
                              renderProductRow(product, idx, product.category || category)
                            )}
                          </tbody>
                        </table>
                      </div>
                    </CardContent>
                  )}
                </Card>
              );
            })}
          </div>
        )}

        {/* Flat Product Table (category mode or favourites) */}
        {!isFetching && (browseMode === "category" || showFavouritesOnly) && displayProducts.length > 0 && !(browseMode === "tag" && !showFavouritesOnly) && (
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  {tableHeader}
                  <tbody>
                    {displayProducts.map((product, index) =>
                      renderProductRow(product, index, product.category || category)
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Flat table for tag mode + favourites */}
        {!isFetching && browseMode === "tag" && showFavouritesOnly && displayProducts.length > 0 && (
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  {tableHeader}
                  <tbody>
                    {displayProducts.map((product, index) =>
                      renderProductRow(product, index, product.category || category)
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Pagination */}
        {!isFetching && queryEnabled && !showFavouritesOnly && total > PAGE_SIZE && (
          <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
            <span>
              Showing {offset + 1}\u2013{Math.min(offset + PAGE_SIZE, total)} of {total} products
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
                disabled={offset === 0 || isFetching}
              >
                <ChevronLeft className="h-4 w-4" />
                Previous
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
                Next
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {/* Empty states */}
        {!isFetching && queryEnabled && displayProducts.length === 0 && (
          <div className="py-12 text-center text-muted-foreground">
            <Package className="mx-auto h-12 w-12 opacity-50" />
            <p className="mt-4">
              {showFavouritesOnly
                ? "No favourite products found."
                : "No products found. Try a different search term."}
            </p>
          </div>
        )}
        {browseMode === "tag" && !selectedTag && allTags && allTags.length > 0 && (
          <div className="py-12 text-center text-muted-foreground">
            <Tag className="mx-auto h-12 w-12 opacity-50" />
            <p className="mt-4">Select a scope tag to browse related products</p>
            <p className="text-xs mt-1 text-muted-foreground/70">e.g. Roof, Gables, Decks - shows all products needed for that build scope</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Custom Product Section ─────────────────────────────────────────────────

function CustomProductSection({
  onAddToOrder,
}: {
  onAddToOrder: (line: Omit<OrderLine, "id">) => void;
}) {
  const [saveToDb, setSaveToDb] = useState(true);
  const [formData, setFormData] = useState({
    spaCode: "",
    description: "",
    colour: "",
    uom: "",
    packQtySizes: "",
    requiredColour: "",
    quantity: 1,
    length: "",
    lineNotes: "",
  });

  const saveMutation = trpc.smartshop.saveOtherProduct.useMutation();

  const updateField = (field: string, value: string | number) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleAddToOrder = async () => {
    if (!formData.description.trim()) {
      toast.error("Description is required");
      return;
    }

    // Build the line
    const line: Omit<OrderLine, "id"> = {
      category: "Other",
      spaCode: formData.spaCode || "CUSTOM",
      description: formData.description,
      colour: formData.colour,
      requiredColour: formData.requiredColour,
      uom: formData.uom,
      packQtySizes: formData.packQtySizes,
      unitPrice: 0,
      quantity: formData.quantity,
      length: formData.length,
      lineNotes: formData.lineNotes,
      lineTotal: 0,
    };

    // Save to Other Products table if checked
    if (saveToDb) {
      try {
        await saveMutation.mutateAsync({
          spaCode: formData.spaCode || "CUSTOM",
          description: formData.description,
          colour: formData.colour,
          uom: formData.uom,
          packQtySizes: formData.packQtySizes,
        });
      } catch {
        // Non-blocking — still add to order
      }
    }

    onAddToOrder(line);

    // Reset form
    setFormData({
      spaCode: "",
      description: "",
      colour: "",
      uom: "",
      packQtySizes: "",
      requiredColour: "",
      quantity: 1,
      length: "",
      lineNotes: "",
    });
  };

  return (
    <Card className="border-dashed">
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2 text-lg font-semibold">
          <PlusCircle className="h-5 w-5 text-primary" />
          Custom / Other Product
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-2">
            <Label className="font-medium">SPA Code</Label>
            <Input value={formData.spaCode} onChange={(e) => updateField("spaCode", e.target.value)} placeholder="e.g. CUSTOM-001" />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label className="font-medium">Description <span className="text-destructive">*</span></Label>
            <Input value={formData.description} onChange={(e) => updateField("description", e.target.value)} placeholder="Product description" />
          </div>
          <div className="space-y-2">
            <Label className="font-medium">Default Colour</Label>
            <Input value={formData.colour} onChange={(e) => updateField("colour", e.target.value)} placeholder="e.g. White" />
          </div>
          <div className="space-y-2">
            <Label className="font-medium">UOM</Label>
            <Input value={formData.uom} onChange={(e) => updateField("uom", e.target.value)} placeholder="e.g. EA, M, PK" />
          </div>
          <div className="space-y-2">
            <Label className="font-medium">Pack Qty/Sizes</Label>
            <Input value={formData.packQtySizes} onChange={(e) => updateField("packQtySizes", e.target.value)} placeholder="e.g. 10/PK" />
          </div>
        </div>
        <div className="mt-4 border-t border-border pt-4">
          <p className="mb-3 text-sm font-medium text-foreground">Order Details</p>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-2">
              <Label className="font-medium">Required Colour</Label>
              <Input value={formData.requiredColour} onChange={(e) => updateField("requiredColour", e.target.value)} placeholder="Colour needed" />
            </div>
            <div className="space-y-2">
              <Label className="font-medium">Quantity <span className="text-destructive">*</span></Label>
              <Input type="number" min={1} value={formData.quantity} onChange={(e) => updateField("quantity", Math.max(1, parseInt(e.target.value) || 1))} />
            </div>
            <div className="space-y-2">
              <Label className="font-medium">Length</Label>
              <Input value={formData.length} onChange={(e) => updateField("length", e.target.value)} placeholder="e.g. 3.6m" />
            </div>
            <div className="space-y-2">
              <Label className="font-medium">Line Notes</Label>
              <Input value={formData.lineNotes} onChange={(e) => updateField("lineNotes", e.target.value)} placeholder="Special instructions" />
            </div>
          </div>
        </div>
        <div className="mt-6 flex items-center justify-between">
          <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
            <input
              type="checkbox"
              checked={saveToDb}
              onChange={(e) => setSaveToDb(e.target.checked)}
              className="h-4 w-4 rounded border-border"
            />
            <Save className="h-4 w-4" />
            Save to Other Products for future use
          </label>
          <Button
            onClick={handleAddToOrder}
            disabled={saveMutation.isPending || !formData.description.trim()}
            className="gap-2"
          >
            {saveMutation.isPending ? (
              <Spinner className="h-4 w-4" />
            ) : (
              <PlusCircle className="h-4 w-4" />
            )}
            Add to Order
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Order Lines Section ────────────────────────────────────────────────────

function OrderLinesSection({
  lines,
  onUpdateLine,
  onRemoveLine,
  onDuplicateLine,
  onReorderLines,
}: {
  lines: OrderLine[];
  onUpdateLine: (id: string, updates: Partial<OrderLine>) => void;
  onRemoveLine: (id: string) => void;
  onDuplicateLine: (id: string) => void;
  onReorderLines: (fromIndex: number, toIndex: number) => void;
}) {
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);
  const [summaryExpanded, setSummaryExpanded] = useState(true);
  const [editingColourId, setEditingColourId] = useState<string | null>(null);

  // Colour group queries for inline editing
  const { data: allColourGroups } = trpc.colourGroups.getAll.useQuery();
  const { data: allColourMembers } = trpc.colourGroups.getAllMembers.useQuery();

  // Build colour group map: groupName -> colour values
  const colourGroupMap = useMemo(() => {
    const map = new Map<string, string[]>();
    if (!allColourGroups || !allColourMembers) return map;
    for (const g of allColourGroups) {
      const members = allColourMembers
        .filter((m) => m.colourGroupId === g.id)
        .map((m) => m.colourValue)
        .sort();
      map.set(g.name, members);
    }
    return map;
  }, [allColourGroups, allColourMembers]);

  // Get colour options for a line based on its colourGroup, fallback to Standard Colorbond
  const getColourOptionsForLine = useCallback((line: OrderLine): string[] => {
    if (line.colourGroup && colourGroupMap.has(line.colourGroup)) {
      return colourGroupMap.get(line.colourGroup) || [];
    }
    return colourGroupMap.get('Standard Colorbond') || [];
  }, [colourGroupMap]);

  // Determine if a line should allow colour editing
  const canEditColour = useCallback((line: OrderLine): boolean => {
    if (line.colourInputAllowed) return true;
    if (line.colourGroup) return true;
    if (!line.colour) return true;
    if (line.colour.toLowerCase().includes('mill')) return true;
    return false;
  }, []);

  // Summary stats
  const totalItems = lines.length;
  const totalQty = lines.reduce((s, l) => s + l.quantity, 0);
  const totalValue = lines.reduce((s, l) => s + l.lineTotal, 0);

  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg font-semibold">
            <ShoppingCart className="h-5 w-5 text-primary" />
            Order Lines
          </CardTitle>
          {lines.length > 0 && (
            <Badge variant="secondary" className="text-xs">
              {lines.length} {lines.length === 1 ? "item" : "items"}
            </Badge>
          )}
        </div>
      </CardHeader>

      {/* Collapsible Summary Stats */}
      {lines.length > 0 && (
        <div
          className="border-b border-border bg-muted/40 px-6 py-3 cursor-pointer flex items-center justify-between"
          onClick={() => setSummaryExpanded(!summaryExpanded)}
        >
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            {summaryExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            Order Summary
          </div>
          {summaryExpanded ? (
            <div className="flex gap-8">
              <div className="text-center">
                <div className="text-xs text-muted-foreground">Items</div>
                <div className="text-lg font-bold">{totalItems}</div>
              </div>
              <div className="text-center">
                <div className="text-xs text-muted-foreground">Total Qty</div>
                <div className="text-lg font-bold">{totalQty}</div>
              </div>
              <div className="text-center">
                <div className="text-xs text-muted-foreground">Total Value</div>
                <div className="text-lg font-bold text-primary">{formatCurrency(totalValue)}</div>
              </div>
            </div>
          ) : (
            <div className="flex gap-4 text-sm">
              <span>{totalItems} items</span>
              <span className="font-semibold text-primary">{formatCurrency(totalValue)}</span>
            </div>
          )}
        </div>
      )}

      <CardContent className="pt-6">
        {lines.length === 0 ? (
          <div className="py-12 text-center text-muted-foreground">
            <ShoppingCart className="mx-auto h-12 w-12 opacity-50" />
            <p className="mt-4">No items added to the order yet.</p>
            <p className="text-sm">Browse the product catalogue above to add items.</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted text-muted-foreground">
                <tr>
                  <th className="w-8 px-1 py-3"></th>
                  <th className="px-3 py-3 text-left font-semibold">SPA Code</th>
                  <th className="px-3 py-3 text-left font-semibold">Description</th>
                  <th className="px-3 py-3 text-left font-semibold">Colour</th>
                  <th className="px-3 py-3 text-left font-semibold">Req. Colour</th>
                  <th className="px-3 py-3 text-left font-semibold">UOM</th>
                  <th className="px-3 py-3 text-right font-semibold">Unit Price</th>
                  <th className="px-3 py-3 text-center font-semibold">Qty</th>
                  <th className="px-3 py-3 text-left font-semibold">Length</th>
                  <th className="px-3 py-3 text-left font-semibold">Notes</th>
                  <th className="px-3 py-3 text-right font-semibold">Line Total</th>
                  <th className="px-3 py-3 text-center font-semibold"></th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line, index) => {
                  return (
                    <tr
                      key={line.id}
                      draggable
                      onDragStart={() => setDragIdx(index)}
                      onDragOver={(e) => { e.preventDefault(); setOverIdx(index); }}
                      onDragLeave={() => setOverIdx(null)}
                      onDrop={() => {
                        if (dragIdx !== null && dragIdx !== index) onReorderLines(dragIdx, index);
                        setDragIdx(null);
                        setOverIdx(null);
                      }}
                      onDragEnd={() => { setDragIdx(null); setOverIdx(null); }}
                      className={[
                        index % 2 === 0 ? "bg-card" : "bg-muted/30",
                        dragIdx === index ? "opacity-40" : "",
                        overIdx === index && dragIdx !== index ? "ring-2 ring-primary/50" : "",
                      ].join(" ")}
                    >
                      <td className="px-1 py-2 text-center cursor-grab active:cursor-grabbing">
                        <GripVertical className="h-4 w-4 text-muted-foreground/50 mx-auto" />
                      </td>
                      <td className="px-3 py-2 font-mono text-xs whitespace-nowrap">{line.spaCode}</td>
                      <td className="px-3 py-2 max-w-[180px]">
                        <span className="line-clamp-2">{line.description}</span>
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">{line.colour}</td>
                      <td className="px-2 py-2">
                        {editingColourId === line.id ? (
                          (() => {
                            const opts = getColourOptionsForLine(line);
                            return opts.length > 0 ? (
                              <Select
                                value={line.requiredColour || ""}
                                onValueChange={(val) => {
                                  onUpdateLine(line.id, { requiredColour: val === "__clear__" ? "" : val });
                                  setEditingColourId(null);
                                }}
                              >
                                <SelectTrigger className="h-8 w-28 text-xs">
                                  <SelectValue placeholder="Select colour..." />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="__clear__">— None —</SelectItem>
                                  {opts.map(c => (
                                    <SelectItem key={c} value={c}>{c}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            ) : (
                              <Input
                                className="h-8 w-28 text-xs"
                                value={line.requiredColour}
                                onChange={(e) => onUpdateLine(line.id, { requiredColour: e.target.value })}
                                onBlur={() => setEditingColourId(null)}
                                autoFocus
                                placeholder="Colour"
                              />
                            );
                          })()
                        ) : (
                          <div className="flex items-center gap-1">
                            <span className="text-xs whitespace-nowrap">
                              {line.requiredColour || <span className="text-muted-foreground">—</span>}
                            </span>
                            {canEditColour(line) && (
                              <button
                                onClick={() => setEditingColourId(line.id)}
                                className="p-0.5 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                                title="Edit colour"
                              >
                                <Pencil className="h-3 w-3" />
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">{line.uom}</td>
                      <td className="px-3 py-2 text-right font-medium whitespace-nowrap">
                        {formatCurrency(line.unitPrice)}
                      </td>
                      <td className="px-2 py-2">
                        <Input
                          type="number"
                          min={1}
                          className="h-8 w-16 text-center text-xs"
                          value={line.quantity}
                          onChange={(e) => {
                            const qty = Math.max(1, parseInt(e.target.value) || 1);
                            onUpdateLine(line.id, { quantity: qty, lineTotal: line.unitPrice * qty });
                          }}
                        />
                      </td>
                      <td className="px-2 py-2">
                        <Input
                          className="h-8 w-20 text-xs"
                          value={line.length || ""}
                          onChange={(e) => onUpdateLine(line.id, { length: e.target.value })}
                          placeholder="e.g. 3.6m"
                        />
                      </td>
                      <td className="px-2 py-2">
                        <Input
                          className="h-8 w-28 text-xs"
                          value={line.lineNotes}
                          onChange={(e) => onUpdateLine(line.id, { lineNotes: e.target.value })}
                          placeholder="Notes"
                        />
                      </td>
                      <td className="px-3 py-2 text-right font-semibold text-primary whitespace-nowrap">
                        {formatCurrency(line.lineTotal)}
                      </td>
                      <td className="px-2 py-2 text-center">
                        <div className="flex gap-0.5 justify-center">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => onDuplicateLine(line.id)}
                            className="h-8 w-8 p-0 text-muted-foreground hover:text-primary"
                            title="Duplicate line"
                          >
                            <Copy className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => onRemoveLine(line.id)}
                            className="h-8 w-8 p-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}


// ─── Apply Kit Section ──────────────────────────────────────────────────────

function ApplyKitSection({
  showKitPicker,
  setShowKitPicker,
  onApplyKit,
}: {
  showKitPicker: boolean;
  setShowKitPicker: (v: boolean) => void;
  onApplyKit: (lines: Omit<OrderLine, "id">[]) => void;
}) {
  const { data: templates } = trpc.smartshop.listTemplates.useQuery(undefined, {
    enabled: showKitPicker,
  });
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(null);
  const { data: templateDetail } = trpc.smartshop.getTemplate.useQuery(
    { id: selectedTemplateId! },
    { enabled: !!selectedTemplateId }
  );

  const handleApply = () => {
    if (!templateDetail?.items?.length) return;
    const lines: Omit<OrderLine, "id">[] = templateDetail.items.map((item: OrderTemplateItem) => ({
      category: item.category || "",
      spaCode: item.spaCode,
      description: item.description,
      colour: item.colour || "",
      requiredColour: item.colour || "",
      uom: item.uom || "",
      packQtySizes: "",
      unitPrice: Number(item.unitPrice) || 0,
      quantity: item.defaultQuantity,
      length: "",
      lineNotes: "",
      lineTotal: (Number(item.unitPrice) || 0) * item.defaultQuantity,
    }));
    onApplyKit(lines);
    setShowKitPicker(false);
    setSelectedTemplateId(null);
  };

  if (!showKitPicker) {
    return (
      <Card className="border-dashed border-2 border-primary/20 bg-primary/5 hover:border-primary/40 transition-colors cursor-pointer"
        onClick={() => setShowKitPicker(true)}>
        <CardContent className="flex items-center justify-center gap-3 py-6">
          <LayoutTemplate className="h-5 w-5 text-primary" />
          <span className="font-medium text-primary">Apply a Pre-Built Kit</span>
          <span className="text-sm text-muted-foreground">— add a standard set of components in one click</span>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg font-semibold">
            <LayoutTemplate className="h-5 w-5 text-primary" />
            Apply Kit / Template
          </CardTitle>
          <Button variant="ghost" size="sm" onClick={() => { setShowKitPicker(false); setSelectedTemplateId(null); }}>
            Cancel
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {!templates?.length ? (
          <div className="text-center py-8 text-muted-foreground">
            <LayoutTemplate className="h-10 w-10 mx-auto mb-2 opacity-40" />
            <p>No templates created yet.</p>
            <p className="text-sm">Create templates in Admin → Order Templates</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {templates.map((t) => (
                <div
                  key={t.id}
                  className={`rounded-lg border-2 p-4 cursor-pointer transition-all ${
                    selectedTemplateId === t.id
                      ? "border-primary bg-primary/5 shadow-sm"
                      : "border-border hover:border-primary/40"
                  }`}
                  onClick={() => setSelectedTemplateId(t.id)}
                >
                  <div className="font-medium">{t.name}</div>
                  {t.description && (
                    <div className="text-sm text-muted-foreground mt-1 line-clamp-2">{t.description}</div>
                  )}
                  <div className="flex items-center gap-2 mt-2">
                    <Badge variant="secondary" className="text-xs">{t.itemCount} items</Badge>
                    {t.tag && <Badge variant="outline" className="text-xs">{t.tag}</Badge>}
                  </div>
                </div>
              ))}
            </div>

            {selectedTemplateId && templateDetail && (
              <div className="border rounded-lg p-4 bg-muted/30 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="font-semibold">{templateDetail.name} — Preview</h4>
                  <Button onClick={handleApply} className="gap-2">
                    <Plus className="h-4 w-4" />
                    Add {templateDetail.items?.length || 0} Items to Order
                  </Button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-muted-foreground">
                        <th className="py-2 pr-3">SPA Code</th>
                        <th className="py-2 pr-3">Description</th>
                        <th className="py-2 pr-3">Colour</th>
                        <th className="py-2 pr-3 text-right">Qty</th>
                        <th className="py-2 pr-3">UoM</th>
                        <th className="py-2 text-right">Unit Price</th>
                      </tr>
                    </thead>
                    <tbody>
                      {templateDetail.items?.map((item: OrderTemplateItem, i: number) => (
                        <tr key={i} className="border-b border-border/50">
                          <td className="py-2 pr-3 font-mono text-xs">{item.spaCode}</td>
                          <td className="py-2 pr-3">{item.description}</td>
                          <td className="py-2 pr-3">{item.colour || "—"}</td>
                          <td className="py-2 pr-3 text-right font-medium">{item.defaultQuantity}</td>
                          <td className="py-2 pr-3">{item.uom || "—"}</td>
                          <td className="py-2 text-right">{formatCurrency(Number(item.unitPrice) || 0)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
