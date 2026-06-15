import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CloudRain, CheckCircle2, XCircle, Play, Bell, Undo2, AlertTriangle, Calendar, CloudSun, FileText, Download, Send, BarChart3 } from "lucide-react";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  ReferenceLine,
} from "recharts";

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  approved: "bg-blue-100 text-blue-800",
  executed: "bg-green-100 text-green-800",
  revoked: "bg-red-100 text-red-800",
};

export default function RainDays() {
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [showDeclare, setShowDeclare] = useState(false);
  const [showBulkDeclare, setShowBulkDeclare] = useState(false);
  const [declareForm, setDeclareForm] = useState({ date: "", reason: "", zone: "" });
  const [bulkForm, setBulkForm] = useState({ startDate: "", endDate: "", reason: "", zone: "" });
  const [selectedRainDay, setSelectedRainDay] = useState<any>(null);
  const [showWeatherPanel, setShowWeatherPanel] = useState(false);
  const [showEotDialog, setShowEotDialog] = useState(false);
  const [eotJobId, setEotJobId] = useState<number | null>(null);
  const [eotEmail, setEotEmail] = useState("");
  const [eotMessage, setEotMessage] = useState("");

  const utils = trpc.useUtils();
  const { data: rainDaysList, isLoading } = trpc.rainDay.list.useQuery(
    statusFilter !== "all" ? { status: statusFilter as any } : undefined
  );
  const { data: stats } = trpc.rainDay.stats.useQuery();

  // Weather suggestions query (only when panel is open)
  const precipThreshold = useMemo(() => 10, []);
  const { data: weatherSuggestions, isLoading: loadingSuggestions } = trpc.rainDay.weatherSuggest.useQuery(
    { precipitationThreshold: precipThreshold },
    { enabled: showWeatherPanel }
  );

  const declareMut = trpc.rainDay.declare.useMutation({
    onSuccess: () => {
      toast.success("Rain day declared — pending approval");
      utils.rainDay.list.invalidate();
      utils.rainDay.stats.invalidate();
      setShowDeclare(false);
      setDeclareForm({ date: "", reason: "", zone: "" });
    },
    onError: (err) => toast.error(err.message),
  });

  const declareBulkMut = trpc.rainDay.declareBulk.useMutation({
    onSuccess: (data) => {
      toast.success(`${data.count} rain days declared (${data.dates[0]} to ${data.dates[data.dates.length - 1]})`);
      utils.rainDay.list.invalidate();
      utils.rainDay.stats.invalidate();
      setShowBulkDeclare(false);
      setBulkForm({ startDate: "", endDate: "", reason: "", zone: "" });
    },
    onError: (err) => toast.error(err.message),
  });

  const approveMut = trpc.rainDay.approve.useMutation({
    onSuccess: () => {
      toast.success("Rain day approved");
      utils.rainDay.list.invalidate();
      utils.rainDay.stats.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const executeMut = trpc.rainDay.execute.useMutation({
    onSuccess: (data) => {
      toast.success(`Executed: ${data.affectedJobs} jobs rescheduled, ${data.affectedEvents} events moved`);
      utils.rainDay.list.invalidate();
      utils.rainDay.stats.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const rejectMut = trpc.rainDay.reject.useMutation({
    onSuccess: () => {
      toast.success("Rain day rejected");
      utils.rainDay.list.invalidate();
      utils.rainDay.stats.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const revokeMut = trpc.rainDay.revoke.useMutation({
    onSuccess: (data) => {
      toast.success(`Revoked: ${data.reversedEvents} events restored`);
      utils.rainDay.list.invalidate();
      utils.rainDay.stats.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const notifyMut = trpc.rainDay.sendNotifications.useMutation({
    onSuccess: (data) => {
      toast.success(`Notifications sent: ${data.clientNotifications} clients`);
      utils.rainDay.list.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const generateEotMut = trpc.rainDay.generateEotReport.useMutation({
    onSuccess: (data) => {
      toast.success(`EOT Report generated: ${data.totalDays} days across ${data.recordCount} records`);
      window.open(data.pdfUrl, "_blank");
    },
    onError: (err) => toast.error(err.message),
  });

  const sendEotMut = trpc.rainDay.sendEotReport.useMutation({
    onSuccess: () => {
      toast.success("EOT Report sent via email");
      setShowEotDialog(false);
      setEotEmail("");
      setEotMessage("");
    },
    onError: (err) => toast.error(err.message),
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <CloudRain className="h-6 w-6 text-blue-500" />
            Rain Days
          </h1>
          <p className="text-muted-foreground mt-1">Manage rain day declarations, approvals, and schedule impacts</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" onClick={() => setShowWeatherPanel(!showWeatherPanel)}>
            <CloudSun className="h-4 w-4 mr-2" />
            Weather Suggestions
          </Button>
          <Button variant="outline" onClick={() => setShowBulkDeclare(true)}>
            <Calendar className="h-4 w-4 mr-2" />
            Bulk Declare
          </Button>
          <Button onClick={() => setShowDeclare(true)}>
            <CloudRain className="h-4 w-4 mr-2" />
            Declare Rain Day
          </Button>
        </div>
      </div>

      {/* Weather Suggestions Panel */}
      {showWeatherPanel && (
        <Card className="border-blue-200 bg-blue-50/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <CloudSun className="h-5 w-5 text-blue-600" />
              Weather-Based Suggestions
              <Badge variant="outline" className="ml-2 text-xs">7-day forecast</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loadingSuggestions ? (
              <div className="text-center py-4 text-muted-foreground">Loading forecast data...</div>
            ) : !weatherSuggestions?.length ? (
              <div className="text-center py-4 text-muted-foreground">
                No high-probability rain days in the forecast. Threshold: 10mm precipitation.
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground mb-3">
                  Days with forecast precipitation ≥ 10mm or rain weather codes. Click "Declare" to create a rain day.
                </p>
                <div className="grid gap-2">
                  {weatherSuggestions.map((s: any) => (
                    <div key={`${s.date}-${s.location}`} className="flex items-center justify-between p-3 bg-white rounded-lg border">
                      <div className="flex items-center gap-3">
                        <CloudRain className="h-4 w-4 text-blue-500" />
                        <div>
                          <div className="font-medium text-sm">{s.date}</div>
                          <div className="text-xs text-muted-foreground">{s.location} • {s.precipitation}mm</div>
                        </div>
                        <Badge
                          variant="outline"
                          className={
                            s.confidence === "high" ? "text-red-600 border-red-200" :
                            s.confidence === "medium" ? "text-orange-600 border-orange-200" :
                            "text-yellow-600 border-yellow-200"
                          }
                        >
                          {s.confidence}
                        </Badge>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setDeclareForm({ date: s.date, reason: `Weather forecast: ${s.precipitation}mm precipitation expected (${s.location})`, zone: s.location });
                          setShowDeclare(true);
                        }}
                      >
                        Declare
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Precipitation History Chart */}
      <PrecipitationChart />

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
          <Card>
            <CardContent className="pt-4 pb-4 text-center">
              <div className="text-2xl font-bold text-yellow-600">{stats.pending}</div>
              <div className="text-xs text-muted-foreground">Pending</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-4 text-center">
              <div className="text-2xl font-bold text-blue-600">{stats.approved}</div>
              <div className="text-xs text-muted-foreground">Approved</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-4 text-center">
              <div className="text-2xl font-bold text-green-600">{stats.executed}</div>
              <div className="text-xs text-muted-foreground">Executed</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-4 text-center">
              <div className="text-2xl font-bold">{stats.totalDeclared}</div>
              <div className="text-xs text-muted-foreground">Total Declared</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-4 text-center">
              <div className="text-2xl font-bold">{stats.totalJobsAffected}</div>
              <div className="text-xs text-muted-foreground">Jobs Affected</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-4 text-center">
              <div className="text-2xl font-bold">{stats.totalEOTsIssued}</div>
              <div className="text-xs text-muted-foreground">EOTs Issued</div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-3 items-center">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="executed">Executed</SelectItem>
            <SelectItem value="revoked">Revoked</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Rain Days List */}
      <Card>
        <CardHeader>
          <CardTitle>Rain Day Declarations</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading...</div>
          ) : !rainDaysList?.length ? (
            <div className="text-center py-8 text-muted-foreground">No rain days declared</div>
          ) : (
            <div className="space-y-3">
              {rainDaysList.map((rd: any) => (
                <div key={rd.id} className="border rounded-lg p-4 hover:bg-muted/50 transition-colors">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <CloudRain className="h-5 w-5 text-blue-500" />
                      <div>
                        <div className="font-medium">{rd.date}</div>
                        <div className="text-sm text-muted-foreground">{rd.reason}</div>
                        {rd.zone && <div className="text-xs text-muted-foreground">Zone: {rd.zone}</div>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge className={STATUS_COLORS[rd.status] || ""}>{rd.status}</Badge>
                      {rd.affectedJobCount > 0 && (
                        <Badge variant="outline">{rd.affectedJobCount} jobs</Badge>
                      )}
                    </div>
                  </div>

                  {/* Action buttons based on status */}
                  <div className="flex gap-2 mt-3 pt-3 border-t flex-wrap">
                    <div className="text-xs text-muted-foreground flex-1">
                      Declared by {rd.declaredByUserName} • {new Date(rd.createdAt).toLocaleDateString()}
                      {rd.approvedByUserName && ` • Approved by ${rd.approvedByUserName}`}
                    </div>
                    {rd.status === "pending" && (
                      <>
                        <Button size="sm" variant="outline" onClick={() => approveMut.mutate({ rainDayId: rd.id })}>
                          <CheckCircle2 className="h-3 w-3 mr-1" /> Approve
                        </Button>
                        <Button size="sm" variant="outline" className="text-red-600" onClick={() => rejectMut.mutate({ rainDayId: rd.id })}>
                          <XCircle className="h-3 w-3 mr-1" /> Reject
                        </Button>
                      </>
                    )}
                    {rd.status === "approved" && (
                      <Button size="sm" onClick={() => executeMut.mutate({ rainDayId: rd.id })}>
                        <Play className="h-3 w-3 mr-1" /> Execute Reschedule
                      </Button>
                    )}
                    {rd.status === "executed" && (
                      <>
                        <Button size="sm" variant="outline" onClick={() => notifyMut.mutate({ rainDayId: rd.id })}>
                          <Bell className="h-3 w-3 mr-1" /> Send Notifications
                        </Button>
                        <Button size="sm" variant="outline" className="text-red-600" onClick={() => revokeMut.mutate({ rainDayId: rd.id })}>
                          <Undo2 className="h-3 w-3 mr-1" /> Revoke
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setSelectedRainDay(rd)}>
                          View Impacts
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Declare Rain Day Dialog */}
      <Dialog open={showDeclare} onOpenChange={setShowDeclare}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CloudRain className="h-5 w-5" /> Declare Rain Day
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Date</Label>
              <Input
                type="date"
                value={declareForm.date}
                onChange={(e) => setDeclareForm(f => ({ ...f, date: e.target.value }))}
              />
            </div>
            <div>
              <Label>Reason</Label>
              <Textarea
                placeholder="e.g., Heavy rainfall forecast, BOM severe weather warning"
                value={declareForm.reason}
                onChange={(e) => setDeclareForm(f => ({ ...f, reason: e.target.value }))}
              />
            </div>
            <div>
              <Label>Zone (optional)</Label>
              <Input
                placeholder="e.g., Canberra, Goulburn, Batemans Bay"
                value={declareForm.zone}
                onChange={(e) => setDeclareForm(f => ({ ...f, zone: e.target.value }))}
              />
            </div>
            <div className="flex items-start gap-2 p-3 bg-yellow-50 rounded-lg border border-yellow-200">
              <AlertTriangle className="h-4 w-4 text-yellow-600 mt-0.5" />
              <div className="text-sm text-yellow-800">
                This will create a pending rain day. Another admin must approve before jobs are rescheduled.
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeclare(false)}>Cancel</Button>
            <Button
              onClick={() => declareMut.mutate(declareForm)}
              disabled={!declareForm.date || !declareForm.reason || declareMut.isPending}
            >
              {declareMut.isPending ? "Declaring..." : "Declare Rain Day"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Declare Dialog */}
      <Dialog open={showBulkDeclare} onOpenChange={setShowBulkDeclare}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" /> Bulk Declare Rain Days
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Start Date</Label>
                <Input
                  type="date"
                  value={bulkForm.startDate}
                  onChange={(e) => setBulkForm(f => ({ ...f, startDate: e.target.value }))}
                />
              </div>
              <div>
                <Label>End Date</Label>
                <Input
                  type="date"
                  value={bulkForm.endDate}
                  onChange={(e) => setBulkForm(f => ({ ...f, endDate: e.target.value }))}
                />
              </div>
            </div>
            <div>
              <Label>Reason</Label>
              <Textarea
                placeholder="e.g., Extended wet weather period, BOM multi-day severe weather warning"
                value={bulkForm.reason}
                onChange={(e) => setBulkForm(f => ({ ...f, reason: e.target.value }))}
              />
            </div>
            <div>
              <Label>Zone (optional)</Label>
              <Input
                placeholder="e.g., Canberra, Goulburn, Batemans Bay"
                value={bulkForm.zone}
                onChange={(e) => setBulkForm(f => ({ ...f, zone: e.target.value }))}
              />
            </div>
            <div className="flex items-start gap-2 p-3 bg-blue-50 rounded-lg border border-blue-200">
              <Calendar className="h-4 w-4 text-blue-600 mt-0.5" />
              <div className="text-sm text-blue-800">
                Weekends are automatically skipped. Maximum 14 consecutive business days. Existing declarations are not duplicated.
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowBulkDeclare(false)}>Cancel</Button>
            <Button
              onClick={() => declareBulkMut.mutate(bulkForm)}
              disabled={!bulkForm.startDate || !bulkForm.endDate || !bulkForm.reason || declareBulkMut.isPending}
            >
              {declareBulkMut.isPending ? "Declaring..." : "Bulk Declare"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Impacts Dialog */}
      {selectedRainDay && (
        <RainDayImpactsDialog
          rainDay={selectedRainDay}
          onClose={() => setSelectedRainDay(null)}
          onGenerateEot={(jobId: number) => {
            setEotJobId(jobId);
            generateEotMut.mutate({ jobId });
          }}
          onSendEot={(jobId: number) => {
            setEotJobId(jobId);
            setShowEotDialog(true);
          }}
        />
      )}

      {/* Send EOT Report Dialog */}
      <Dialog open={showEotDialog} onOpenChange={setShowEotDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Send className="h-5 w-5" /> Send EOT Report
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Recipient Email</Label>
              <Input
                type="email"
                placeholder="client@example.com"
                value={eotEmail}
                onChange={(e) => setEotEmail(e.target.value)}
              />
            </div>
            <div>
              <Label>Additional Message (optional)</Label>
              <Textarea
                placeholder="Any additional notes to include in the email..."
                value={eotMessage}
                onChange={(e) => setEotMessage(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEotDialog(false)}>Cancel</Button>
            <Button
              onClick={() => {
                if (!eotJobId || !eotEmail) return;
                // First generate the report, then send it
                generateEotMut.mutate({ jobId: eotJobId }, {
                  onSuccess: (data) => {
                    sendEotMut.mutate({
                      jobId: eotJobId!,
                      recipientEmail: eotEmail,
                      pdfUrl: data.pdfUrl,
                      message: eotMessage || undefined,
                    });
                  },
                });
              }}
              disabled={!eotEmail || sendEotMut.isPending || generateEotMut.isPending}
            >
              {generateEotMut.isPending ? "Generating..." : sendEotMut.isPending ? "Sending..." : "Generate & Send"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function RainDayImpactsDialog({ rainDay, onClose, onGenerateEot, onSendEot }: {
  rainDay: any;
  onClose: () => void;
  onGenerateEot: (jobId: number) => void;
  onSendEot: (jobId: number) => void;
}) {
  const { data: impacts, isLoading } = trpc.rainDay.getImpacts.useQuery({ rainDayId: rainDay.id });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Impacts — Rain Day {rainDay.date}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 max-h-[60vh] overflow-y-auto">
          {isLoading ? (
            <div className="text-center py-4 text-muted-foreground">Loading...</div>
          ) : !impacts?.length ? (
            <div className="text-center py-4 text-muted-foreground">No impacts recorded</div>
          ) : (
            impacts.map(({ impact, job }: any) => (
              <div key={impact.id} className="border rounded-lg p-3">
                <div className="flex justify-between items-start">
                  <div>
                    <div className="font-medium">{job.clientName || `Job #${job.id}`}</div>
                    <div className="text-sm text-muted-foreground">{job.siteAddress || "No address"}</div>
                  </div>
                  <div className="text-right text-sm">
                    <div><span className="text-muted-foreground">Original:</span> {impact.originalDate}</div>
                    <div><span className="text-muted-foreground">New:</span> {impact.newDate || "TBC"}</div>
                  </div>
                </div>
                <div className="flex gap-2 mt-2 flex-wrap items-center">
                  {impact.clientNotified && <Badge variant="outline" className="text-green-600">Client Notified</Badge>}
                  {impact.tradesNotified && <Badge variant="outline" className="text-green-600">Trades Notified</Badge>}
                  {!impact.clientNotified && <Badge variant="outline" className="text-yellow-600">Client Pending</Badge>}
                  <div className="flex-1" />
                  <Button size="sm" variant="outline" onClick={() => onGenerateEot(job.id)}>
                    <Download className="h-3 w-3 mr-1" /> EOT PDF
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => onSendEot(job.id)}>
                    <Send className="h-3 w-3 mr-1" /> Email EOT
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


// ─── Precipitation History Chart ──────────────────────────────────────────────

const LOCATION_COLORS: Record<string, string> = {
  Canberra: "oklch(0.60 0.18 250)",
  Goulburn: "oklch(0.65 0.15 155)",
  "Batemans Bay": "oklch(0.70 0.16 30)",
  Queanbeyan: "oklch(0.62 0.14 290)",
  Yass: "oklch(0.68 0.12 75)",
};

function PrecipitationChart() {
  const { data: chartData, isLoading } = trpc.rainDay.weatherHistoryChart.useQuery(
    { days: 30 },
    { staleTime: 5 * 60 * 1000 }
  );

  // Transform data: one row per date, columns per location
  const { transformedData, locations, chartConfig } = useMemo(() => {
    if (!chartData?.locations) return { transformedData: [], locations: [], chartConfig: {} };

    const locs = Object.keys(chartData.locations);
    // Collect all dates
    const dateSet = new Set<string>();
    for (const loc of locs) {
      for (const entry of chartData.locations[loc]) {
        dateSet.add(entry.date);
      }
    }
    const allDates = Array.from(dateSet).sort();

    // Build lookup per location
    const lookups: Record<string, Record<string, number>> = {};
    for (const loc of locs) {
      lookups[loc] = {};
      for (const entry of chartData.locations[loc]) {
        lookups[loc][entry.date] = entry.precipitation;
      }
    }

    // Build chart data rows
    const rows = allDates.map(date => {
      const row: Record<string, any> = { date };
      for (const loc of locs) {
        row[loc] = lookups[loc][date] ?? 0;
      }
      // Mark if this date was a declared rain day
      row._declared = chartData.declaredRainDays.some((d: any) => d.date === date);
      return row;
    });

    // Build chart config
    const config: Record<string, { label: string; color: string }> = {};
    locs.forEach((loc, i) => {
      config[loc] = {
        label: loc,
        color: LOCATION_COLORS[loc] || `oklch(0.65 0.15 ${(i * 72) % 360})`,
      };
    });

    return { transformedData: rows, locations: locs, chartConfig: config };
  }, [chartData]);

  // Find declared rain day dates for reference lines
  const declaredDates = useMemo(() => {
    if (!chartData?.declaredRainDays) return [];
    return chartData.declaredRainDays.map((d: any) => d.date);
  }, [chartData]);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-medium flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-blue-500" />
          Precipitation History
          <Badge variant="outline" className="ml-2 text-xs font-normal">Past 30 days</Badge>
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Daily precipitation (mm) across main locations. Red lines indicate declared rain days.
        </p>
      </CardHeader>
      <CardContent className="pt-0">
        {isLoading ? (
          <Skeleton className="h-[220px] w-full" />
        ) : !transformedData.length ? (
          <div className="h-[220px] flex items-center justify-center text-sm text-muted-foreground">
            No weather history data available. Data is collected automatically from Open-Meteo.
          </div>
        ) : (
          <ChartContainer config={chartConfig} className="h-[220px] w-full">
            <BarChart data={transformedData} margin={{ top: 10, right: 5, bottom: 5, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 10 }}
                tickFormatter={(v: string) => {
                  const d = new Date(v + "T00:00:00");
                  return `${d.getDate()}/${d.getMonth() + 1}`;
                }}
                interval="preserveStartEnd"
              />
              <YAxis
                tick={{ fontSize: 10 }}
                allowDecimals={false}
                label={{ value: "mm", angle: -90, position: "insideLeft", style: { fontSize: 10 } }}
              />
              <ChartTooltip
                content={<ChartTooltipContent />}
                labelFormatter={(label: string) => {
                  const d = new Date(label + "T00:00:00");
                  return d.toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" });
                }}
              />
              {locations.map((loc, i) => (
                <Bar
                  key={loc}
                  dataKey={loc}
                  stackId="precip"
                  fill={`var(--color-${loc.replace(/\s+/g, "-")})`}
                  radius={i === locations.length - 1 ? [2, 2, 0, 0] : [0, 0, 0, 0]}
                />
              ))}
              {declaredDates.map((date: string) => (
                <ReferenceLine
                  key={`ref-${date}`}
                  x={date}
                  stroke="oklch(0.55 0.22 25)"
                  strokeDasharray="4 2"
                  strokeWidth={1.5}
                />
              ))}
            </BarChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}
