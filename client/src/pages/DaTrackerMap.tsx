import { useState, useEffect, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { MapView } from "@/components/Map";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Loader2, MapPin, FileText, Calendar } from "lucide-react";

export default function DaTrackerMap() {
  const [selectedDistrict, setSelectedDistrict] = useState<string>("");
  const [selectedSubclass, setSelectedSubclass] = useState<string>("");
  const [myProjectsOnly, setMyProjectsOnly] = useState(true);
  const [selectedDa, setSelectedDa] = useState<any>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<google.maps.Marker[]>([]);

  const { data: stats } = trpc.daTracker.stats.useQuery();
  const { data: filterOptions } = trpc.daTracker.filterOptions.useQuery();
  const { data: mapData, isLoading } = trpc.daTracker.mapData.useQuery({
    district: selectedDistrict || undefined,
    subclass: selectedSubclass || undefined,
    myProjectsOnly,
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
        title: `DA ${da.daNumber} - ${da.division}`,
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 8,
          fillColor: da.subclass === "Residential" ? "#3b82f6" : da.subclass === "Commercial" ? "#f59e0b" : "#10b981",
          fillOpacity: 0.8,
          strokeColor: "#fff",
          strokeWeight: 2,
        },
      });

      const infoWindow = new google.maps.InfoWindow({
        content: `<div style="padding:8px;max-width:250px;">
          <strong>DA ${da.daNumber}</strong><br/>
          <span style="color:#666;">${da.division || "Unknown"}, ${da.district || ""}</span><br/>
          <span style="font-size:12px;color:#888;">${da.subclass || "N/A"}</span>
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
  }, [mapData]);

  const handleMapReady = (map: google.maps.Map) => {
    mapRef.current = map;
    // Default center on Canberra
    map.setCenter({ lat: -35.2809, lng: 149.1300 });
    map.setZoom(12);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">DA Tracker — Map View</h1>
          <p className="text-muted-foreground text-sm">Active development applications from ACT Government ArcGIS</p>
        </div>
        <div className="flex gap-2">
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
        <div className="flex items-center gap-2 border rounded-md px-3 py-2">
          <Switch
            id="my-projects-filter"
            checked={myProjectsOnly}
            onCheckedChange={setMyProjectsOnly}
          />
          <Label htmlFor="my-projects-filter" className="text-sm font-medium cursor-pointer">
            My Projects Only
          </Label>
        </div>

        <Select value={selectedDistrict} onValueChange={setSelectedDistrict}>
          <SelectTrigger className="w-[180px]">
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
          <SelectTrigger className="w-[180px]">
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
        <CardContent className="p-0 h-[600px] relative">
          {isLoading ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <MapView
              onMapReady={handleMapReady}
              className="w-full h-full rounded-lg"
            />
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
                <span className="text-muted-foreground">Division</span>
                <p className="font-medium">{selectedDa.division || "N/A"}</p>
              </div>
              <div>
                <span className="text-muted-foreground">District</span>
                <p className="font-medium">{selectedDa.district || "N/A"}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Subclass</span>
                <p className="font-medium">{selectedDa.subclass || "N/A"}</p>
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
      <div className="flex items-center gap-4 text-sm text-muted-foreground">
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-blue-500 inline-block"></span> Residential</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-amber-500 inline-block"></span> Commercial</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-emerald-500 inline-block"></span> Other</span>
      </div>
    </div>
  );
}
