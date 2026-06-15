import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { HelpLink } from "@/components/HelpLink";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { FileText, Plus, Search, MoreHorizontal, Copy, Trash2, Clock, CheckCircle2, XCircle, Send, Archive, ArchiveRestore, PenLine, LayoutGrid, LayoutList, FileDown, CheckSquare } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { useState, useEffect, useCallback } from "react";
import { useLocation, useSearch } from "wouter";
import { toast } from "sonner";
import ConfirmDeleteDialog from "@/components/ConfirmDeleteDialog";
import ClientPicker from "@/components/ClientPicker";
import AddressAutocomplete, { type AddressResult } from "@/components/AddressAutocomplete";
import { detectRegion } from "@shared/regionDetection";
import DesignAdvisorSelect from "@/components/DesignAdvisorSelect";
import RegionSelect from "@/components/RegionSelect";

import { Building2 } from "lucide-react";

const statusConfig: Record<string, { label: string; class: string; icon: any }> = {
  draft: { label: "Draft", class: "bg-muted text-muted-foreground", icon: Clock },
  sent: { label: "Sent", class: "bg-blue-50 text-blue-700 border-blue-200", icon: Send },
  accepted: { label: "Accepted", class: "bg-emerald-50 text-emerald-700 border-emerald-200", icon: CheckCircle2 },
  lost: { label: "Lost", class: "bg-red-50 text-red-600 border-red-200", icon: XCircle },
};

