import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MapView } from "@/components/Map";
import { ArrowLeft, MapPin, Calendar, FileText, Loader2 } from "lucide-react";
import { useLocation, useParams } from "wouter";

export default function DaTrackerDetail() {
  const [, navigate] = useLocation();
  const params = useParams<{ id: string }>();
  const daId = parseInt(params.id || "0");

  const { data: da, isLoading } = trpc.daTracker.detail.useQuery({ id: daId }, { enabled: daId > 0 });

  const mapCenter = da ? {
    lat: Number(da.parcelCentroidLat ?? da.centroidLat),
    lng: Number(da.parcelCentroidLng ?? da.centroidLng),
  } : null;
  const hasMapCenter = !!mapCenter && Number.isFinite(mapCenter.lat) && Number.isFinite(mapCenter.lng);
  const locationLabel = da
    ? da.parcelAddress || `Block ${da.block ?? "—"}, Section ${da.section ?? "—"}, ${da.division || "—"} ACT`
    : "";
  const mapPolygon = da?.parcelPolygonJson || da?.polygonJson;

  const handleMapReady = (map: google.maps.Map) => {
    if (!da || !hasMapCenter || !mapCenter) return;

    map.setCenter(mapCenter);
    map.setZoom(17);

    new google.maps.Marker({
      position: mapCenter,
      map,
      title: locationLabel || `DA ${da.daNumber}`,
    });

    if (mapPolygon && Array.isArray(mapPolygon)) {
      const rings = mapPolygon as number[][][];
      const bounds = new google.maps.LatLngBounds();
      for (const ring of rings) {
        const path = ring.map(([lng, lat]) => ({ lat, lng }));
        path.forEach(point => bounds.extend(point));
        new google.maps.Polygon({
          paths: path,
          map,
          strokeColor: "#3b82f6",
          strokeWeight: 2,
          fillColor: "#3b82f6",
          fillOpacity: 0.15,
        });
      }
      map.fitBounds(bounds, 32);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!da) {
    return (
      <div className="text-center py-20 text-muted-foreground">
        <p>DA not found.</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate("/da-tracker/list")}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Back to List
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/da-tracker/list")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <FileText className="h-5 w-5" /> DA {da.daNumber}
          </h1>
          <p className="text-muted-foreground text-sm">{da.division}, {da.district}</p>
        </div>
        <div className="ml-auto">
          <Badge variant={da.removedAt ? "destructive" : "default"}>
            {da.removedAt ? "Removed" : "Active"}
          </Badge>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Details */}
        <Card>
          <CardHeader>
            <CardTitle>Application Details</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">DA Number</span>
                <p className="font-medium">{da.daNumber}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Object ID</span>
                <p className="font-medium">{da.objectId}</p>
              </div>
              <div>
                <span className="text-muted-foreground">District</span>
                <p className="font-medium">{da.district || "—"}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Division</span>
                <p className="font-medium">{da.division || "—"}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Section</span>
                <p className="font-medium">{da.section ?? "—"}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Block</span>
                <p className="font-medium">{da.block ?? "—"}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Application Type</span>
                <p className="font-medium">{da.applicationType || "—"}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Subclass</span>
                <Badge variant="outline">{da.subclass || "—"}</Badge>
              </div>
              <div>
                <span className="text-muted-foreground">Activity Code</span>
                <p className="font-medium">{da.activity ?? "—"}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Block Key</span>
                <p className="font-medium">{da.blockKey ?? "—"}</p>
              </div>
              <div>
                <span className="text-muted-foreground flex items-center gap-1"><Calendar className="h-3 w-3" /> Lodgement Date</span>
                <p className="font-medium">{da.lodgementDate ? new Date(da.lodgementDate).toLocaleDateString("en-AU") : "—"}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Shape Area</span>
                <p className="font-medium">{da.shapeArea ? `${da.shapeArea.toFixed(1)} m²` : "—"}</p>
              </div>
              <div>
                <span className="text-muted-foreground">First Seen</span>
                <p className="font-medium">{da.firstSeenAt ? new Date(da.firstSeenAt).toLocaleString("en-AU") : "—"}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Last Seen</span>
                <p className="font-medium">{da.lastSeenAt ? new Date(da.lastSeenAt).toLocaleString("en-AU") : "—"}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Map */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MapPin className="h-4 w-4" /> Location
            </CardTitle>
            <p className="text-sm text-muted-foreground">{locationLabel}</p>
          </CardHeader>
          <CardContent className="p-0 h-[400px]">
            {hasMapCenter && mapCenter ? (
              <MapView
                key={`${da.id}-${mapCenter.lat}-${mapCenter.lng}`}
                initialCenter={mapCenter}
                initialZoom={17}
                onMapReady={handleMapReady}
                className="w-full h-full rounded-b-lg"
              />
            ) : (
              <div className="flex items-center justify-center h-full text-muted-foreground">
                No location data available
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
