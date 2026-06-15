import { useState, useEffect, useRef, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MapView } from "@/components/Map";
import { Loader2, Plus, Trash2, Search, Crosshair, MapPin, Building2, AlertTriangle, RefreshCw, Eye } from "lucide-react";
import { toast } from "sonner";

export default function DaTrackerCompetitors() {
  const [branch, setBranch] = useState<"act" | "nsw">("act");
  const [activeTab, setActiveTab] = useState("search");
  const [searchCompany, setSearchCompany] = useState("");
  const [searchSuburb, setSearchSuburb] = useState("");
  const [selectedCompetitor, setSelectedCompetitor] = useState("");
  const [newCompanyName, setNewCompanyName] = useState("");
  const [newCompanyColour, setNewCompanyColour] = useState("#ef4444");
  const [addDialogOpen, setAddDialogOpen] = useState(false);

  // Reset tab when switching branch
  const handleBranchChange = (b: string) => {
    setBranch(b as "act" | "nsw");
    if (b === "act") setActiveTab("search");
    else setActiveTab("nsw-lost");
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Competitor Intelligence</h1>
          <p className="text-muted-foreground text-sm">
            Track competitor DAs and identify lost opportunities
          </p>
        </div>
      </div>

      {/* Branch selector */}
      <Tabs value={branch} onValueChange={handleBranchChange}>
        <TabsList>
          <TabsTrigger value="act" className="font-semibold">ACT</TabsTrigger>
          <TabsTrigger value="nsw" className="font-semibold">NSW</TabsTrigger>
          <TabsTrigger value="watchlist" className="font-semibold">Watchlist</TabsTrigger>
        </TabsList>

        {/* ACT Branch */}
        <TabsContent value="act" className="space-y-4">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList>
              <TabsTrigger value="search">DA Search</TabsTrigger>
              <TabsTrigger value="lost">Lost to Competitor</TabsTrigger>
              <TabsTrigger value="matching">Client Matching</TabsTrigger>
              <TabsTrigger value="market">Suburb Market Share</TabsTrigger>
            </TabsList>

            <TabsContent value="search" className="space-y-4">
              <CompetitorDaSearch />
            </TabsContent>
            <TabsContent value="lost" className="space-y-4">
              <LostToCompetitor />
            </TabsContent>
            <TabsContent value="matching" className="space-y-4">
              <ClientMatching />
            </TabsContent>
            <TabsContent value="market" className="space-y-4">
              <SuburbMarketShare />
            </TabsContent>
          </Tabs>
        </TabsContent>

        {/* NSW Branch */}
        <TabsContent value="nsw" className="space-y-4">
          <NswCompetitorBranch />
        </TabsContent>

        {/* Shared Watchlist */}
        <TabsContent value="watchlist" className="space-y-4">
          <CompetitorWatchlist />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ─── NSW Competitor Branch ──────────────────────────────────────────────────

function NswCompetitorBranch() {
  const [nswTab, setNswTab] = useState("nsw-lost");

  const stats = trpc.nswDa.nswCompetitorStats.useQuery();

  return (
    <div className="space-y-4">
      {/* NSW Stats Summary */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-4">
            <p className="text-2xl font-bold text-red-600">{stats.data?.totalCompetitorDas || 0}</p>
            <p className="text-sm text-muted-foreground">Competitor DAs</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-2xl font-bold">{stats.data?.uniqueCompetitors || 0}</p>
            <p className="text-sm text-muted-foreground">Unique Competitors</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-sm font-medium mb-2">Top Competitors (NSW)</p>
            {stats.data?.topCompetitors?.slice(0, 5).map((c: any, i: number) => (
              <div key={i} className="flex justify-between text-sm">
                <span className="truncate">{c.companyName}</span>
                <Badge variant="destructive" className="ml-2">{c.count}</Badge>
              </div>
            ))}
            {(!stats.data?.topCompetitors || stats.data.topCompetitors.length === 0) && (
              <p className="text-xs text-muted-foreground">No competitor DAs found yet. Run a T1Cloud scrape first.</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* NSW Sub-tabs */}
      <Tabs value={nswTab} onValueChange={setNswTab}>
        <TabsList>
          <TabsTrigger value="nsw-lost">Lost to Competitor</TabsTrigger>
          <TabsTrigger value="nsw-market">Suburb Market Share</TabsTrigger>
        </TabsList>

        <TabsContent value="nsw-lost" className="space-y-4">
          <NswLostToCompetitor />
        </TabsContent>
        <TabsContent value="nsw-market" className="space-y-4">
          <NswSuburbMarketShare />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ─── NSW Lost to Competitor ─────────────────────────────────────────────────

function NswLostToCompetitor() {
  const [filter, setFilter] = useState<"all" | "unattributed">("all");
  const [councilFilter, setCouncilFilter] = useState("");
  const [companyFilter, setCompanyFilter] = useState("");

  const { data, isLoading } = trpc.nswDa.nswLostToCompetitor.useQuery({
    limit: 100,
    unattributed: filter === "unattributed",
    council: councilFilter || undefined,
    companyName: companyFilter || undefined,
  });

  const filters = trpc.nswDa.filters.useQuery();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant={filter === "all" ? "default" : "outline"}
          onClick={() => setFilter("all")}
        >
          Confirmed Competitors
        </Button>
        <Button
          size="sm"
          variant={filter === "unattributed" ? "default" : "outline"}
          onClick={() => setFilter("unattributed")}
        >
          <AlertTriangle className="w-3 h-3 mr-1" />
          Unattributed
        </Button>
        <Select value={councilFilter || "__all__"} onValueChange={(v) => setCouncilFilter(v === "__all__" ? "" : v)}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="All Councils" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All Councils</SelectItem>
            {filters.data?.councils?.map(c => (
              <SelectItem key={c} value={c}>{c}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {filter === "all" && (
          <Input
            placeholder="Filter by company..."
            value={companyFilter}
            onChange={(e) => setCompanyFilter(e.target.value)}
            className="w-48"
          />
        )}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-8"><Loader2 className="animate-spin" /></div>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>DA Number</TableHead>
                  <TableHead>Council</TableHead>
                  <TableHead>Address</TableHead>
                  <TableHead>Applicant</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Lodged</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data?.items?.map((da: any) => (
                  <TableRow key={da.id}>
                    <TableCell className="font-mono text-xs">{da.daNumber}</TableCell>
                    <TableCell className="text-xs">{da.councilName}</TableCell>
                    <TableCell className="text-sm">{da.fullAddress}</TableCell>
                    <TableCell>
                      {da.applicantName ? (
                        <Badge variant="destructive">{da.applicantName}</Badge>
                      ) : (
                        <span className="text-muted-foreground text-xs">Unknown</span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs">{da.relevantCategory || da.developmentType}</TableCell>
                    <TableCell className="text-xs">
                      {da.lodgementDate ? new Date(da.lodgementDate).toLocaleDateString() : '—'}
                    </TableCell>
                  </TableRow>
                ))}
                {(!data?.items || data.items.length === 0) && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                      {filter === "unattributed" 
                        ? "No unattributed DAs. All relevant NSW DAs have applicant names."
                        : "No competitor DAs found. Run a T1Cloud scrape and ensure competitors are in the Watchlist."}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
      <p className="text-xs text-muted-foreground">
        Showing {data?.items?.length || 0} of {data?.total || 0} results
      </p>
    </div>
  );
}

// ─── NSW Suburb Market Share ────────────────────────────────────────────────

function NswSuburbMarketShare() {
  const [councilFilter, setCouncilFilter] = useState("");
  const { data, isLoading } = trpc.nswDa.nswSuburbBreakdown.useQuery({
    council: councilFilter || undefined,
  });
  const filters = trpc.nswDa.filters.useQuery();

  // Group by suburb, aggregate companies
  const suburbData = useMemo(() => {
    if (!data || data.length === 0) return [];
    const suburbMap = new Map<string, { suburb: string; companies: { name: string; count: number }[]; total: number }>();
    for (const row of data) {
      const existing = suburbMap.get(row.suburb) || { suburb: row.suburb, companies: [], total: 0 };
      existing.companies.push({ name: row.company, count: row.count });
      existing.total += row.count;
      suburbMap.set(row.suburb, existing);
    }
    return Array.from(suburbMap.values()).sort((a, b) => b.total - a.total).slice(0, 20);
  }, [data]);

  if (isLoading) return <div className="flex justify-center py-8"><Loader2 className="animate-spin" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Select value={councilFilter || "__all__"} onValueChange={(v) => setCouncilFilter(v === "__all__" ? "" : v)}>
          <SelectTrigger className="w-64">
            <SelectValue placeholder="All Councils" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All Councils</SelectItem>
            {filters.data?.councils?.map(c => (
              <SelectItem key={c} value={c}>{c}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {suburbData.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            No competitor suburb data available. Run a T1Cloud scrape and ensure competitors are in the Watchlist.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Competitor DAs by Suburb (NSW)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {suburbData.map(s => (
                <div key={s.suburb}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="font-medium">{s.suburb}</span>
                    <span className="text-muted-foreground">{s.total} DAs</span>
                  </div>
                  <div className="flex h-5 rounded overflow-hidden bg-muted">
                    {s.companies.map((c, i) => (
                      <div
                        key={i}
                        className="h-full flex items-center justify-center text-[10px] text-white font-medium"
                        style={{
                          width: `${(c.count / s.total) * 100}%`,
                          backgroundColor: `hsl(${(i * 47) % 360}, 65%, 45%)`,
                        }}
                        title={`${c.name}: ${c.count}`}
                      >
                        {c.count > 1 ? c.name.split(' ')[0] : ''}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── DA Search Tab ──────────────────────────────────────────────────────────

function CompetitorDaSearch() {
  const [companySearch, setCompanySearch] = useState("");
  const [suburbFilter, setSuburbFilter] = useState("");
  const [activeSearch, setActiveSearch] = useState("");
  const [activeSuburb, setActiveSuburb] = useState("");
  const mapRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<google.maps.Marker[]>([]);

  const { data: watchlist } = trpc.competitorIntel.watchlist.list.useQuery();

  const { data: results, isLoading, isFetching } = trpc.competitorIntel.searchByCompany.useQuery(
    { companyName: activeSearch, suburb: activeSuburb || undefined, limit: 200 },
    { enabled: !!activeSearch }
  );

  const handleSearch = () => {
    if (companySearch.trim()) {
      setActiveSearch(companySearch.trim());
      setActiveSuburb(suburbFilter.trim());
    }
  };

  const handleQuickSelect = (name: string) => {
    setCompanySearch(name);
    setActiveSearch(name);
    setActiveSuburb("");
    setSuburbFilter("");
  };

  // Update map markers
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !results) return;

    markersRef.current.forEach(m => m.setMap(null));
    markersRef.current = [];

    if (results.length === 0) return;

    const bounds = new google.maps.LatLngBounds();
    for (const da of results) {
      if (!da.centroidLat || !da.centroidLng) continue;
      const pos = { lat: da.centroidLat, lng: da.centroidLng };
      bounds.extend(pos);

      const marker = new google.maps.Marker({
        position: pos,
        map,
        title: `DA ${da.daNumber} - ${da.suburb}`,
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 7,
          fillColor: "#ef4444",
          fillOpacity: 0.8,
          strokeColor: "#fff",
          strokeWeight: 2,
        },
      });

      const infoWindow = new google.maps.InfoWindow({
        content: `<div style="padding:8px;max-width:280px;">
          <strong>DA ${da.daNumber}</strong><br/>
          <span style="color:#666">${da.companyOrgName || "Unknown"}</span><br/>
          <span>${da.streetAddress || ""}, ${da.suburb || ""}</span><br/>
          <small>${da.proposalText?.substring(0, 150) || ""}...</small>
        </div>`,
      });

      marker.addListener("click", () => infoWindow.open(map, marker));
      markersRef.current.push(marker);
    }

    if (markersRef.current.length > 0) {
      map.fitBounds(bounds);
    }
  }, [results]);

  const handleMapReady = (map: google.maps.Map) => {
    mapRef.current = map;
    map.setCenter({ lat: -35.2809, lng: 149.1300 });
    map.setZoom(12);
  };

  return (
    <>
      {/* Quick select from watchlist */}
      {watchlist && watchlist.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          {watchlist.filter(w => w.active).map(w => (
            <Button
              key={w.id}
              variant={activeSearch === w.companyName ? "default" : "outline"}
              size="sm"
              onClick={() => handleQuickSelect(w.companyName)}
              style={{ borderColor: w.colour || undefined }}
            >
              <div className="w-2 h-2 rounded-full mr-1.5" style={{ backgroundColor: w.colour || "#ef4444" }} />
              {w.companyName}
            </Button>
          ))}
        </div>
      )}

      {/* Search bar */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex gap-3 flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Company/Org name..."
                value={companySearch}
                onChange={(e) => setCompanySearch(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                className="pl-9"
              />
            </div>
            <Input
              placeholder="Suburb filter..."
              value={suburbFilter}
              onChange={(e) => setSuburbFilter(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              className="w-[160px]"
            />
            <Button onClick={handleSearch} disabled={!companySearch.trim()}>
              <Search className="h-4 w-4 mr-1" /> Search
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Results */}
      {isLoading || isFetching ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin mr-2" />
          <span>Querying ACT DA Register...</span>
        </div>
      ) : results && results.length > 0 ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Map */}
          <Card className="lg:col-span-1">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">
                {results.length} DAs found for "{activeSearch}"
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="h-[400px]">
                <MapView onMapReady={handleMapReady} />
              </div>
            </CardContent>
          </Card>

          {/* Table */}
          <Card className="lg:col-span-1 overflow-hidden">
            <CardContent className="p-0">
              <div className="max-h-[450px] overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>DA #</TableHead>
                      <TableHead>Suburb</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Stage</TableHead>
                      <TableHead>Proposal</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {results.map((da, i) => (
                      <TableRow key={`${da.daNumber}-${i}`}>
                        <TableCell className="font-mono text-xs">{da.daNumber}</TableCell>
                        <TableCell className="text-xs">{da.suburb}</TableCell>
                        <TableCell className="text-xs whitespace-nowrap">
                          {da.lodgementDate ? new Date(da.lodgementDate).toLocaleDateString("en-AU") : "—"}
                        </TableCell>
                        <TableCell>
                          <Badge variant={da.daStage === "Decided" ? "secondary" : "default"} className="text-[10px]">
                            {da.daStage || "—"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs max-w-[200px] truncate" title={da.proposalText || ""}>
                          {da.proposalText?.substring(0, 80) || "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : activeSearch ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            No DAs found for "{activeSearch}"
          </CardContent>
        </Card>
      ) : null}
    </>
  );
}

// ─── Lost to Competitor Tab ─────────────────────────────────────────────────

function LostToCompetitor() {
  const [companyFilter, setCompanyFilter] = useState("");
  const [showUnattributed, setShowUnattributed] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [builderInput, setBuilderInput] = useState("");

  const utils = trpc.useUtils();
  const { data: matchStats } = trpc.competitorIntel.clientMatches.stats.useQuery();
  const { data: lostData, isLoading } = trpc.competitorIntel.clientMatches.lostToCompetitor.useQuery({
    limit: 100,
    companyName: (!showUnattributed && companyFilter) || undefined,
    unattributed: showUnattributed || undefined,
  });

  const assignBuilderMutation = trpc.competitorIntel.clientMatches.assignBuilder.useMutation({
    onSuccess: () => {
      utils.competitorIntel.clientMatches.lostToCompetitor.invalidate();
      utils.competitorIntel.clientMatches.stats.invalidate();
      setEditingId(null);
      setBuilderInput("");
      toast.success("Builder assigned");
    },
  });

  return (
    <>
      {/* Stats Cards */}
      {matchStats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="text-2xl font-bold">{matchStats.totalMatches}</div>
              <div className="text-xs text-muted-foreground">Total DA Matches</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="text-2xl font-bold text-green-600">{matchStats.oursCount}</div>
              <div className="text-xs text-muted-foreground">Our DAs Matched</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="text-2xl font-bold text-red-600">{matchStats.competitorCount}</div>
              <div className="text-xs text-muted-foreground">Lost to Competitors</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="text-2xl font-bold">{matchStats.topCompetitors?.[0]?.companyName || "—"}</div>
              <div className="text-xs text-muted-foreground">Top Competitor</div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Top Competitors breakdown */}
      {matchStats?.topCompetitors && matchStats.topCompetitors.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Competitors by Lost Jobs</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2 flex-wrap">
              <Button
                variant={!showUnattributed && companyFilter === "" ? "default" : "outline"}
                size="sm"
                onClick={() => { setCompanyFilter(""); setShowUnattributed(false); }}
              >
                All ({matchStats.competitorCount})
              </Button>
              <Button
                variant={showUnattributed ? "default" : "outline"}
                size="sm"
                className={showUnattributed ? "bg-amber-600 hover:bg-amber-700" : "border-amber-400 text-amber-700"}
                onClick={() => { setShowUnattributed(!showUnattributed); setCompanyFilter(""); }}
              >
                Unattributed
              </Button>
              {matchStats.topCompetitors.map(c => (
                <Button
                  key={c.companyName}
                  variant={!showUnattributed && companyFilter === c.companyName ? "default" : "outline"}
                  size="sm"
                  onClick={() => { setCompanyFilter(c.companyName || ""); setShowUnattributed(false); }}
                >
                  {c.companyName} ({c.count})
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Lost jobs list */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : lostData && lostData.items.length > 0 ? (
        <Card>
          {showUnattributed && (
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-amber-700">Unattributed DAs — assign a builder after analysis</CardTitle>
            </CardHeader>
          )}
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>DA #</TableHead>
                  <TableHead>Competitor</TableHead>
                  <TableHead>Address</TableHead>
                  <TableHead>Suburb</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Stage</TableHead>
                  <TableHead>Match</TableHead>
                  <TableHead>Proposal</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lostData.items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-mono text-xs">{item.daNumber}</TableCell>
                    <TableCell className="text-xs">
                      {editingId === item.id ? (
                        <div className="flex gap-1 items-center">
                          <input
                            type="text"
                            value={builderInput}
                            onChange={(e) => setBuilderInput(e.target.value)}
                            placeholder="Builder name..."
                            className="border rounded px-1 py-0.5 text-xs w-28"
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === "Enter" && builderInput.trim()) {
                                assignBuilderMutation.mutate({ id: item.id, companyName: builderInput.trim() });
                              } else if (e.key === "Escape") {
                                setEditingId(null);
                              }
                            }}
                          />
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-5 w-5 p-0"
                            onClick={() => {
                              if (builderInput.trim()) {
                                assignBuilderMutation.mutate({ id: item.id, companyName: builderInput.trim() });
                              }
                            }}
                          >
                            ✓
                          </Button>
                        </div>
                      ) : item.companyName ? (
                        <span className="font-medium text-red-600">{item.companyName}</span>
                      ) : (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-5 text-xs text-amber-600 hover:text-amber-800 px-1"
                          onClick={() => { setEditingId(item.id); setBuilderInput(""); }}
                        >
                          + Assign builder
                        </Button>
                      )}
                    </TableCell>
                    <TableCell className="text-xs">{item.streetAddress}</TableCell>
                    <TableCell className="text-xs">{item.suburb}</TableCell>
                    <TableCell className="text-xs whitespace-nowrap">
                      {item.lodgementDate ? new Date(item.lodgementDate).toLocaleDateString("en-AU") : "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={item.daStage === "Decided" ? "secondary" : "default"} className="text-[10px]">
                        {item.daStage || "—"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={`text-[10px] ${
                          item.matchConfidence === "high" ? "border-green-500 text-green-700" :
                          item.matchConfidence === "medium" ? "border-yellow-500 text-yellow-700" :
                          "border-gray-400 text-gray-600"
                        }`}
                      >
                        {item.matchType} / {item.matchConfidence}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs max-w-[200px] truncate" title={item.proposalText || ""}>
                      {item.proposalText?.substring(0, 80) || "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            <AlertTriangle className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>{showUnattributed ? "No unattributed DAs found." : "No competitor matches found yet."}</p>
            <p className="text-xs mt-1">{showUnattributed ? "All competitor DAs have a builder assigned." : 'Run client matching from the "Client Matching" tab to discover lost opportunities.'}</p>
          </CardContent>
        </Card>
      )}
    </>
  );
}

// ─── Watchlist Tab ──────────────────────────────────────────────────────────

function CompetitorWatchlist() {
  const [newName, setNewName] = useState("");
  const [newColour, setNewColour] = useState("#ef4444");
  const [newNotes, setNewNotes] = useState("");

  const utils = trpc.useUtils();
  const { data: watchlist, isLoading } = trpc.competitorIntel.watchlist.list.useQuery();
  const { data: stats, isLoading: statsLoading } = trpc.competitorIntel.competitorStats.useQuery();

  const addMutation = trpc.competitorIntel.watchlist.create.useMutation({
    onSuccess: () => {
      utils.competitorIntel.watchlist.list.invalidate();
      utils.competitorIntel.competitorStats.invalidate();
      setNewName("");
      setNewNotes("");
      toast.success("Competitor added to watchlist");
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteMutation = trpc.competitorIntel.watchlist.delete.useMutation({
    onSuccess: () => {
      utils.competitorIntel.watchlist.list.invalidate();
      utils.competitorIntel.competitorStats.invalidate();
      toast.success("Competitor removed");
    },
  });

  const toggleMutation = trpc.competitorIntel.watchlist.update.useMutation({
    onSuccess: () => {
      utils.competitorIntel.watchlist.list.invalidate();
    },
  });

  const handleAdd = () => {
    if (!newName.trim()) return;
    addMutation.mutate({ companyName: newName.trim(), colour: newColour, notes: newNotes || undefined });
  };

  return (
    <>
      {/* Add new competitor */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Add Competitor</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-3 items-end flex-wrap">
            <div className="flex-1 min-w-[200px]">
              <label className="text-xs text-muted-foreground mb-1 block">Company Name (as it appears on DAs)</label>
              <Input
                placeholder="e.g. Create Build Enjoy"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAdd()}
              />
            </div>
            <div className="w-[120px]">
              <label className="text-xs text-muted-foreground mb-1 block">Colour</label>
              <Input
                type="color"
                value={newColour}
                onChange={(e) => setNewColour(e.target.value)}
                className="h-9 p-1"
              />
            </div>
            <div className="w-[200px]">
              <label className="text-xs text-muted-foreground mb-1 block">Notes (optional)</label>
              <Input
                placeholder="Notes..."
                value={newNotes}
                onChange={(e) => setNewNotes(e.target.value)}
              />
            </div>
            <Button onClick={handleAdd} disabled={!newName.trim() || addMutation.isPending}>
              <Plus className="h-4 w-4 mr-1" /> Add
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Watchlist with stats */}
      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Colour</TableHead>
                  <TableHead>Company Name</TableHead>
                  <TableHead>Notes</TableHead>
                  <TableHead>Total DAs</TableHead>
                  <TableHead>This Year</TableHead>
                  <TableHead>Active Suburbs</TableHead>
                  <TableHead>Active</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {watchlist?.map(w => {
                  const stat = stats?.find(s => s.id === w.id);
                  return (
                    <TableRow key={w.id}>
                      <TableCell>
                        <div className="w-4 h-4 rounded-full" style={{ backgroundColor: w.colour || "#ef4444" }} />
                      </TableCell>
                      <TableCell className="font-medium">{w.companyName}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{w.notes || "—"}</TableCell>
                      <TableCell className="font-mono">
                        {statsLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : stat?.totalDas || "—"}
                      </TableCell>
                      <TableCell className="font-mono">
                        {statsLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : stat?.dasThisYear || "—"}
                      </TableCell>
                      <TableCell className="text-xs max-w-[200px] truncate">
                        {stat?.suburbs?.slice(0, 5).join(", ") || "—"}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={w.active ? "default" : "secondary"}
                          className="cursor-pointer text-[10px]"
                          onClick={() => toggleMutation.mutate({ id: w.id, active: !w.active })}
                        >
                          {w.active ? "Active" : "Paused"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive"
                          onClick={() => {
                            if (confirm(`Remove "${w.companyName}" from watchlist?`)) {
                              deleteMutation.mutate({ id: w.id });
                            }
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </>
  );
}

// ─── Client Matching Tab ────────────────────────────────────────────────────

function ClientMatching() {
  const utils = trpc.useUtils();
  const { data: matchStats } = trpc.competitorIntel.clientMatches.stats.useQuery();

  const runMatchMutation = trpc.competitorIntel.clientMatches.runMatch.useMutation({
    onSuccess: (result) => {
      utils.competitorIntel.clientMatches.stats.invalidate();
      utils.competitorIntel.clientMatches.lostToCompetitor.invalidate();
      toast.success(`Matching complete: ${result.matched} matches found, ${result.skipped} skipped${result.errors.length > 0 ? `, ${result.errors.length} errors` : ""}`);
    },
    onError: (err) => toast.error(`Matching failed: ${err.message}`),
  });

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Client-DA Address Matching</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            This process searches the ACT DA Register for development applications at the same addresses as your leads and quotes.
            It identifies which DAs are yours (Spanline) and which belong to competitors — revealing lost opportunities.
          </p>

          <div className="flex gap-3">
            <Button
              onClick={() => runMatchMutation.mutate({ forceRefresh: false })}
              disabled={runMatchMutation.isPending}
            >
              {runMatchMutation.isPending ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Running...</>
              ) : (
                <><RefreshCw className="h-4 w-4 mr-2" /> Run Matching (New Only)</>
              )}
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                if (confirm("This will re-check ALL leads and quotes against the DA register. This may take a while. Continue?")) {
                  runMatchMutation.mutate({ forceRefresh: true });
                }
              }}
              disabled={runMatchMutation.isPending}
            >
              <RefreshCw className="h-4 w-4 mr-2" /> Force Full Refresh
            </Button>
          </div>

          {runMatchMutation.isPending && (
            <div className="bg-muted/50 rounded-md p-4 text-sm">
              <Loader2 className="h-4 w-4 animate-spin inline mr-2" />
              Querying ACT DA Register for each lead/quote address... This may take a few minutes.
            </div>
          )}
        </CardContent>
      </Card>

      {/* Current stats */}
      {matchStats && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Match Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <div className="text-xl font-bold">{matchStats.totalMatches}</div>
                <div className="text-xs text-muted-foreground">Total Matches</div>
              </div>
              <div>
                <div className="text-xl font-bold text-green-600">{matchStats.oursCount}</div>
                <div className="text-xs text-muted-foreground">Our DAs</div>
              </div>
              <div>
                <div className="text-xl font-bold text-red-600">{matchStats.competitorCount}</div>
                <div className="text-xs text-muted-foreground">Competitor DAs</div>
              </div>
              <div>
                <div className="text-xl font-bold">{matchStats.topCompetitors?.length || 0}</div>
                <div className="text-xs text-muted-foreground">Unique Competitors</div>
              </div>
            </div>

            {matchStats.topCompetitors && matchStats.topCompetitors.length > 0 && (
              <div className="mt-4 pt-4 border-t">
                <h4 className="text-xs font-medium text-muted-foreground mb-2">Top Competitors (by lost jobs)</h4>
                <div className="space-y-1">
                  {matchStats.topCompetitors.map((c, i) => (
                    <div key={c.companyName} className="flex items-center justify-between text-sm">
                      <span>{i + 1}. {c.companyName}</span>
                      <Badge variant="destructive" className="text-[10px]">{c.count} lost</Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* How it works */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">How Matching Works</CardTitle>
        </CardHeader>
        <CardContent className="text-xs text-muted-foreground space-y-2">
          <p><strong>1. Address Match:</strong> Each lead/quote address is searched against the ACT DA Register (DAFINDER_LIST_VIEW). If a DA exists at the same street address and suburb, it's linked.</p>
          <p><strong>2. Name Match:</strong> The applicant name on the DA is compared against the lead/client name for additional confirmation.</p>
          <p><strong>3. Company Check:</strong> If the DA was lodged by "Spanline Home Additions", it's tagged as ours. Otherwise, it's tagged as a competitor DA.</p>
          <p><strong>4. Confidence:</strong> "High" = both address and name match. "Medium" = address + suburb match. "Low" = partial address match only.</p>
        </CardContent>
      </Card>
    </>
  );
}

// ─── Suburb Market Share Tab ────────────────────────────────────────────────
/**
 * Suburb Market Share — shows actual DA counts by suburb × company
 * using the suburbBreakdown endpoint for real grouped data.
 */
function SuburbMarketShare() {
  const { data: breakdown, isLoading } = trpc.competitorIntel.suburbBreakdown.useQuery();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!breakdown || breakdown.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          <Building2 className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p>No competitor data yet. Add companies to your watchlist first.</p>
        </CardContent>
      </Card>
    );
  }

  // Build suburb → { company → count } map from real data
  const suburbCountMap = new Map<string, Map<string, { count: number; colour: string }>>();
  const companies = new Map<string, string>();
  for (const row of breakdown) {
    if (!suburbCountMap.has(row.suburb)) {
      suburbCountMap.set(row.suburb, new Map());
    }
    suburbCountMap.get(row.suburb)!.set(row.company, { count: row.count, colour: row.colour });
    companies.set(row.company, row.colour);
  }

  // Sort suburbs by total DA count
  const sortedSuburbs = Array.from(suburbCountMap.entries())
    .map(([suburb, companyMap]) => {
      const total = Array.from(companyMap.values()).reduce((a, b) => a + b.count, 0);
      return { suburb, companyMap, total };
    })
    .sort((a, b) => b.total - a.total)
    .slice(0, 25);

  const maxTotal = sortedSuburbs[0]?.total || 1;
  const companyList = Array.from(companies.entries()).map(([name, colour]) => ({ name, colour }));

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5" />
            Suburb Market Share — Competitor DA Activity
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">
            Actual DA counts by suburb × company. Identifies geographic areas where competitors are most active.
          </p>

          {sortedSuburbs.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">
              No suburb data available. Ensure competitors have DAs lodged.
            </p>
          ) : (
            <div className="space-y-2">
              {sortedSuburbs.map(({ suburb, companyMap, total }) => (
                <div key={suburb} className="flex items-center gap-3">
                  <span className="text-sm w-[120px] truncate font-medium" title={suburb}>
                    {suburb}
                  </span>
                  <div className="flex-1 h-7 bg-muted rounded-sm overflow-hidden flex">
                    {companyList.map((comp) => {
                      const entry = companyMap.get(comp.name);
                      if (!entry || entry.count === 0) return null;
                      const pct = (entry.count / maxTotal) * 100;
                      return (
                        <div
                          key={comp.name}
                          className="h-full flex items-center justify-center text-xs text-white font-medium"
                          style={{
                            width: `${pct}%`,
                            backgroundColor: comp.colour,
                            minWidth: "20px",
                          }}
                          title={`${comp.name}: ${entry.count} DAs`}
                        >
                          {pct > 8 ? entry.count : ""}
                        </div>
                      );
                    })}
                  </div>
                  <span className="text-xs text-muted-foreground w-[40px] text-right">{total}</span>
                </div>
              ))}
            </div>
          )}

          {/* Legend */}
          <div className="flex flex-wrap gap-3 mt-4 pt-4 border-t">
            {companyList.map((comp) => {
              const totalForComp = breakdown
                .filter(r => r.company === comp.name)
                .reduce((a, b) => a + b.count, 0);
              return (
                <div key={comp.name} className="flex items-center gap-1.5">
                  <div
                    className="w-3 h-3 rounded-sm"
                    style={{ backgroundColor: comp.colour }}
                  />
                  <span className="text-xs">{comp.name}</span>
                  <Badge variant="secondary" className="text-xs">{totalForComp}</Badge>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </>
  );
}
