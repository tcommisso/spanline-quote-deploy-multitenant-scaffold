/// <reference types="@types/google.maps" />

import { useEffect, useRef } from "react";
import { usePersistFn } from "@/hooks/usePersistFn";
import { cn } from "@/lib/utils";

type LeafletApi = any;

declare global {
  interface Window {
    L?: LeafletApi;
    google?: typeof google;
  }
}

const LEAFLET_CSS_ID = "leaflet-css";
const LEAFLET_SCRIPT_ID = "leaflet-script";
const LEAFLET_CSS_URL = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
const LEAFLET_SCRIPT_URL = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";

let mapScriptPromise: Promise<void> | null = null;

function loadMapScript() {
  if (window.L) {
    installGoogleCompat(window.L);
    return Promise.resolve();
  }
  if (mapScriptPromise) return mapScriptPromise;

  mapScriptPromise = new Promise<void>((resolve, reject) => {
    if (!document.getElementById(LEAFLET_CSS_ID)) {
      const link = document.createElement("link");
      link.id = LEAFLET_CSS_ID;
      link.rel = "stylesheet";
      link.href = LEAFLET_CSS_URL;
      document.head.appendChild(link);
    }

    const existingScript = document.getElementById(LEAFLET_SCRIPT_ID) as HTMLScriptElement | null;
    if (existingScript) {
      existingScript.addEventListener("load", () => {
        if (!window.L) {
          reject(new Error("Leaflet loaded without exposing map API"));
          return;
        }
        installGoogleCompat(window.L);
        resolve();
      });
      return;
    }

    const script = document.createElement("script");
    script.id = LEAFLET_SCRIPT_ID;
    script.src = LEAFLET_SCRIPT_URL;
    script.async = true;
    script.crossOrigin = "anonymous";
    script.onload = () => {
      if (!window.L) {
        reject(new Error("Leaflet loaded without exposing map API"));
        return;
      }
      installGoogleCompat(window.L);
      resolve();
    };
    script.onerror = () => {
      mapScriptPromise = null;
      reject(new Error("Failed to load OpenStreetMap renderer"));
    };
    document.head.appendChild(script);
  });
  return mapScriptPromise;
}

