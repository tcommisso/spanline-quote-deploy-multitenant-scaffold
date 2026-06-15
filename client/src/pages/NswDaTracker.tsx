import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Search, ChevronLeft, ChevronRight, MapPin, RefreshCw, Building2, BarChart3, Clock, AlertTriangle, Users } from "lucide-react";
import { toast } from "sonner";

const CATEGORY_COLORS: Record<string, string> = {
  patio: "bg-blue-100 text-blue-800",
  pergola: "bg-green-100 text-green-800",
  carport: "bg-amber-100 text-amber-800",
  deck: "bg-orange-100 text-orange-800",
  pool: "bg-cyan-100 text-cyan-800",
  outbuilding: "bg-purple-100 text-purple-800",
};

const CATEGORY_EMOJI: Record<string, string> = {
  patio: "🏠",
  pergola: "🌿",
  carport: "🚗",
  deck: "🪵",
  pool: "🏊",
  outbuilding: "🏚️",
};

export default function NswDaTracker() {

  const [tab, setTab] = useState("list");
  const [council, setCouncil] = useState("");
  const [suburb, setSuburb] = useState("");
  const [category, setCategory] = useState("");
  const [search, setSearch] = useState("");
  const [offset, setOffset] = useState(0);
  const limit = 50;

  const { data: filters } = trpc.nswDa.filters.useQuery();
  const { data: stats } = trpc.nswDa.stats.useQuery();
  const { data, isLoading } = trpc.nswDa.list.useQuery({
    council: council || undefined,
    suburb: suburb || undefined,
    category: category || undefined,
    search: search || undefined,
    relevantOnly: true,
    limit,
    offset,
  });
  const { data: suburbData } = trpc.nswDa.suburbBreakdown.useQuery({
    council: council || undefined,
    relevantOnly: true,
  });
  const { data: pollHistory } = trpc.nswDa.pollHistory.useQuery({ limit: 10 });

  const triggerPoll = trpc.nswDa.triggerPoll.useMutation({
    onSuccess: (result) => {
      toast.success(`NSW DA Poll Complete: ${result.totalNew} new, ${result.totalUpdated} updated, ${result.totalRelevant} relevant DAs`);
    },
    onError: (err) => {
      toast.error(`Poll Failed: ${err.message}`);
    },
  });

  const triggerScrape = trpc.nswDa.triggerScrape.useMutation({
    onSuccess: (result) => {
      toast.success(`T1Cloud Scrape Complete: ${result.totalNew} new, ${result.totalUpdated} updated, ${result.totalCompetitorMatches} competitor matches`);
    },
    onError: (err) => {
      toast.error(`Scrape Failed: ${err.message}`);
    },
  });

  const { data: competitorDas } = trpc.nswDa.competitorDas.useQuery({
    council: council || undefined,
    limit: 50,
  });

  const items = data?.items || [];
  const total = data?.total || 0;

  // Suburb chart data
  const suburbChartData = useMemo(() => {
    if (!suburbData) return [];
    const grouped = new Map<string, { suburb: string; total: number; categories: Record<string, number> }>();
    for (const row of suburbData) {
      if (!row.suburb) continue;
      if (!grouped.has(row.suburb)) {
        grouped.set(row.suburb, { suburb: row.suburb, total: 0, categories: {} });
      }
      const g = grouped.get(row.suburb)!;
      g.total += row.total;
      if (row.category) {
        g.categories[row.category] = (g.categories[row.category] || 0) + row.total;
      }
    }
    return Array.from(grouped.values())
      .sort((a, b) => b.total - a.total)
      .slice(0, 20);
  }, [suburbData]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">NSW DA Tracker</h1>
          <p className="text-muted-foreground text-sm">
            Outdoor-living development applications across {stats?.councils.length || 6} NSW councils
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => triggerScrape.mutate({})}
            disabled={triggerScrape.isPending}
          >
            {triggerScrape.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Users className="h-4 w-4 mr-2" />}
            Scrape Builders
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => triggerPoll.mutate({})}
            disabled={triggerPoll.isPending}
          >
            {triggerPoll.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
            Poll Now
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      {stats?.stats && stats.stats.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {stats.stats.map((s) => (
            <Card key={s.councilName} className="cursor-pointer hover:border-primary/50 transition-colors" onClick={() => setCouncil(s.councilName)}>
              <CardContent className="p-3">
                <p className="text-xs text-muted-foreground truncate">{s.councilName.replace(" Council", "").replace(" Regional", "")}</p>
                <p className="text-lg font-bold">{s.relevant || 0}</p>
                <p className="text-xs text-muted-foreground">of {s.total} total</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="list"><Building2 className="h-4 w-4 mr-1" /> Applications</TabsTrigger>
          <TabsTrigger value="competitors"><AlertTriangle className="h-4 w-4 mr-1" /> Competitors</TabsTrigger>
          <TabsTrigger value="suburbs"><BarChart3 className="h-4 w-4 mr-1" /> By Suburb</TabsTrigger>
          <TabsTrigger value="history"><Clock className="h-4 w-4 mr-1" /> Poll History</TabsTrigger>
        </TabsList>

        {/* Applications Tab */}
        <TabsContent value="list" className="space-y-4">
          {/* Filters */}
          <Card>
            <CardContent className="pt-4">
              <div className="flex gap-3 flex-wrap">
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search address..."
                    value={search}
                    onChange={(e) => { setSearch(e.target.value); setOffset(0); }}
                    className="pl-9"
                  />
                </div>
                <Select value={council} onValueChange={(v) => { setCouncil(v === "all" ? "" : v); setOffset(0); }}>
                  <SelectTrigger className="w-[200px]">
                    <SelectValue placeholder="All Councils" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Councils</SelectItem>
                    {(filters?.councils || []).map((c) => (
                      <SelectItem key={c} value={c}>{c.replace(" Council", "")}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={category} onValueChange={(v) => { setCategory(v === "all" ? "" : v); setOffset(0); }}>
                  <SelectTrigger className="w-[160px]">
                    <SelectValue placeholder="All Categories" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Categories</SelectItem>
                    {(filters?.categories || []).map((c) => (
                      <SelectItem key={c} value={c}>{CATEGORY_EMOJI[c] || "📋"} {c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Results Table */}
          <Card>
            <CardContent className="p-0">
              {isLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : items.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <MapPin className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>No applications found. Try running a poll first.</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>DA Number</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Address</TableHead>
                      <TableHead>Suburb</TableHead>
                      <TableHead>Council</TableHead>
                      <TableHead>Lodged</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell className="font-mono text-xs">{item.portalAppNumber}</TableCell>
                        <TableCell>
                          <Badge variant="secondary" className={CATEGORY_COLORS[item.relevantCategory || ""] || ""}>
                            {CATEGORY_EMOJI[item.relevantCategory || ""] || "📋"} {item.relevantCategory || "—"}
                          </Badge>
                        </TableCell>
                        <TableCell className="max-w-[250px] truncate text-sm">{item.fullAddress || "—"}</TableCell>
                        <TableCell className="text-sm">{item.suburb || "—"}</TableCell>
                        <TableCell className="text-sm">{item.councilName.replace(" Council", "").replace(" Regional", "")}</TableCell>
                        <TableCell className="text-sm">
                          {item.lodgementDate ? new Date(item.lodgementDate).toLocaleDateString("en-AU") : "—"}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">{item.applicationStatus || "—"}</Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {/* Pagination */}
          {total > limit && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Showing {offset + 1}–{Math.min(offset + limit, total)} of {total}
              </p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - limit))}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="sm" disabled={offset + limit >= total} onClick={() => setOffset(offset + limit)}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </TabsContent>

        {/* Competitors Tab */}
        <TabsContent value="competitors" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-red-500" />
                Competitor DAs (Builder Name Matches)
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {!competitorDas || competitorDas.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>No competitor matches found yet.</p>
                  <p className="text-xs mt-1">Click "Scrape Builders" to fetch applicant names from QPRC, Wagga & Hilltops portals.</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>DA Number</TableHead>
                      <TableHead>Applicant / Builder</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Address</TableHead>
                      <TableHead>Council</TableHead>
                      <TableHead>Lodged</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {competitorDas.map((da) => (
                      <TableRow key={da.id} className="bg-red-50/50">
                        <TableCell className="font-mono text-xs">{da.portalAppNumber}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <AlertTriangle className="h-3.5 w-3.5 text-red-500" />
                            <span className="font-medium text-sm">{da.applicantName || "—"}</span>
                          </div>
                        </TableCell>
                        <TableCell className="max-w-[200px] truncate text-sm">{da.description || da.developmentType || "—"}</TableCell>
                        <TableCell className="max-w-[200px] truncate text-sm">{da.fullAddress || "—"}</TableCell>
                        <TableCell className="text-sm">{da.councilName.replace(" Council", "").replace(" Regional", "")}</TableCell>
                        <TableCell className="text-sm">
                          {da.lodgementDate ? new Date(da.lodgementDate).toLocaleDateString("en-AU") : "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Suburb Breakdown Tab */}
        <TabsContent value="suburbs" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">DA Activity by Suburb (Top 20)</CardTitle>
            </CardHeader>
            <CardContent>
              {suburbChartData.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">No data yet. Run a poll to populate.</p>
              ) : (
                <div className="space-y-2">
                  {suburbChartData.map((row) => {
                    const maxTotal = suburbChartData[0]?.total || 1;
                    const pct = (row.total / maxTotal) * 100;
                    return (
                      <div key={row.suburb} className="flex items-center gap-3">
                        <span className="text-sm w-[140px] truncate font-medium">{row.suburb}</span>
                        <div className="flex-1 h-6 bg-muted rounded-sm overflow-hidden relative">
                          <div className="h-full bg-primary/70 rounded-sm" style={{ width: `${pct}%` }} />
                          <span className="absolute right-2 top-0 h-full flex items-center text-xs font-medium">{row.total}</span>
                        </div>
                        <div className="flex gap-1">
                          {Object.entries(row.categories).map(([cat, count]) => (
                            <Badge key={cat} variant="secondary" className={`text-xs ${CATEGORY_COLORS[cat] || ""}`}>
                              {CATEGORY_EMOJI[cat] || ""}{count}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Poll History Tab */}
        <TabsContent value="history" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Recent Poll Runs</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {!pollHistory || pollHistory.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">No poll history yet.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Council</TableHead>
                      <TableHead>Started</TableHead>
                      <TableHead>Duration</TableHead>
                      <TableHead>Fetched</TableHead>
                      <TableHead>New</TableHead>
                      <TableHead>Relevant</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pollHistory.map((log) => (
                      <TableRow key={log.id}>
                        <TableCell className="text-sm">{(log.councilName || "All").replace(" Council", "")}</TableCell>
                        <TableCell className="text-sm">
                          {log.startedAt ? new Date(log.startedAt).toLocaleString("en-AU", { dateStyle: "short", timeStyle: "short" }) : "—"}
                        </TableCell>
                        <TableCell className="text-sm">{log.durationMs ? `${(log.durationMs / 1000).toFixed(1)}s` : "—"}</TableCell>
                        <TableCell className="text-sm">{log.totalFetched ?? "—"}</TableCell>
                        <TableCell className="text-sm font-medium">{log.newApplications ?? "—"}</TableCell>
                        <TableCell className="text-sm">
                          <Badge variant="secondary">{log.relevantCount ?? 0}</Badge>
                        </TableCell>
                        <TableCell>
                          {log.errorMessage ? (
                            <Badge variant="destructive" className="text-xs">Error</Badge>
                          ) : log.completedAt ? (
                            <Badge variant="secondary" className="bg-green-100 text-green-800 text-xs">OK</Badge>
                          ) : (
                            <Badge variant="outline" className="text-xs">Running</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
