import { useState, useEffect, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { MapView } from "@/components/Map";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Loader2, MapPin, FileText, Calendar } from "lucide-react";

const DEFAULT_SUBCLASS = "ADDITIONS/ALTERATION";
type MapScope = "entity" | "all" | "competitor";

const MAP_SCOPE_OPTIONS: Array<{ value: MapScope; label: string; description: string }> = [
  { value: "entity", label: "Entity DAs", description: "DAs associated to our approval jobs and matched client records" },
  { value: "all", label: "All DAs", description: "All active ACT DA tracker points" },
  { value: "competitor", label: "Competitor DAs", description: "Matched DA records marked as competitor activity" },
];

function mapScopeLabel(scope?: string | null) {
  return MAP_SCOPE_OPTIONS.find((option) => option.value === scope)?.label || "DA";
}

function markerColour(da: any) {
  if (da.mapScope === "competitor") return "#ef4444";
  if (da.mapScope === "entity") return "#2563eb";
  if (da.subclass === "Residential") return "#3b82f6";
  if (da.subclass === "Commercial") return "#f59e0b";
  return "#10b981";
}

function htmlEscape(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export default function DaTrackerMap() {
  const [selectedDistrict, setSelectedDistrict] = useState<string>("");
  const [selectedSubclass, setSelectedSubclass] = useState<string>(DEFAULT_SUBCLASS);
  const [mapScope, setMapScope] = useState<MapScope>("entity");
  const [selectedDa, setSelectedDa] = useState<any>(null);
  const [mapReadyVersion, setMapReadyVersion] = useState(0);
  const [mapError, setMapError] = useState<string | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<google.maps.Marker[]>([]);

  const { data: stats } = trpc.daTracker.stats.useQuery();
  const { data: filterOptions } = trpc.daTracker.filterOptions.useQuery();
  const { data: mapData, isLoading } = trpc.daTracker.mapData.useQuery({
    scope: mapScope,
    district: selectedDistrict && selectedDistrict !== "all" ? selectedDistrict : undefined,
    subclass: selectedSubclass && selectedSubclass !== "all" ? selectedSubclass : undefined,
  });

  // Update markers when mapData changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapData) return;

    // Clear existing markers
    markersRef.current.forEach(m => m.setMap(null));
    markersRef.current = [];

    if (mapData.length === 0) return;

    // Add markers for each DA
    const bounds = new google.maps.LatLngBounds();
    for (const da of mapData) {
      if (!da.centroidLat || !da.centroidLng) continue;
      const pos = { lat: da.centroidLat, lng: da.centroidLng };
      bounds.extend(pos);

      const marker = new google.maps.Marker({
        position: pos,
        map,
        title: `DA ${da.daNumber} - ${da.companyName || da.division || da.address || ""}`,
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 8,
          fillColor: markerColour(da),
          fillOpacity: 0.8,
          strokeColor: "#fff",
          strokeWeight: 2,
        },
      });

      const infoWindow = new google.maps.InfoWindow({
        content: `<div style="padding:8px;max-width:250px;">
          <strong>DA ${htmlEscape(da.daNumber)}</strong><br/>
          <span style="color:#666;">${htmlEscape(da.companyName || da.division || da.address || "Unknown")}</span><br/>
          <span style="font-size:12px;color:#888;">${htmlEscape(da.subclass || mapScopeLabel(da.mapScope))}</span>
        </div>`,
      });

      marker.addListener("click", () => {
        infoWindow.open(map, marker);
        setSelectedDa(da);
      });

      markersRef.current.push(marker);
    }

    if (mapData.length > 1) {
      map.fitBounds(bounds);
    } else if (mapData.length === 1 && mapData[0].centroidLat && mapData[0].centroidLng) {
      map.setCenter({ lat: mapData[0].centroidLat, lng: mapData[0].centroidLng });
      map.setZoom(15);
    }
  }, [mapData, mapReadyVersion]);

  const handleMapReady = (map: google.maps.Map) => {
    mapRef.current = map;
    setMapError(null);
    // Default center on Canberra
    map.setCenter({ lat: -35.2809, lng: 149.1300 });
    map.setZoom(12);
    setMapReadyVersion((v) => v + 1);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">DA Tracker — Map View</h1>
          <p className="text-muted-foreground text-sm">Active development applications from ACT Government ArcGIS</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {stats && (
            <>
              <Badge variant="secondary" className="text-sm">
                <MapPin className="h-3 w-3 mr-1" /> {stats.activeApplications} Active
              </Badge>
              <Badge variant="outline" className="text-sm">
                <Calendar className="h-3 w-3 mr-1" /> {stats.newThisWeek} New This Week
              </Badge>
            </>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap items-center">
        <Select value={mapScope} onValueChange={(value) => setMapScope(value as MapScope)}>
          <SelectTrigger className="w-full sm:w-[220px]">
            <SelectValue placeholder="Map scope" />
          </SelectTrigger>
          <SelectContent>
            {MAP_SCOPE_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={selectedDistrict} onValueChange={setSelectedDistrict}>
          <SelectTrigger className="w-full sm:w-[180px]">
            <SelectValue placeholder="All Districts" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Districts</SelectItem>
            {filterOptions?.districts.map((d) => (
              <SelectItem key={d} value={d}>{d}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={selectedSubclass} onValueChange={setSelectedSubclass}>
          <SelectTrigger className="w-full sm:w-[180px]">
            <SelectValue placeholder="All Subclasses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Subclasses</SelectItem>
            {filterOptions?.subclasses.map((s) => (
              <SelectItem key={s} value={s}>{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Map */}
      <Card>
        <CardContent className="p-0 h-[520px] sm:h-[600px] relative">
          {isLoading ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <MapView
              onMapReady={handleMapReady}
              onMapError={setMapError}
              className="w-full h-full rounded-lg"
            />
          )}
          {!isLoading && mapError && (
            <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-background/95 p-6 text-center">
              <div>
                <p className="font-medium">Map could not be loaded</p>
                <p className="mt-1 text-sm text-muted-foreground">{mapError}</p>
              </div>
            </div>
          )}
          {!isLoading && !mapError && mapData && mapData.length === 0 && (
            <div className="absolute inset-x-4 top-4 rounded-md border bg-background/95 p-3 text-sm text-muted-foreground shadow-sm">
              No {mapScopeLabel(mapScope).toLowerCase()} map points for the current filter.
            </div>
          )}
        </CardContent>
      </Card>

      {/* Selected DA detail */}
      {selectedDa && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <FileText className="h-4 w-4" />
              DA {selectedDa.daNumber}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">Scope</span>
                <p className="font-medium">{mapScopeLabel(selectedDa.mapScope)}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Location</span>
                <p className="font-medium">{selectedDa.division || selectedDa.address || "N/A"}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Details</span>
                <p className="font-medium">{selectedDa.companyName || selectedDa.subclass || "N/A"}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Coordinates</span>
                <p className="font-medium">{selectedDa.centroidLat?.toFixed(5)}, {selectedDa.centroidLng?.toFixed(5)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-blue-600 inline-block"></span> Entity DAs</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-red-500 inline-block"></span> Competitor DAs</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-blue-500 inline-block"></span> Residential</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-amber-500 inline-block"></span> Commercial</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-emerald-500 inline-block"></span> Other</span>
      </div>
    </div>
  );
}
