import { useEffect, useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Area,
  AreaChart,
  ComposedChart,
} from "recharts";
import {
  Thermometer,
  CloudRain,
  Wind,
  MapPin,
  RefreshCw,
  Loader2,
  Calendar,
  TrendingUp,
} from "lucide-react";
import { toast } from "sonner";

const DATE_RANGES = [
  { label: "Last 7 days", days: 7 },
  { label: "Last 30 days", days: 30 },
  { label: "Last 60 days", days: 60 },
  { label: "Last 90 days", days: 90 },
] as const;

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-AU", { day: "numeric", month: "short" });
}

function formatDateShort(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-AU", { day: "numeric", month: "short" }).replace(" ", "\n");
}

export default function WeatherHistory() {
  const [selectedLocation, setSelectedLocation] = useState("");
  const [dateRange, setDateRange] = useState(30);

  // Calculate date range
  const { startDate, endDate } = useMemo(() => {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - dateRange);
    return {
      startDate: start.toISOString().split("T")[0],
      endDate: end.toISOString().split("T")[0],
    };
  }, [dateRange]);

  // Queries
  const locationsQuery = trpc.weather.getMainLocations.useQuery();
  const locations = locationsQuery.data ?? [];
  const historyQuery = trpc.weather.getHistory.useQuery({
    locationName: selectedLocation,
    startDate,
    endDate,
  }, { enabled: Boolean(selectedLocation) });
  const pollMutation = trpc.weather.pollNow.useMutation({
    onSuccess: (data) => {
      toast.success(
        data.success.length
          ? `Weather polled: ${data.success.length} locations updated`
          : "No weather locations configured for this tenant"
      );
      historyQuery.refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const history = historyQuery.data ?? [];

  useEffect(() => {
    if (locations.length === 0) {
      if (selectedLocation) setSelectedLocation("");
      return;
    }
    if (!selectedLocation || !locations.some((loc) => loc.name === selectedLocation)) {
      setSelectedLocation(locations[0].name);
    }
  }, [locations, selectedLocation]);

  // Reverse for chronological order (API returns desc)
  const chartData = useMemo(() => [...history].reverse(), [history]);

  // Calculate summary stats
  const stats = useMemo(() => {
    if (chartData.length === 0) return null;
    const avgMax = chartData.reduce((s, d) => s + d.tempMax, 0) / chartData.length;
    const avgMin = chartData.reduce((s, d) => s + d.tempMin, 0) / chartData.length;
    const totalRain = chartData.reduce((s, d) => s + d.precipitation, 0);
    const rainyDays = chartData.filter(d => d.precipitation > 0.2).length;
    const maxWind = Math.max(...chartData.map(d => d.windSpeedMax));
    return { avgMax, avgMin, totalRain, rainyDays, maxWind };
  }, [chartData]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Weather History</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Temperature and rainfall trends for main service locations
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={selectedLocation} onValueChange={setSelectedLocation} disabled={locations.length === 0}>
            <SelectTrigger className="w-[160px]">
              <MapPin className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
              <SelectValue placeholder="No locations" />
            </SelectTrigger>
            <SelectContent>
              {locations.map(loc => (
                <SelectItem key={loc.name} value={loc.name}>{loc.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={String(dateRange)} onValueChange={(v) => setDateRange(Number(v))}>
            <SelectTrigger className="w-[140px]">
              <Calendar className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DATE_RANGES.map(r => (
                <SelectItem key={r.days} value={String(r.days)}>{r.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="sm"
            onClick={() => pollMutation.mutate()}
            disabled={pollMutation.isPending || locations.length === 0}
          >
            {pollMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            <span className="ml-1.5 hidden sm:inline">Poll Now</span>
          </Button>
        </div>
      </div>

      {/* Summary KPI Cards */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <Card>
            <CardContent className="py-3 px-4">
              <div className="flex items-center gap-2">
                <Thermometer className="h-4 w-4 text-red-500" />
                <div>
                  <p className="text-xs text-muted-foreground">Avg High</p>
                  <p className="text-lg font-semibold">{stats.avgMax.toFixed(1)}°C</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-3 px-4">
              <div className="flex items-center gap-2">
                <Thermometer className="h-4 w-4 text-blue-500" />
                <div>
                  <p className="text-xs text-muted-foreground">Avg Low</p>
                  <p className="text-lg font-semibold">{stats.avgMin.toFixed(1)}°C</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-3 px-4">
              <div className="flex items-center gap-2">
                <CloudRain className="h-4 w-4 text-sky-500" />
                <div>
                  <p className="text-xs text-muted-foreground">Total Rain</p>
                  <p className="text-lg font-semibold">{stats.totalRain.toFixed(1)}mm</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-3 px-4">
              <div className="flex items-center gap-2">
                <CloudRain className="h-4 w-4 text-sky-600" />
                <div>
                  <p className="text-xs text-muted-foreground">Rainy Days</p>
                  <p className="text-lg font-semibold">{stats.rainyDays}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-3 px-4">
              <div className="flex items-center gap-2">
                <Wind className="h-4 w-4 text-slate-500" />
                <div>
                  <p className="text-xs text-muted-foreground">Max Wind</p>
                  <p className="text-lg font-semibold">{stats.maxWind} km/h</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Temperature Trend */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-medium flex items-center gap-2">
              <Thermometer className="h-4 w-4 text-primary" />
              Temperature Trend
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Daily high and low temperatures for {selectedLocation || "this tenant"}
            </p>
          </CardHeader>
          <CardContent className="pt-0">
            {historyQuery.isLoading ? (
              <Skeleton className="h-[250px] w-full" />
            ) : chartData.length === 0 ? (
              <div className="h-[250px] flex flex-col items-center justify-center text-sm text-muted-foreground gap-2">
                <Thermometer className="h-8 w-8 opacity-30" />
                <p>No temperature data available for this period</p>
                <p className="text-xs">
                  {locations.length === 0 ? "No weather locations are configured for this tenant" : "Try polling weather data or selecting a different date range"}
                </p>
              </div>
            ) : (
              <ChartContainer config={{
                tempMax: { label: "High °C", color: "oklch(0.65 0.20 25)" },
                tempMin: { label: "Low °C", color: "oklch(0.65 0.15 250)" },
              }} className="h-[250px] w-full">
                <AreaChart data={chartData} margin={{ top: 10, right: 10, bottom: 5, left: 0 }}>
                  <defs>
                    <linearGradient id="gradMax" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--color-tempMax)" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="var(--color-tempMax)" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gradMin" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--color-tempMin)" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="var(--color-tempMin)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 10 }}
                    tickFormatter={formatDate}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    tick={{ fontSize: 10 }}
                    tickFormatter={(v: number) => `${v}°`}
                    domain={["auto", "auto"]}
                  />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Area
                    type="monotone"
                    dataKey="tempMax"
                    stroke="var(--color-tempMax)"
                    fill="url(#gradMax)"
                    strokeWidth={2}
                    dot={false}
                  />
                  <Area
                    type="monotone"
                    dataKey="tempMin"
                    stroke="var(--color-tempMin)"
                    fill="url(#gradMin)"
                    strokeWidth={2}
                    dot={false}
                  />
                </AreaChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>

        {/* Rainfall Chart */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-medium flex items-center gap-2">
              <CloudRain className="h-4 w-4 text-sky-500" />
              Rainfall
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Daily precipitation for {selectedLocation || "this tenant"}
            </p>
          </CardHeader>
          <CardContent className="pt-0">
            {historyQuery.isLoading ? (
              <Skeleton className="h-[250px] w-full" />
            ) : chartData.length === 0 ? (
              <div className="h-[250px] flex flex-col items-center justify-center text-sm text-muted-foreground gap-2">
                <CloudRain className="h-8 w-8 opacity-30" />
                <p>{locations.length === 0 ? "No weather locations are configured for this tenant" : "No rainfall data available for this period"}</p>
                <p className="text-xs">Try polling weather data or selecting a different date range</p>
              </div>
            ) : (
              <ChartContainer config={{
                precipitation: { label: "Rain (mm)", color: "oklch(0.65 0.15 230)" },
              }} className="h-[250px] w-full">
                <BarChart data={chartData} margin={{ top: 10, right: 10, bottom: 5, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 10 }}
                    tickFormatter={formatDate}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    tick={{ fontSize: 10 }}
                    tickFormatter={(v: number) => `${v}mm`}
                  />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar
                    dataKey="precipitation"
                    fill="var(--color-precipitation)"
                    radius={[3, 3, 0, 0]}
                  />
                </BarChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>

        {/* Wind Speed Trend */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-medium flex items-center gap-2">
              <Wind className="h-4 w-4 text-slate-500" />
              Wind Speed
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Daily maximum wind speed for {selectedLocation || "this tenant"}
            </p>
          </CardHeader>
          <CardContent className="pt-0">
            {historyQuery.isLoading ? (
              <Skeleton className="h-[250px] w-full" />
            ) : chartData.length === 0 ? (
              <div className="h-[250px] flex flex-col items-center justify-center text-sm text-muted-foreground gap-2">
                <Wind className="h-8 w-8 opacity-30" />
                <p>{locations.length === 0 ? "No weather locations are configured for this tenant" : "No wind data available for this period"}</p>
              </div>
            ) : (
              <ChartContainer config={{
                windSpeedMax: { label: "Wind (km/h)", color: "oklch(0.55 0.08 250)" },
              }} className="h-[250px] w-full">
                <LineChart data={chartData} margin={{ top: 10, right: 10, bottom: 5, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 10 }}
                    tickFormatter={formatDate}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    tick={{ fontSize: 10 }}
                    tickFormatter={(v: number) => `${v}`}
                  />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Line
                    type="monotone"
                    dataKey="windSpeedMax"
                    stroke="var(--color-windSpeedMax)"
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>

        {/* Combined Temperature + Rainfall */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-medium flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" />
              Temperature vs Rainfall
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Overlay of temperature highs and daily rainfall
            </p>
          </CardHeader>
          <CardContent className="pt-0">
            {historyQuery.isLoading ? (
              <Skeleton className="h-[250px] w-full" />
            ) : chartData.length === 0 ? (
              <div className="h-[250px] flex flex-col items-center justify-center text-sm text-muted-foreground gap-2">
                <TrendingUp className="h-8 w-8 opacity-30" />
                <p>{locations.length === 0 ? "No weather locations are configured for this tenant" : "No data available for this period"}</p>
              </div>
            ) : (
              <ChartContainer config={{
                tempMax: { label: "High °C", color: "oklch(0.65 0.20 25)" },
                precipitation: { label: "Rain (mm)", color: "oklch(0.65 0.15 230)" },
              }} className="h-[250px] w-full">
                <ComposedChart data={chartData} margin={{ top: 10, right: 10, bottom: 5, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 10 }}
                    tickFormatter={formatDate}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    yAxisId="temp"
                    tick={{ fontSize: 10 }}
                    tickFormatter={(v: number) => `${v}°`}
                    orientation="left"
                  />
                  <YAxis
                    yAxisId="rain"
                    tick={{ fontSize: 10 }}
                    tickFormatter={(v: number) => `${v}mm`}
                    orientation="right"
                  />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Line
                    yAxisId="temp"
                    type="monotone"
                    dataKey="tempMax"
                    stroke="var(--color-tempMax)"
                    strokeWidth={2}
                    dot={false}
                  />
                  <Bar
                    yAxisId="rain"
                    dataKey="precipitation"
                    fill="var(--color-precipitation)"
                    radius={[2, 2, 0, 0]}
                    opacity={0.6}
                  />
                </ComposedChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Data Table */}
      {chartData.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-medium">
              Daily Records — {selectedLocation || "this tenant"}
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Showing {chartData.length} days of weather data
            </p>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="py-2 pr-4 font-medium text-muted-foreground">Date</th>
                    <th className="py-2 pr-4 font-medium text-muted-foreground text-right">High °C</th>
                    <th className="py-2 pr-4 font-medium text-muted-foreground text-right">Low °C</th>
                    <th className="py-2 pr-4 font-medium text-muted-foreground text-right">Rain (mm)</th>
                    <th className="py-2 font-medium text-muted-foreground text-right">Wind (km/h)</th>
                  </tr>
                </thead>
                <tbody>
                  {[...chartData].reverse().slice(0, 14).map((day) => (
                    <tr key={day.date} className="border-b border-border/50 last:border-0">
                      <td className="py-1.5 pr-4 text-xs">{formatDate(day.date)}</td>
                      <td className="py-1.5 pr-4 text-right text-xs font-medium text-red-600 dark:text-red-400">{day.tempMax}°</td>
                      <td className="py-1.5 pr-4 text-right text-xs font-medium text-blue-600 dark:text-blue-400">{day.tempMin}°</td>
                      <td className="py-1.5 pr-4 text-right text-xs">
                        {day.precipitation > 0 ? (
                          <span className="text-sky-600 dark:text-sky-400">{day.precipitation.toFixed(1)}</span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="py-1.5 text-right text-xs">{day.windSpeedMax}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