function installGoogleCompat(L: LeafletApi) {
  if (window.google?.maps?.Map) return;

  class CompatLatLngBounds {
    private bounds = L.latLngBounds([]);

    extend(position: google.maps.LatLngLiteral) {
      this.bounds.extend([position.lat, position.lng]);
      return this;
    }

    toLeafletBounds() {
      return this.bounds;
    }
  }

  class CompatMap {
    private map: any;

    constructor(element: HTMLElement, options: any) {
      this.map = L.map(element, {
        center: [options.center.lat, options.center.lng],
        zoom: options.zoom,
        zoomControl: options.zoomControl !== false,
      });
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      }).addTo(this.map);
    }

    getLeafletMap() {
      return this.map;
    }

    setCenter(position: google.maps.LatLngLiteral) {
      this.map.setView([position.lat, position.lng], this.map.getZoom());
    }

    setZoom(zoom: number) {
      this.map.setZoom(zoom);
    }

    fitBounds(bounds: CompatLatLngBounds, padding?: number) {
      const leafletBounds = bounds.toLeafletBounds();
      if (leafletBounds.isValid()) {
        this.map.fitBounds(leafletBounds, { padding: [padding || 24, padding || 24] });
      }
    }
  }

  class CompatMarker {
    private layer: any;
    private map: CompatMap | null;

    constructor(options: any) {
      this.map = options.map ?? null;
      const position = options.position;
      if (options.content) {
        this.layer = L.marker([position.lat, position.lng], {
          title: options.title,
          icon: L.divIcon({
            html: options.content,
            className: "osm-advanced-marker",
            iconSize: undefined,
          }),
        });
      } else if (options.icon?.path === "CIRCLE") {
        this.layer = L.circleMarker([position.lat, position.lng], {
          radius: Math.max(4, Math.sqrt(Number(options.icon.scale || 8)) * 2),
          color: options.icon.strokeColor || options.icon.fillColor || "#2563eb",
          weight: options.icon.strokeWeight ?? 2,
          fillColor: options.icon.fillColor || "#2563eb",
          fillOpacity: options.icon.fillOpacity ?? 0.9,
        });
      } else {
        this.layer = L.marker([position.lat, position.lng], { title: options.title });
      }
      if (this.map) this.layer.addTo(this.map.getLeafletMap());
    }

    addListener(event: string, handler: (...args: any[]) => void) {
      this.layer.on(event, handler);
      return { remove: () => this.layer.off(event, handler) };
    }

    setMap(map: CompatMap | null) {
      if (this.map) this.map.getLeafletMap().removeLayer(this.layer);
      this.map = map;
      if (this.map) this.layer.addTo(this.map.getLeafletMap());
    }
  }

  class CompatInfoWindow {
    private content: string;

    constructor(options: { content: string }) {
      this.content = options.content;
    }

    open(_map: CompatMap, marker: CompatMarker) {
      (marker as any).layer.bindPopup(this.content, { maxWidth: 360 }).openPopup();
    }
  }

  class CompatPolygon {
    private layer: any;
    private map: CompatMap | null = null;

    constructor(options: any) {
      this.layer = L.polygon(
        (options.paths || []).map((p: google.maps.LatLngLiteral) => [p.lat, p.lng]),
        {
          color: options.strokeColor || "#2563eb",
          weight: options.strokeWeight ?? 2,
          opacity: options.strokeOpacity ?? 0.8,
          fillColor: options.fillColor || options.strokeColor || "#2563eb",
          fillOpacity: options.fillOpacity ?? 0.15,
        }
      );
      this.setMap(options.map ?? null);
    }

    setMap(map: CompatMap | null) {
      if (this.map) this.map.getLeafletMap().removeLayer(this.layer);
      this.map = map;
      if (this.map) this.layer.addTo(this.map.getLeafletMap());
    }
  }

  class CompatPolyline {
    private layer: any;
    private map: CompatMap | null = null;

    constructor(options: any) {
      this.layer = L.polyline(
        (options.path || []).map((p: google.maps.LatLngLiteral) => [p.lat, p.lng]),
        {
          color: options.strokeColor || "#2563eb",
          weight: options.strokeWeight ?? 3,
          opacity: options.strokeOpacity ?? 0.9,
        }
      );
      this.setMap(options.map ?? null);
    }

    setMap(map: CompatMap | null) {
      if (this.map) this.map.getLeafletMap().removeLayer(this.layer);
      this.map = map;
      if (this.map) this.layer.addTo(this.map.getLeafletMap());
    }
  }

  window.google = {
    maps: {
      Map: CompatMap as any,
      Marker: CompatMarker as any,
      InfoWindow: CompatInfoWindow as any,
      LatLngBounds: CompatLatLngBounds as any,
      Polygon: CompatPolygon as any,
      Polyline: CompatPolyline as any,
      SymbolPath: { CIRCLE: "CIRCLE" } as any,
      marker: {
        AdvancedMarkerElement: CompatMarker as any,
      },
    } as any,
  } as any;
}

interface MapViewProps {
  className?: string;
  initialCenter?: google.maps.LatLngLiteral;
  initialZoom?: number;
  onMapReady?: (map: google.maps.Map) => void;
  onMapError?: (message: string) => void;
}

export function MapView({
  className,
  initialCenter = { lat: -35.2809, lng: 149.13 },
  initialZoom = 12,
  onMapReady,
  onMapError,
}: MapViewProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<google.maps.Map | null>(null);

  const init = usePersistFn(async () => {
    try {
      await loadMapScript();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to load OpenStreetMap renderer";
      console.error(message);
      onMapError?.(message);
      return;
    }
    if (!mapContainer.current) return;
    if (map.current) return;

    map.current = new window.google!.maps.Map(mapContainer.current, {
      zoom: initialZoom,
      center: initialCenter,
      zoomControl: true,
    });
    onMapReady?.(map.current);
  });

  useEffect(() => {
    init();
  }, [init]);

  return <div ref={mapContainer} className={cn("w-full h-[500px]", className)} />;
}
