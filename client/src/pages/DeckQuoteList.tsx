import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Plus, Search, FileText, MoreHorizontal, Copy, Trash2, Archive, ArchiveRestore, Building2, PenLine, CheckCircle2, XCircle, LayoutGrid, LayoutList, Clock } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import ConfirmDeleteDialog from "@/components/ConfirmDeleteDialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import ClientPicker from "@/components/ClientPicker";
import AddressAutocomplete from "@/components/AddressAutocomplete";
import DesignAdvisorSelect from "@/components/DesignAdvisorSelect";

export default function DeckQuoteList() {
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [search, setSearch] = useState("");
  const [advisorFilter, setAdvisorFilter] = useState("all");
  const [showArchived, setShowArchived] = useState(false);
  const [viewMode, setViewMode] = useState<"list" | "compact">(() => {
    return (localStorage.getItem("deckQuoteListViewMode") as "list" | "compact") || "list";
  });
  const [branchFilter, setBranchFilter] = useState("all");
  const [deleteQuoteTarget, setDeleteQuoteTarget] = useState<number | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [selectedClient, setSelectedClient] = useState<{ id: number; name: string; phone?: string | null; email?: string | null; address?: string | null; suburb?: string | null; state?: string | null; postcode?: string | null; company?: string | null } | null>(null);
  const [siteAddress, setSiteAddress] = useState("");
  const [newDesignAdvisor, setNewDesignAdvisor] = useState("");

  const utils = trpc.useUtils();
  const { data: quotes, isLoading } = trpc.deck.quotes.list.useQuery();
  const { data: lastOverrides } = trpc.deck.quotes.lastOverrides.useQuery(undefined, { enabled: isAdmin });
  // Build a map of quoteId -> last override info
  const overrideMap = new Map<number, { changedAt: Date; changedByName: string | null }>();
  lastOverrides?.forEach((o: any) => overrideMap.set(o.deckQuoteId, { changedAt: new Date(o.changedAt), changedByName: o.changedByName }));
  const createMutation = trpc.deck.quotes.create.useMutation({
    onSuccess: (data: any) => {
      toast.success(`Deck quote ${data.quoteNumber} created`);
      if (data.leadUnarchived) {
        toast.info("Lead was automatically unarchived");
      }
      setShowCreate(false);
      setSelectedClient(null);
      utils.deck.quotes.list.invalidate();
      navigate(`/deck-quotes/${data.id}`);
    },
    onError: (err) => toast.error(err.message),
  });
  const deleteMutation = trpc.deck.quotes.delete.useMutation({
    onSuccess: () => {
      toast.success("Deck quote deleted");
      utils.deck.quotes.list.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });
  const archiveMutation = trpc.deck.quotes.archive.useMutation({
    onSuccess: (_, vars) => {
      toast.success(vars.archived ? "Deck quote archived" : "Deck quote restored");
      utils.deck.quotes.list.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });
  const duplicateMutation = trpc.deck.quotes.duplicate.useMutation({
    onSuccess: (data) => {
      toast.success(`Deck quote duplicated as ${data.quoteNumber}`);
      utils.deck.quotes.list.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const { data: branchesList } = trpc.branches.list.useQuery();
  const { data: advisorsList } = trpc.designAdvisors.list.useQuery({});

  // Build a map from advisor name to branchId for branch filtering
  const advisorBranchMap = new Map<string, number>();
  advisorsList?.forEach(a => {
    if (a.branchId) advisorBranchMap.set(a.name, a.branchId);
  });

  const filteredQuotes = (quotes || []).filter((q: any) => {
    const isArchived = !!q.archived;
    if (showArchived ? !isArchived : isArchived) return false;
    if (advisorFilter !== "all" && q.designAdvisor !== advisorFilter) return false;
    // Branch filter: match if the quote's design advisor belongs to the selected branch
    if (branchFilter !== "all") {
      const branchId = parseInt(branchFilter);
      if (q.designAdvisor) {
        if (advisorBranchMap.get(q.designAdvisor) !== branchId) return false;
      } else {
        return false;
      }
    }
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      q.clientName?.toLowerCase().includes(s) ||
      q.quoteNumber?.toLowerCase().includes(s) ||
      q.siteAddress?.toLowerCase().includes(s)
    );
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Deck Quotes</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage deck quoting and pricing</p>
        </div>
        <Dialog open={showCreate} onOpenChange={setShowCreate}>
          <DialogTrigger asChild>
            <Button size="sm" variant="brand" className="gap-2"><Plus className="w-4 h-4" />New Deck Quote</Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader><DialogTitle>New Deck Quote</DialogTitle></DialogHeader>
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
                  onClientClear={() => { setSelectedClient(null); setNewDesignAdvisor(""); }}
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
                  }}
                  placeholder="Site address (if different from client)"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-medium">Design Advisor</Label>
                <DesignAdvisorSelect value={newDesignAdvisor} onChange={setNewDesignAdvisor} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowCreate(false)} size="sm">Cancel</Button>
              <Button size="sm" disabled={!selectedClient || createMutation.isPending} onClick={() => {
                if (!selectedClient) return;
                createMutation.mutate({
                  clientId: selectedClient.id,
                  clientName: selectedClient.name,
                  clientPhone: selectedClient.phone || "",
                  clientEmail: selectedClient.email || "",
                  clientCompany: selectedClient.company || "",
                  siteAddress: siteAddress || [selectedClient.address, selectedClient.suburb, selectedClient.state, selectedClient.postcode].filter(Boolean).join(", "),
                  designAdvisor: newDesignAdvisor || undefined,
                });
              }}>
                {createMutation.isPending ? "Creating..." : "Create Deck Quote"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Filters */}
      <div className="flex gap-3 items-center">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input className="pl-9 h-9 text-sm" placeholder="Search deck quotes..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        {isAdmin && (
          <Select value={advisorFilter} onValueChange={setAdvisorFilter}>
            <SelectTrigger className="w-44 h-9 text-sm">
              <SelectValue placeholder="All Advisors" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Advisors</SelectItem>
              <DeckAdvisorFilterOptions />
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
            localStorage.setItem("deckQuoteListViewMode", next);
          }}
          title={viewMode === "list" ? "Switch to compact view" : "Switch to list view"}
        >
          {viewMode === "list" ? <LayoutGrid className="h-4 w-4" /> : <LayoutList className="h-4 w-4" />}
        </Button>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="flex items-center justify-center h-32"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>
      ) : filteredQuotes.length === 0 ? (
        <Card><CardContent className="p-12 text-center text-muted-foreground">
          <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <p>{showArchived ? "No archived deck quotes" : "No deck quotes found"}</p>
        </CardContent></Card>
      ) : viewMode === "compact" ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
          {filteredQuotes.map((q: any) => {
            const isArchived = !!q.archived;
            return (
              <Card key={q.id} className={`cursor-pointer hover:shadow-sm transition-all ${isArchived ? "opacity-70" : ""}`} onClick={() => navigate(`/deck-quotes/${q.id}`)}>
                <CardContent className="p-2.5 sm:p-3">
                  <p className="text-xs font-medium truncate">{q.clientName}</p>
                  <p className="text-[10px] text-muted-foreground truncate mt-0.5">{q.quoteNumber}</p>
                  <div className="flex items-center gap-1 mt-1.5 flex-wrap">
                    <Badge variant="outline" className={`text-[9px] px-1 py-0 capitalize ${
                      q.status === "accepted" ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
                      q.status === "sent" ? "bg-blue-50 text-blue-700 border-blue-200" :
                      q.status === "lost" ? "bg-red-50 text-red-600 border-red-200" :
                      "bg-muted text-muted-foreground"
                    }`}>{q.status}</Badge>
                    {q.sellPriceIncGst && (
                      <span className="text-[9px] font-medium">${parseFloat(q.sellPriceIncGst).toLocaleString("en-AU", { minimumFractionDigits: 0 })}</span>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <div className="space-y-2">
          {filteredQuotes.map((q: any) => {
            const isArchived = !!q.archived;
            return (
              <Card key={q.id} className={`cursor-pointer hover:shadow-sm transition-all group ${isArchived ? "opacity-70" : ""}`} onClick={() => navigate(`/deck-quotes/${q.id}`)}>
                <CardContent className="p-3 sm:p-4 flex items-start sm:items-center gap-3 sm:gap-4">
                  <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-0.5 sm:mt-0">
                    <FileText className="w-4 h-4 sm:w-4.5 sm:h-4.5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start sm:items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{q.clientName}</p>
                        <p className="text-xs text-muted-foreground truncate">{q.quoteNumber} &middot; {q.siteAddress || "No address"}</p>
                      </div>
                      <span className="text-[11px] sm:text-xs text-muted-foreground whitespace-nowrap shrink-0">
                        {new Date(q.updatedAt).toLocaleDateString()}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 mt-1.5">
                    {(q as any).designAdvisor && (
                      <span className="text-[11px] sm:text-xs text-muted-foreground bg-muted px-1.5 sm:px-2 py-0.5 rounded whitespace-nowrap">
                        {(q as any).designAdvisor}
                      </span>
                    )}
                    <div className="flex items-center gap-1.5">
                      {isArchived && (
                        <Badge variant="outline" className="text-[11px] bg-amber-50 text-amber-700 border-amber-200">Archived</Badge>
                      )}
                      {q.sellPriceIncGst && (
                        <span className="text-xs font-medium">${parseFloat(q.sellPriceIncGst).toLocaleString("en-AU", { minimumFractionDigits: 2 })}</span>
                      )}
                      <Badge variant="outline" className={`text-[11px] capitalize ${
                        q.status === "accepted" ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
                        q.status === "sent" ? "bg-blue-50 text-blue-700 border-blue-200" :
                        q.status === "lost" ? "bg-red-50 text-red-600 border-red-200" :
                        "bg-muted text-muted-foreground"
                      }`}>{q.status}</Badge>
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
                      {isAdmin && overrideMap.has(q.id) && (() => {
                        const ov = overrideMap.get(q.id)!;
                        const daysAgo = Math.floor((Date.now() - ov.changedAt.getTime()) / 86400000);
                        const label = daysAgo === 0 ? "today" : daysAgo === 1 ? "1d ago" : `${daysAgo}d ago`;
                        return (
                          <Badge variant="outline" className="text-[11px] bg-purple-50 text-purple-700 border-purple-200 gap-0.5" title={`Last override by ${ov.changedByName || "Unknown"} on ${ov.changedAt.toLocaleDateString("en-AU")}`}>
                            <Clock className="h-2.5 w-2.5" />
                            Override {label}
                          </Badge>
                        );
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
      <ConfirmDeleteDialog
        open={deleteQuoteTarget !== null}
        onOpenChange={(o) => { if (!o) setDeleteQuoteTarget(null); }}
        onConfirm={() => { if (deleteQuoteTarget) { deleteMutation.mutate({ id: deleteQuoteTarget }); setDeleteQuoteTarget(null); } }}
        title="Delete Deck Quote?"
        description="This will permanently delete this deck quote and all its data. This action cannot be undone."
      />
    </div>
  );
}

function DeckAdvisorFilterOptions() {
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