export default function QuoteList() {
  const [, setLocation] = useLocation();
  const searchParams = useSearch();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [advisorFilter, setAdvisorFilter] = useState("all");
  const [showArchived, setShowArchived] = useState(false);
  const [viewMode, setViewMode] = useState<"list" | "compact">(() => {
    return (localStorage.getItem("quoteListViewMode") as "list" | "compact") || "list";
  });
  const [branchFilter, setBranchFilter] = useState("all");
  const [selectedQuotes, setSelectedQuotes] = useState<Set<number>>(new Set());
  const [batchExporting, setBatchExporting] = useState(false);
  const [deleteQuoteTarget, setDeleteQuoteTarget] = useState<number | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [selectedClient, setSelectedClient] = useState<{ id: number; name: string; phone?: string | null; email?: string | null; address?: string | null; suburb?: string | null; state?: string | null; postcode?: string | null; designAdvisor?: string | null } | null>(null);
  const [newRegion, setNewRegion] = useState("Canberra");
  const [siteAddress, setSiteAddress] = useState("");
  const [newDesignAdvisor, setNewDesignAdvisor] = useState("");
  const [newLocalCouncil, setNewLocalCouncil] = useState("");

  const utils = trpc.useUtils();
  // Fetch building authority data for selected lead to get localCouncil
  const { data: buildingAuth } = trpc.crm.buildingAuthority.get.useQuery(
    { leadId: selectedClient?.id! },
    { enabled: !!selectedClient?.id }
  );
  // Auto-populate localCouncil when building authority data loads
  useEffect(() => {
    if (buildingAuth?.councilName) {
      setNewLocalCouncil(buildingAuth.councilName);
    }
  }, [buildingAuth]);
  const { data: quotes, isLoading } = trpc.quotes.list.useQuery({ search: search || undefined, status: statusFilter });
  const createMutation = trpc.quotes.create.useMutation({
    onSuccess: (data) => {
      toast.success(`Quote ${data.quoteNumber} created`);
      if (data.leadUnarchived) {
        toast.info("Lead was automatically unarchived");
      }
      setShowCreate(false);
      setSelectedClient(null);
      utils.quotes.list.invalidate();
      utils.quotes.stats.invalidate();
      setLocation(`/quotes/${data.id}`);
    },
    onError: (err) => toast.error(err.message),
  });
  const duplicateMutation = trpc.quotes.duplicate.useMutation({
    onSuccess: (data) => {
      toast.success(`Quote duplicated as ${data.quoteNumber}`);
      utils.quotes.list.invalidate();
      utils.quotes.stats.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });
  const deleteMutation = trpc.quotes.delete.useMutation({
    onSuccess: () => {
      toast.success("Quote deleted");
      utils.quotes.list.invalidate();
      utils.quotes.stats.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });
  const archiveMutation = trpc.quotes.archive.useMutation({
    onSuccess: (_, vars) => {
      toast.success(vars.archived ? "Quote archived" : "Quote restored");
      utils.quotes.list.invalidate();
      utils.quotes.stats.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  useEffect(() => {
    if (searchParams.includes("new=1")) setShowCreate(true);
  }, [searchParams]);

  const { data: branchesList } = trpc.branches.list.useQuery();
  const { data: advisorsList } = trpc.designAdvisors.list.useQuery({});

  // Build a map from advisor name to branchId for branch filtering
  const advisorBranchMap = new Map<string, number>();
  advisorsList?.forEach(a => {
    if (a.branchId) advisorBranchMap.set(a.name, a.branchId);
  });

  // Filter archived/non-archived, by advisor, and by branch
  const filteredQuotes = quotes?.filter(q => {
    const isArchived = !!(q as any).archived;
    const archiveMatch = showArchived ? isArchived : !isArchived;
    const advisorMatch = advisorFilter === "all" || (q as any).designAdvisor === advisorFilter;
    // Branch filter: match if the quote's design advisor belongs to the selected branch
    let branchMatch = true;
    if (branchFilter !== "all") {
      const branchId = parseInt(branchFilter);
      const quoteAdvisor = (q as any).designAdvisor;
      if (quoteAdvisor) {
        branchMatch = advisorBranchMap.get(quoteAdvisor) === branchId;
      } else {
        branchMatch = false;
      }
    }
    return archiveMatch && advisorMatch && branchMatch;
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-semibold tracking-tight">Structure Quotes</h1>
            <HelpLink section="quotes-costing" tooltip="Help: Quotes & Costing" />
          </div>
          <p className="text-xs sm:text-sm text-muted-foreground mt-0.5 sm:mt-1 truncate">
            {isAdmin ? "All structure quotes across the team" : "Your structure quotes"}
          </p>
        </div>
        <Button onClick={() => setShowCreate(true)} variant="brand" size="sm" className="gap-2 shrink-0">
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">New Quote</span>
          <span className="sm:hidden">New</span>
        </Button>
      </div>

      {/* Batch actions bar */}
      {selectedQuotes.size > 0 && (
        <div className="flex items-center gap-3 p-3 bg-primary/5 border border-primary/20 rounded-lg">
          <CheckSquare className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium">{selectedQuotes.size} quote{selectedQuotes.size > 1 ? "s" : ""} selected</span>
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5 ml-auto"
            disabled={batchExporting}
            onClick={async () => {
              setBatchExporting(true);
              try {
                const { generateProposalPDF } = await import("@/lib/pdfProposal");
                const selectedIds = Array.from(selectedQuotes);
                let exported = 0;
                for (const qId of selectedIds) {
                  const q = filteredQuotes?.find(x => x.id === qId);
                  if (!q) continue;
                  try {
                    const fullQuote = await utils.quotes.get.fetch({ id: qId });
                    if (!fullQuote) continue;
                    const items = await utils.components.getByQuote.fetch({ quoteId: qId });
                    const breakdown = await utils.quotes.getFinancialBreakdown.fetch({ id: qId });
                    const proposalData = {
                      quoteNumber: fullQuote.quoteNumber,
                      clientName: fullQuote.clientName,
                      clientEmail: fullQuote.clientEmail || "",
                      clientPhone: fullQuote.clientPhone || "",
                      siteAddress: fullQuote.siteAddress || "",
                      region: fullQuote.region || "",
                      designAdvisor: (fullQuote as any).designAdvisor || "",
                      date: new Date(fullQuote.updatedAt).toLocaleDateString(),
                      items: (items || []).map((it: any) => ({
                        description: it.description,
                        quantity: it.quantity,
                        unitPrice: it.unitPrice,
                        total: it.total,
                        category: it.category || "",
                      })),
                      subtotal: (fullQuote as any).subtotal || 0,
                      gst: (fullQuote as any).gst || 0,
                      grandTotal: (fullQuote as any).grandTotal || 0,
                      adjustments: [],
                      financialBreakdown: breakdown || undefined,
                    };
                    const pdfBytes = await generateProposalPDF(proposalData as any, "download");
                    exported++;
                  } catch (e) {
                    console.error(`Failed to export quote ${qId}:`, e);
                  }
                }
                toast.success(`Exported ${exported} of ${selectedIds.length} quote PDF${exported > 1 ? "s" : ""}`);
                setSelectedQuotes(new Set());
              } catch (e: any) {
                toast.error(e.message || "Batch export failed");
              } finally {
                setBatchExporting(false);
              }
            }}
          >
            <FileDown className="h-3.5 w-3.5" />
            {batchExporting ? "Exporting..." : "Export PDFs"}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSelectedQuotes(new Set())}>
            Clear
          </Button>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-2 sm:gap-3 items-center">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by client name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9 text-sm"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-36 h-9 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="sent">Sent</SelectItem>
            <SelectItem value="accepted">Accepted</SelectItem>
            <SelectItem value="lost">Lost</SelectItem>
          </SelectContent>
        </Select>
        {isAdmin && (
          <Select value={advisorFilter} onValueChange={setAdvisorFilter}>
            <SelectTrigger className="w-44 h-9 text-sm">
              <SelectValue placeholder="All Advisors" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Advisors</SelectItem>
              <AdvisorFilterOptions />
            </SelectContent>
          </Select>
        )}
        {isAdmin && branchesList && branchesList.length > 0 && (
          <Select value={branchFilter} onValueChange={setBranchFilter}>
            <SelectTrigger className="w-40 h-9 text-sm">
              <Building2 className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
              <SelectValue placeholder="All Branches" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Branches</SelectItem>
              {branchesList.map(b => (
                <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Button
          variant={showArchived ? "secondary" : "outline"}
          size="sm"
          className="gap-2 h-9"
          onClick={() => setShowArchived(!showArchived)}
        >
          <Archive className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">{showArchived ? "Showing Archived" : "Show Archived"}</span>
          <span className="sm:hidden">{showArchived ? "Archived" : "Archive"}</span>
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-9 w-9 p-0 shrink-0"
          onClick={() => {
            const next = viewMode === "list" ? "compact" : "list";
            setViewMode(next);
            localStorage.setItem("quoteListViewMode", next);
          }}
          title={viewMode === "list" ? "Switch to compact view" : "Switch to list view"}
        >
          {viewMode === "list" ? <LayoutGrid className="h-4 w-4" /> : <LayoutList className="h-4 w-4" />}
        </Button>
      </div>

      {/* Quote List */}
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Card key={i}><CardContent className="p-4"><Skeleton className="h-12 w-full" /></CardContent></Card>
          ))}
        </div>
      ) : !filteredQuotes || filteredQuotes.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <FileText className="h-12 w-12 text-muted-foreground/30 mx-auto mb-4" />
            <p className="text-sm text-muted-foreground">
              {showArchived ? "No archived quotes" : "No quotes found"}
            </p>
          </CardContent>
        </Card>
      ) : viewMode === "compact" ? (
        /* Compact grid view */
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
          {filteredQuotes.map(q => {
            const cfg = statusConfig[q.status];
            const isArchived = !!(q as any).archived;
            return (
              <Card
                key={q.id}
                className={`hover:shadow-sm transition-all cursor-pointer ${isArchived ? "opacity-70" : ""}`}
                onClick={() => setLocation(`/quotes/${q.id}`)}
              >
                <CardContent className="p-2.5 sm:p-3">
                  <p className="text-xs font-medium truncate">{q.clientName}</p>
                  <p className="text-[10px] text-muted-foreground truncate mt-0.5">{q.quoteNumber}</p>
                  <div className="flex items-center gap-1 mt-1.5 flex-wrap">
                    <Badge variant="outline" className={`text-[9px] px-1 py-0 ${cfg?.class || ""}`}>
                      {cfg?.label || q.status}
                    </Badge>
                    {(q as any).specWidth && (q as any).specLength && (
                      <span className="text-[9px] font-medium text-primary bg-primary/10 px-1 py-0 rounded">
                        {(parseFloat((q as any).specWidth) * parseFloat((q as any).specLength)).toFixed(1)}m²
                      </span>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        /* List view (default) */
        <div className="space-y-2">
          {filteredQuotes.map(q => {
            const cfg = statusConfig[q.status];
            const isArchived = !!(q as any).archived;
            return (
              <Card
                key={q.id}
                className={`hover:shadow-sm transition-all cursor-pointer group ${isArchived ? "opacity-70" : ""} ${selectedQuotes.has(q.id) ? "ring-2 ring-primary/40" : ""}`}
                onClick={() => setLocation(`/quotes/${q.id}`)}
              >
                <CardContent className="p-3 sm:p-4 flex items-start sm:items-center gap-3 sm:gap-4">
                  <div className="shrink-0 mt-0.5 sm:mt-0" onClick={(e) => e.stopPropagation()}>
                    <Checkbox
                      checked={selectedQuotes.has(q.id)}
                      onCheckedChange={(checked) => {
                        setSelectedQuotes(prev => {
                          const next = new Set(prev);
                          if (checked) next.add(q.id); else next.delete(q.id);
                          return next;
                        });
                      }}
                    />
                  </div>
                  <div className="h-9 w-9 sm:h-10 sm:w-10 rounded-lg bg-muted flex items-center justify-center shrink-0 mt-0.5 sm:mt-0">
                    <FileText className="h-4 w-4 sm:h-4.5 sm:w-4.5 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start sm:items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{q.clientName}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {q.quoteNumber} &middot; {q.siteAddress || q.suburb || "No address"}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="text-[11px] sm:text-xs text-muted-foreground whitespace-nowrap">
                          {new Date(q.updatedAt).toLocaleDateString()}
                        </span>
                        {(q as any).lastRevision && (
                          <p className="text-[10px] text-muted-foreground/70 mt-0.5 whitespace-nowrap">
                            {(q as any).lastRevision.action === "financial_update" ? "Financials" : (q as any).lastRevision.action === "status_change" ? "Status" : (q as any).lastRevision.action === "spec_update" ? "Spec" : (q as any).lastRevision.action === "recalculate" ? "Recalc" : (q as any).lastRevision.action === "revert" ? "Reverted" : "Modified"}
                            {" · "}{new Date((q as any).lastRevision.createdAt).toLocaleDateString()}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 mt-1.5">
                    {(q as any).specWidth && (q as any).specLength && (
                      <span className="text-[11px] sm:text-xs font-medium text-primary bg-primary/10 px-1.5 sm:px-2 py-0.5 rounded whitespace-nowrap">
                        {(parseFloat((q as any).specWidth) * parseFloat((q as any).specLength)).toFixed(1)} m²
                      </span>
                    )}
                    {(q as any).designAdvisor && (
                      <span className="text-[11px] sm:text-xs text-muted-foreground bg-muted px-1.5 sm:px-2 py-0.5 rounded whitespace-nowrap">
                        {(q as any).designAdvisor}
                      </span>
                    )}
                    <div className="flex items-center gap-1.5">
                      {isArchived && (
                        <Badge variant="outline" className="text-[11px] bg-amber-50 text-amber-700 border-amber-200">
                          Archived
                        </Badge>
                      )}
                      <Badge variant="outline" className={`text-[11px] ${cfg?.class || ""}`}>
                        {cfg?.label || q.status}
                      </Badge>
                      {(q as any).signwellStatus === "pending" && (
                        <Badge variant="outline" className="text-[11px] bg-orange-50 text-orange-700 border-orange-200 gap-0.5">
                          <PenLine className="h-2.5 w-2.5" />
                          Awaiting
                        </Badge>
                      )}
                      {(q as any).signwellStatus === "completed" && (
                        <Badge variant="outline" className="text-[11px] bg-green-50 text-green-700 border-green-200 gap-0.5">
                          <CheckCircle2 className="h-2.5 w-2.5" />
                          Signed
                        </Badge>
                      )}
                      {(q as any).signwellStatus === "declined" && (
                        <Badge variant="outline" className="text-[11px] bg-red-50 text-red-600 border-red-200 gap-0.5">
                          <XCircle className="h-2.5 w-2.5" />
                          Declined
                        </Badge>
                      )}
                      {(() => {
                        if (!(q as any).validUntil || q.status === "accepted" || q.status === "lost") return null;
                        const expiry = new Date((q as any).validUntil);
                        const now = new Date();
                        const daysLeft = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
                        if (daysLeft < 0) return (
                          <Badge variant="outline" className="text-[10px] bg-red-50 text-red-600 border-red-200 px-1 py-0">
                            Expired
                          </Badge>
                        );
                        if (daysLeft <= 7) return (
                          <Badge variant="outline" className="text-[10px] bg-orange-50 text-orange-600 border-orange-200 px-1 py-0">
                            {daysLeft}d left
                          </Badge>
                        );
                        return null;
                      })()}
                    </div>
                    </div>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                      <DropdownMenuItem onClick={() => duplicateMutation.mutate({ id: q.id })}>
                        <Copy className="mr-2 h-4 w-4" />
                        Duplicate
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => archiveMutation.mutate({ id: q.id, archived: !isArchived })}>
                        {isArchived ? <ArchiveRestore className="mr-2 h-4 w-4" /> : <Archive className="mr-2 h-4 w-4" />}
                        {isArchived ? "Restore" : "Archive"}
                      </DropdownMenuItem>
                      {isAdmin && (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => setDeleteQuoteTarget(q.id)}
                            className="text-destructive focus:text-destructive"
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Delete
                          </DropdownMenuItem>
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create Dialog */}
      <Dialog open={showCreate} onOpenChange={(open) => { setShowCreate(open); if (!open) setSelectedClient(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New Structure Quote</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label className="text-xs font-medium">Select Client *</Label>
              <p className="text-xs text-muted-foreground">Search for an existing client. New clients are created via CRM lead conversion.</p>
              <ClientPicker
                selectedClientId={selectedClient?.id || null}
                onClientSelect={(client) => {
                  setSelectedClient(client as any);
                  // Auto-populate design advisor from lead if available
                  if ((client as any).designAdvisor) {
                    setNewDesignAdvisor((client as any).designAdvisor);
                  }
                }}
                onClientClear={() => { setSelectedClient(null); setNewDesignAdvisor(""); setNewLocalCouncil(""); }}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-medium">Site Address</Label>
              <AddressAutocomplete
                value={siteAddress}
                onChange={setSiteAddress}
                onAddressSelect={(addr) => {
                  const fullAddr = addr.unitNumber
                    ? `${addr.unitNumber}/${addr.streetAddress}, ${addr.suburb} ${addr.state} ${addr.postcode}`
                    : addr.fullAddress;
                  setSiteAddress(fullAddr);
                  const detected = detectRegion(addr.postcode, addr.suburb, addr.state);
                  if (detected) setNewRegion(detected);
                }}
                placeholder="Site address (if different from client)"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-medium">Region</Label>
              <RegionSelect value={newRegion} onChange={setNewRegion} />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-medium">Design Advisor</Label>
              <DesignAdvisorSelect value={newDesignAdvisor} onChange={setNewDesignAdvisor} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)} size="sm">Cancel</Button>
            <Button
              onClick={() => {
                if (!selectedClient) return;
                createMutation.mutate({
                  clientId: selectedClient.id,
                  clientName: selectedClient.name,
                  clientPhone: selectedClient.phone || "",
                  clientEmail: selectedClient.email || "",
                  siteAddress: siteAddress || [selectedClient.address, selectedClient.suburb, selectedClient.state, selectedClient.postcode].filter(Boolean).join(", "),
                  region: newRegion,
                  designAdvisor: newDesignAdvisor || undefined,
                  localCouncil: newLocalCouncil || undefined,
                });
              }}
              disabled={!selectedClient || createMutation.isPending}
              size="sm"
            >
              {createMutation.isPending ? "Creating..." : "Create Quote"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ConfirmDeleteDialog
        open={deleteQuoteTarget !== null}
        onOpenChange={(o) => { if (!o) setDeleteQuoteTarget(null); }}
        onConfirm={() => { if (deleteQuoteTarget) { deleteMutation.mutate({ id: deleteQuoteTarget }); setDeleteQuoteTarget(null); } }}
        title="Delete Quote?"
        description="This will permanently delete this quote and all its data. This action cannot be undone."
      />
    </div>
  );
}

function AdvisorFilterOptions() {
  const { data: advisors } = trpc.designAdvisors.list.useQuery({});
  if (!advisors || advisors.length === 0) return null;
  return (
    <>
      {advisors.map((a) => (
        <SelectItem key={a.id} value={a.name}>{a.name}</SelectItem>
      ))}
    </>
  );
}
