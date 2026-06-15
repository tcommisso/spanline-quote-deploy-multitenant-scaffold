import { useState, useEffect, useMemo, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { computePerSideInset, type PerSideSetbacks } from "@/lib/polygonInset";
import { Maximize2, Minimize2 } from "lucide-react";

interface SitePlanDiagramProps {
  /** Property boundary coordinates [lng, lat][] - if available from parcel lookup */
  boundaryCoords?: [number, number][];
  /** Property frontage in metres */
  propertyFrontageM?: number;
  /** Property depth in metres */
  propertyDepthM?: number;
  /** Property area in sqm */
  propertyAreaSqm?: number;
  /** Structure width in mm */
  structureWidthMm?: number;
  /** Structure length/projection in mm */
  structureLengthMm?: number;
  /** Setback from front boundary in mm (optional) */
  setbackFrontMm?: number;
  /** Setback from left boundary in mm (optional) */
  setbackLeftMm?: number;
  /** Setback from rear boundary in mm (optional) */
  setbackRearMm?: number;
  /** Setback from right boundary in mm (optional) */
  setbackRightMm?: number;
  /** House walls - which sides of the structure attach to the house */
  houseWalls?: string[];
  /** Lot identifier */
  lotId?: string;
  /** Suburb */
  suburb?: string;
  /** Centroid [lng, lat] for satellite image */
  centroid?: [number, number];
  /** Structure position offset in metres from default position */
  structureOffsetX?: number;
  structureOffsetY?: number;
  /** Structure rotation in degrees */
  structureRotation?: number;
  /** Callback when structure is dragged to a new position */
  onStructureDrag?: (x: number, y: number) => void;
  /** Callback when structure is rotated */
  onStructureRotate?: (degrees: number) => void;
  /** Whether drag/rotate is enabled */
  draggable?: boolean;
  /** Callback when satellite image data URL is loaded (for caching) */
  onSatelliteLoaded?: (dataUrl: string) => void;
  /** Custom color for the setback envelope line (hex string) */
  setbackColor?: string;
  /** Whether the diagram is in expanded/fullscreen mode */
  expanded?: boolean;
  /** Callback to toggle expanded mode */
  onToggleExpand?: () => void;
}

/**
 * Parametric SVG Site Plan Diagram with Satellite Image Background
 * Shows property boundary with structure footprint, setbacks, dimensions, and lot details.
 * When parcel data is available, overlays the boundary on a Google Maps satellite image.
 */
export default function SitePlanDiagram({
  boundaryCoords,
  propertyFrontageM,
  propertyDepthM,
  propertyAreaSqm,
  structureWidthMm,
  structureLengthMm,
  setbackFrontMm,
  setbackLeftMm,
  setbackRearMm,
  setbackRightMm,
  houseWalls = [],
  lotId,
  suburb,
  centroid,
  structureOffsetX = 0,
  structureOffsetY = 0,
  structureRotation = 0,
  onStructureDrag,
  onStructureRotate,
  draggable = false,
  onSatelliteLoaded,
  setbackColor = "#FF6B35",
  expanded = false,
  onToggleExpand,
}: SitePlanDiagramProps) {
  const svgW = expanded ? 960 : 480;
  const svgH = expanded ? 840 : 420;
  const padding = 55;

  // Convert structure dimensions from mm to metres
  const structureWidthM = (structureWidthMm || 0) / 1000;
  const structureLengthM = (structureLengthMm || 0) / 1000;

  // Use provided dimensions or defaults
  const frontageM = propertyFrontageM || 15;
  const depthM = propertyDepthM || 30;

  // Calculate scale to fit property in SVG (for fallback non-satellite mode)
  const drawW = svgW - padding * 2;
  const drawH = svgH - padding * 2;
  const scale = Math.min(drawW / frontageM, drawH / depthM);

  // Property boundary rectangle (centered) - used in fallback mode
  const propW = frontageM * scale;
  const propH = depthM * scale;
  const propX = (svgW - propW) / 2;
  const propY = (svgH - propH) / 2;

  // Calculate zoom level based on boundary extents (auto-zoom to fit property)
  const zoom = useMemo(() => {
    if (boundaryCoords && boundaryCoords.length >= 3 && centroid) {
      let minLng = Infinity, maxLng = -Infinity, minLat = Infinity, maxLat = Infinity;
      for (const [lng, lat] of boundaryCoords) {
        if (lng < minLng) minLng = lng;
        if (lng > maxLng) maxLng = lng;
        if (lat < minLat) minLat = lat;
        if (lat > maxLat) maxLat = lat;
      }
      // Fix: need correct min/max
      let minLat2 = Infinity, maxLat2 = -Infinity;
      for (const [, lat] of boundaryCoords) {
        if (lat < minLat2) minLat2 = lat;
        if (lat > maxLat2) maxLat2 = lat;
      }
      const midLat = (minLat2 + maxLat2) / 2;
      const extentLngM = (maxLng - minLng) * 111320 * Math.cos(midLat * Math.PI / 180);
      const extentLatM = (maxLat2 - minLat2) * 111320;
      const maxExtentM = Math.max(extentLngM, extentLatM);
      const cosLat = Math.cos(midLat * Math.PI / 180);
      const targetZoom = Math.log2((0.7 * 480 * 156543.03 * cosLat) / maxExtentM);
      return Math.max(15, Math.min(21, Math.floor(targetZoom)));
    }
    const maxDim = Math.max(frontageM, depthM);
    if (maxDim > 100) return 16;
    if (maxDim > 60) return 17;
    if (maxDim > 40) return 18;
    if (maxDim > 20) return 19;
    return 20;
  }, [frontageM, depthM, boundaryCoords, centroid]);

  // Mercator projection helper - converts metres offset to SVG pixels
  const metersPerPx = useMemo(() => {
    if (!centroid) return frontageM / propW;
    const lat = centroid[1];
    // Resolution at this zoom: metres per pixel in the 480x420 image
    return (156543.03 * Math.cos(lat * Math.PI / 180) / Math.pow(2, zoom));
  }, [centroid, zoom, frontageM, propW]);

  // Real boundary polygon (if coordinates provided)
  const boundaryData = useMemo(() => {
    if (!boundaryCoords || boundaryCoords.length < 3) return null;

    if (centroid && centroid[0] && centroid[1]) {
      const [centerLng, centerLat] = centroid;
      const worldScale = 256 * Math.pow(2, zoom);
      const centerWorldX = ((centerLng + 180) / 360) * worldScale;
      const centerWorldY = (worldScale / 2) - (worldScale * Math.log(Math.tan(Math.PI / 4 + (centerLat * Math.PI / 180) / 2)) / (2 * Math.PI));

      const imgW = 480;
      const imgH = 420;

      const svgPoints = boundaryCoords.map(([lng, lat]) => {
        const worldX = ((lng + 180) / 360) * worldScale;
        const worldY = (worldScale / 2) - (worldScale * Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI / 180) / 2)) / (2 * Math.PI));
        const px = (worldX - centerWorldX) + imgW / 2;
        const py = (worldY - centerWorldY) + imgH / 2;
        return { x: (px / imgW) * svgW, y: (py / imgH) * svgH };
      });

      const path = svgPoints.map(p => `${p.x},${p.y}`).join(" ");

      // Calculate edge lengths in metres
      const edges: { midX: number; midY: number; lengthM: number; angle: number; x1: number; y1: number; x2: number; y2: number }[] = [];
      for (let i = 0; i < boundaryCoords.length; i++) {
        const j = (i + 1) % boundaryCoords.length;
        const [lng1, lat1] = boundaryCoords[i];
        const [lng2, lat2] = boundaryCoords[j];
        const dLat = (lat2 - lat1) * 111320;
        const dLng = (lng2 - lng1) * 111320 * Math.cos(((lat1 + lat2) / 2) * Math.PI / 180);
        const distM = Math.sqrt(dLat * dLat + dLng * dLng);
        if (distM < 0.5) continue;
        const midX = (svgPoints[i].x + svgPoints[j].x) / 2;
        const midY = (svgPoints[i].y + svgPoints[j].y) / 2;
        const angle = Math.atan2(svgPoints[j].y - svgPoints[i].y, svgPoints[j].x - svgPoints[i].x) * 180 / Math.PI;
        edges.push({ midX, midY, lengthM: distM, angle, x1: svgPoints[i].x, y1: svgPoints[i].y, x2: svgPoints[j].x, y2: svgPoints[j].y });
      }

      // Calculate centroid of polygon in SVG space
      const cx = svgPoints.reduce((s, p) => s + p.x, 0) / svgPoints.length;
      const cy = svgPoints.reduce((s, p) => s + p.y, 0) / svgPoints.length;

      return { path, svgPoints, edges, centroidSvg: { x: cx, y: cy } };
    }

    // Fallback: no satellite image
    let minLng = Infinity, maxLng = -Infinity, minLat = Infinity, maxLat = -Infinity;
    for (const [lng, lat] of boundaryCoords) {
      if (lng < minLng) minLng = lng;
      if (lng > maxLng) maxLng = lng;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
    }

    const coordW = maxLng - minLng;
    const coordH = maxLat - minLat;
    if (coordW === 0 || coordH === 0) return null;

    const scaleX = drawW / coordW;
    const scaleY = drawH / coordH;
    const s = Math.min(scaleX, scaleY) * 0.85;

    const offsetX = (svgW - coordW * s) / 2;
    const offsetY = (svgH - coordH * s) / 2;

    const svgPoints = boundaryCoords.map(([lng, lat]) => ({
      x: (lng - minLng) * s + offsetX,
      y: (maxLat - lat) * s + offsetY,
    }));

    const path = svgPoints.map(p => `${p.x},${p.y}`).join(" ");

    const edges: { midX: number; midY: number; lengthM: number; angle: number; x1: number; y1: number; x2: number; y2: number }[] = [];
    for (let i = 0; i < boundaryCoords.length; i++) {
      const j = (i + 1) % boundaryCoords.length;
      const [lng1, lat1] = boundaryCoords[i];
      const [lng2, lat2] = boundaryCoords[j];
      const dLat = (lat2 - lat1) * 111320;
      const dLng = (lng2 - lng1) * 111320 * Math.cos(((lat1 + lat2) / 2) * Math.PI / 180);
      const distM = Math.sqrt(dLat * dLat + dLng * dLng);
      if (distM < 0.5) continue;
      const midX = (svgPoints[i].x + svgPoints[j].x) / 2;
      const midY = (svgPoints[i].y + svgPoints[j].y) / 2;
      const angle = Math.atan2(svgPoints[j].y - svgPoints[i].y, svgPoints[j].x - svgPoints[i].x) * 180 / Math.PI;
      edges.push({ midX, midY, lengthM: distM, angle, x1: svgPoints[i].x, y1: svgPoints[i].y, x2: svgPoints[j].x, y2: svgPoints[j].y });
    }

    const cx = svgPoints.reduce((s, p) => s + p.x, 0) / svgPoints.length;
    const cy = svgPoints.reduce((s, p) => s + p.y, 0) / svgPoints.length;

    return { path, svgPoints, edges, centroidSvg: { x: cx, y: cy } };
  }, [boundaryCoords, drawW, drawH, svgW, svgH, centroid, zoom]);

  const boundaryPath = boundaryData?.path || null;

  // Fetch satellite image via server-side proxy
  const hasCentroid = !!(centroid && centroid[0] && centroid[1]);
  const satQuery = trpc.quotes.staticMapImage.useQuery(
    { lat: centroid?.[1] ?? 0, lng: centroid?.[0] ?? 0, zoom, width: 480, height: 420 },
    { enabled: hasCentroid, staleTime: Infinity, retry: 1 }
  );
  const satelliteUrl = satQuery.data?.dataUrl ?? null;

  const [imgLoaded, setImgLoaded] = useState(false);
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    if (satelliteUrl) {
      setImgLoaded(false);
      setImgError(false);
    }
  }, [satelliteUrl]);

  useEffect(() => {
    if (satelliteUrl && onSatelliteLoaded) {
      onSatelliteLoaded(satelliteUrl);
    }
  }, [satelliteUrl]); // eslint-disable-line react-hooks/exhaustive-deps

  const hasSatellite = !!(satelliteUrl && imgLoaded && !imgError);
  const hasStructure = structureWidthM > 0 && structureLengthM > 0;

  // Structure position in SVG coordinates
  // When satellite/Mercator mode: position is relative to image center in metres, converted to SVG px
  // When fallback mode: position is relative to property rectangle
  const structPos = useMemo(() => {
    if (!hasStructure) return { x: 0, y: 0, widthPx: 0, heightPx: 0 };

    if (hasCentroid && boundaryData) {
      // In Mercator mode, the structure offset is in metres from the boundary centroid
      // Convert metres to SVG pixels using metersPerPx
      const pxPerMeter = 1 / metersPerPx; // pixels per metre in the 480px image
      const svgPxPerMeter = pxPerMeter * (svgW / 480); // scale to SVG viewport

      const structWPx = structureWidthM * svgPxPerMeter;
      const structHPx = structureLengthM * svgPxPerMeter;

      // Default position: centroid of boundary
      const cx = boundaryData.centroidSvg.x;
      const cy = boundaryData.centroidSvg.y;

      // Apply offset (in metres)
      const x = cx - structWPx / 2 + structureOffsetX * svgPxPerMeter;
      const y = cy - structHPx / 2 + structureOffsetY * svgPxPerMeter;

      return { x, y, widthPx: structWPx, heightPx: structHPx };
    }

    // Fallback: use property rectangle scale
    const structW = structureWidthM * scale;
    const structH = structureLengthM * scale;
    let x = propX + (propW - structW) / 2;
    let y = propY + propH * 0.3;

    if (houseWalls.includes("A-B")) y = propY + 30;
    else if (houseWalls.includes("C-D")) y = propY + propH - structH - 10;
    if (houseWalls.includes("D-A")) x = propX + 5;
    else if (houseWalls.includes("B-C")) x = propX + propW - structW - 5;

    x += structureOffsetX * scale;
    y += structureOffsetY * scale;

    return { x, y, widthPx: structW, heightPx: structH };
  }, [hasStructure, hasCentroid, boundaryData, metersPerPx, svgW, structureWidthM, structureLengthM, structureOffsetX, structureOffsetY, scale, propX, propY, propW, propH, houseWalls]);

  // Setback lines as offset polygon (when boundary is available)
  const setbackPolygon = useMemo(() => {
    if (!boundaryData || !boundaryData.svgPoints || boundaryData.svgPoints.length < 3) return null;
    const hasFront = (setbackFrontMm || 0) > 0;
    const hasRear = (setbackRearMm || 0) > 0;
    const hasLeft = (setbackLeftMm || 0) > 0;
    const hasRight = (setbackRightMm || 0) > 0;
    if (!hasFront && !hasRear && !hasLeft && !hasRight) return null;

    // Compute pixels-per-metre for converting setback distances
    const pxPerMeter = hasCentroid
      ? (1 / metersPerPx) * (svgW / 480)
      : scale;

    // Per-side setbacks in SVG pixels
    const setbacksPx: PerSideSetbacks = {
      front: ((setbackFrontMm || 0) / 1000) * pxPerMeter,
      rear: ((setbackRearMm || 0) / 1000) * pxPerMeter,
      left: ((setbackLeftMm || 0) / 1000) * pxPerMeter,
      right: ((setbackRightMm || 0) / 1000) * pxPerMeter,
    };

    const insetPoints = computePerSideInset(boundaryData.svgPoints, setbacksPx);
    if (!insetPoints) return null;

    return insetPoints.map(p => `${p.x},${p.y}`).join(" ");
  }, [boundaryData, setbackFrontMm, setbackRearMm, setbackLeftMm, setbackRightMm, hasCentroid, metersPerPx, svgW, scale]);

  // Drag state
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number; origOffX: number; origOffY: number } | null>(null);
  const [trueScale, setTrueScale] = useState(false);

  const getSvgPoint = useCallback((e: React.MouseEvent) => {
    const svg = (e.target as SVGElement).closest("svg");
    if (!svg) return null;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    return pt.matrixTransform(svg.getScreenCTM()?.inverse());
  }, []);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!draggable || !hasStructure) return;
    e.preventDefault();
    const svgPt = getSvgPoint(e);
    if (!svgPt) return;
    setIsDragging(true);
    setDragStart({ x: svgPt.x, y: svgPt.y, origOffX: structureOffsetX, origOffY: structureOffsetY });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || !dragStart) return;
    const svgPt = getSvgPoint(e);
    if (!svgPt) return;

    // Convert SVG pixel delta to metres
    let pxToMeters: number;
    if (hasCentroid) {
      const svgPxPerMeter = (1 / metersPerPx) * (svgW / 480);
      pxToMeters = 1 / svgPxPerMeter;
    } else {
      pxToMeters = 1 / scale;
    }

    const dx = (svgPt.x - dragStart.x) * pxToMeters;
    const dy = (svgPt.y - dragStart.y) * pxToMeters;
    // Clamp offset to prevent structure from being dragged off-screen
    const maxOffset = Math.max(frontageM, depthM) * 1.5;
    const newX = Math.max(-maxOffset, Math.min(maxOffset, dragStart.origOffX + dx));
    const newY = Math.max(-maxOffset, Math.min(maxOffset, dragStart.origOffY + dy));
    onStructureDrag?.(newX, newY);
  };

  const handleMouseUp = () => {
    setIsDragging(false);
    setDragStart(null);
  };

  // Rotation control
  const handleRotate = (delta: number) => {
    if (!onStructureRotate) return;
    const newRot = ((structureRotation + delta) % 360 + 360) % 360;
    onStructureRotate(newRot);
  };

  return (
    <div className={`border rounded-md p-3 bg-muted/30 ${expanded ? "h-full flex flex-col" : ""}`}>
      {/* Header with lot details */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Site Plan</span>
        <div className="flex items-center gap-2">
          {lotId && (
            <span className="text-[10px] font-medium bg-primary/10 text-primary px-2 py-0.5 rounded">
              {lotId}{suburb ? ` • ${suburb}` : ""}
            </span>
          )}
          {onToggleExpand && (
            <button
              type="button"
              onClick={onToggleExpand}
              className="p-1 rounded hover:bg-muted border text-muted-foreground"
              title={expanded ? "Collapse" : "Expand full screen"}
            >
              {expanded ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
            </button>
          )}
        </div>
      </div>

      {/* Satellite + SVG overlay container */}
      <div className={`relative w-full ${expanded ? "flex-1" : ""}`} style={{ aspectRatio: `${svgW}/${svgH}` }}>
        {/* Satellite image background */}
        {satelliteUrl && !imgError && (
          <img
            src={satelliteUrl}
            alt="Satellite view"
            className={`absolute inset-0 w-full h-full object-cover rounded transition-opacity duration-300 ${imgLoaded ? "opacity-100" : "opacity-0"}`}
            onLoad={() => setImgLoaded(true)}
            onError={() => setImgError(true)}
          />
        )}

        {/* SVG overlay */}
        <svg
          width={svgW}
          height={svgH}
          viewBox={`0 0 ${svgW} ${svgH}`}
          className="relative w-full h-auto"
          style={{ position: "absolute", top: 0, left: 0 }}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
          <defs>
            <pattern id="site-hatch" patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)">
              <line x1="0" y1="0" x2="0" y2="6" stroke="white" strokeWidth="0.3" opacity="0.2" />
            </pattern>
          </defs>

          {/* Semi-transparent overlay for non-satellite mode */}
          {!hasSatellite && (
            <rect x="0" y="0" width={svgW} height={svgH} fill="oklch(0.95 0.01 250)" />
          )}

          {/* Property boundary */}
          {boundaryPath ? (
            <polygon
              points={boundaryPath}
              fill={hasSatellite ? "rgba(255,255,255,0.05)" : "url(#site-hatch)"}
              stroke="#FFD700"
              strokeWidth="2.5"
              strokeLinejoin="round"
            />
          ) : (
            <rect
              x={propX}
              y={propY}
              width={propW}
              height={propH}
              fill={hasSatellite ? "rgba(255,255,255,0.05)" : "url(#site-hatch)"}
              stroke="#FFD700"
              strokeWidth="2.5"
              strokeDasharray="8 4"
            />
          )}

          {/* Setback lines (dashed inset polygon) */}
          {setbackPolygon && (
            <polygon
              points={setbackPolygon}
              fill="none"
              stroke={setbackColor}
              strokeWidth="1.5"
              strokeDasharray="6 4"
              opacity="0.8"
            />
          )}
          {setbackPolygon && (
            <text
              x={boundaryData!.centroidSvg.x}
              y={boundaryData!.centroidSvg.y + (structPos.heightPx / 2) + 20}
              fontSize="7"
              fill={setbackColor}
              textAnchor="middle"
              opacity="0.9"
            >
              SETBACK ENVELOPE
            </text>
          )}

          {/* Polygon edge dimension labels */}
          {boundaryData?.edges && boundaryData.edges.length > 0 && (
            <>
              {boundaryData.edges.map((edge, i) => {
                // Offset label perpendicular to edge, away from centroid
                const rad = (edge.angle + 90) * Math.PI / 180;
                const cx = boundaryData.centroidSvg.x;
                const cy = boundaryData.centroidSvg.y;
                const testX = edge.midX + Math.cos(rad) * 14;
                const testY = edge.midY + Math.sin(rad) * 14;
                const distFromCenter = Math.hypot(testX - cx, testY - cy);
                const distOpp = Math.hypot(edge.midX - Math.cos(rad) * 14 - cx, edge.midY - Math.sin(rad) * 14 - cy);
                const sign = distFromCenter > distOpp ? 1 : -1;
                const lx = edge.midX + Math.cos(rad) * 14 * sign;
                const ly = edge.midY + Math.sin(rad) * 14 * sign;
                return (
                  <g key={`edge-${i}`}>
                    <rect x={lx - 18} y={ly - 6} width="36" height="12" rx="2" fill="rgba(0,0,0,0.75)" />
                    <text x={lx} y={ly + 3} fontSize="7.5" fill="#FFD700" textAnchor="middle" fontWeight="600">
                      {edge.lengthM.toFixed(1)}m
                    </text>
                  </g>
                );
              })}
            </>
          )}

          {/* Property dimension labels (rectangle fallback) */}
          {!boundaryPath && (
            <>
              <g>
                <line x1={propX} y1={propY + propH + 12} x2={propX + propW} y2={propY + propH + 12} stroke="#FFD700" strokeWidth="1" />
                <line x1={propX} y1={propY + propH + 6} x2={propX} y2={propY + propH + 18} stroke="#FFD700" strokeWidth="0.8" />
                <line x1={propX + propW} y1={propY + propH + 6} x2={propX + propW} y2={propY + propH + 18} stroke="#FFD700" strokeWidth="0.8" />
                <rect x={propX + propW / 2 - 35} y={propY + propH + 18} width="70" height="14" rx="2" fill="rgba(0,0,0,0.75)" />
                <text x={propX + propW / 2} y={propY + propH + 28} fontSize="9" fill="#FFD700" textAnchor="middle" fontWeight="600">
                  {frontageM.toFixed(1)}m frontage
                </text>
              </g>
              <g>
                <line x1={propX - 12} y1={propY} x2={propX - 12} y2={propY + propH} stroke="#FFD700" strokeWidth="1" />
                <line x1={propX - 18} y1={propY} x2={propX - 6} y2={propY} stroke="#FFD700" strokeWidth="0.8" />
                <line x1={propX - 18} y1={propY + propH} x2={propX - 6} y2={propY + propH} stroke="#FFD700" strokeWidth="0.8" />
                <text x={propX - 18} y={propY + propH / 2 + 3} fontSize="9" fill="#FFD700" textAnchor="middle" fontWeight="600" transform={`rotate(-90, ${propX - 18}, ${propY + propH / 2})`}>
                  {depthM.toFixed(1)}m
                </text>
              </g>
            </>
          )}

          {/* Street label at bottom */}
          <rect x={svgW / 2 - 50} y={svgH - 22} width="100" height="16" rx="3" fill="rgba(0,0,0,0.7)" />
          <text x={svgW / 2} y={svgH - 10} fontSize="8" fill="white" textAnchor="middle" fontWeight="500" letterSpacing="1">
            STREET FRONTAGE
          </text>

          {/* North arrow */}
          <g transform={`translate(${svgW - 35}, 18)`}>
            <circle cx="0" cy="12" r="14" fill="rgba(0,0,0,0.6)" />
            <line x1="0" y1="20" x2="0" y2="4" stroke="white" strokeWidth="1.5" />
            <polygon points="-4,9 0,3 4,9" fill="white" />
            <text x="0" y="28" fontSize="7" fill="white" textAnchor="middle" fontWeight="bold">N</text>
          </g>

          {/* Structure footprint with rotation */}
          {hasStructure && (() => {
            // Enforce minimum visual size for small structures on large properties
            const minVisualPx = trueScale ? 0 : 20;
            const displayW = Math.max(structPos.widthPx, minVisualPx);
            const displayH = Math.max(structPos.heightPx, minVisualPx > 0 ? minVisualPx * (structureLengthM / structureWidthM) : 0);
            const isScaledUp = !trueScale && displayW > structPos.widthPx * 1.2;
            // Center the display rect on the same center as the true-scale rect
            const cx = structPos.x + structPos.widthPx / 2;
            const cy = structPos.y + structPos.heightPx / 2;
            const dispX = cx - displayW / 2;
            const dispY = cy - displayH / 2;
            return (
              <g
                style={{ cursor: draggable ? (isDragging ? "grabbing" : "grab") : "default" }}
                onMouseDown={handleMouseDown}
                transform={`rotate(${structureRotation}, ${cx}, ${cy})`}
              >
                {/* True-scale outline (thin) when scaled up */}
                {isScaledUp && (
                  <rect
                    x={structPos.x}
                    y={structPos.y}
                    width={structPos.widthPx}
                    height={structPos.heightPx}
                    fill="none"
                    stroke="rgba(34,197,94,0.5)"
                    strokeWidth="1"
                    strokeDasharray="2 1"
                  />
                )}
                {/* Display rect - visible at minimum size */}
                <rect
                  x={dispX}
                  y={dispY}
                  width={displayW}
                  height={displayH}
                  fill="rgba(34,197,94,0.25)"
                  stroke="rgba(34,197,94,0.95)"
                  strokeWidth="2.5"
                  strokeDasharray="6 3"
                  rx="1"
                />
                {/* Ridge line (center) for roof indication */}
                <line
                  x1={cx}
                  y1={dispY + 4}
                  x2={cx}
                  y2={dispY + displayH - 4}
                  stroke="rgba(34,197,94,0.6)"
                  strokeWidth="1"
                  strokeDasharray="3 2"
                />
                {/* Structure label */}
                <text
                  x={cx}
                  y={cy - 5}
                  fontSize="8"
                  fill="white"
                  textAnchor="middle"
                  fontWeight="bold"
                  style={{ textShadow: "0 1px 3px rgba(0,0,0,0.9)" }}
                >
                  PROPOSED ROOF
                </text>
                <text
                  x={cx}
                  y={cy + 7}
                  fontSize="7"
                  fill="white"
                  textAnchor="middle"
                  style={{ textShadow: "0 1px 3px rgba(0,0,0,0.9)" }}
                >
                  {structureWidthM.toFixed(1)}m × {structureLengthM.toFixed(1)}m
                </text>
                {isScaledUp && (
                  <text
                    x={cx}
                    y={cy + 17}
                    fontSize="5.5"
                    fill="rgba(34,197,94,0.8)"
                    textAnchor="middle"
                    fontStyle="italic"
                  >
                    (enlarged for visibility)
                  </text>
                )}

                {/* Drag hint */}
                {draggable && !isDragging && (
                  <text x={cx} y={dispY + displayH + 12} fontSize="6.5" fill="rgba(34,197,94,0.7)" textAnchor="middle" fontStyle="italic">
                    drag to reposition
                  </text>
                )}
              </g>
            );
          })()}

          {/* Area badge */}
          {propertyAreaSqm && (
            <g>
              <rect x={svgW - 65} y={svgH - 55} width="55" height="14" rx="3" fill="rgba(0,0,0,0.7)" />
              <text x={svgW - 37} y={svgH - 45} fontSize="8" fill="white" textAnchor="middle" fontWeight="500">
                {propertyAreaSqm.toFixed(0)} m²
              </text>
            </g>
          )}

          {/* Lot details badge (top-left) */}
          {lotId && (
            <g>
              <rect x="8" y="8" width={Math.max(lotId.length * 5.5 + 10, 80)} height="14" rx="3" fill="rgba(0,0,0,0.75)" />
              <text x="13" y="18" fontSize="8" fill="#FFD700" fontWeight="600">
                {lotId}
              </text>
            </g>
          )}
          {suburb && (
            <g>
              <rect x="8" y="25" width={Math.max(suburb.length * 5 + 10, 60)} height="12" rx="2" fill="rgba(0,0,0,0.65)" />
              <text x="13" y="34" fontSize="7.5" fill="white" fontWeight="500">
                {suburb}
              </text>
            </g>
          )}
        </svg>
      </div>

      {/* Rotation controls */}
      {draggable && hasStructure && (
        <div className="flex items-center justify-center gap-2 mt-2">
          <button
            type="button"
            onClick={() => handleRotate(-1)}
            className="px-2 py-0.5 text-xs bg-muted hover:bg-muted/80 rounded border text-muted-foreground"
          >
            ↺ -1°
          </button>
          <span className="text-xs text-muted-foreground font-mono min-w-[3rem] text-center">
            {structureRotation.toFixed(0)}°
          </span>
          <button
            type="button"
            onClick={() => handleRotate(1)}
            className="px-2 py-0.5 text-xs bg-muted hover:bg-muted/80 rounded border text-muted-foreground"
          >
            ↻ +1°
          </button>
          <button
            type="button"
            onClick={() => onStructureRotate?.(0)}
            className="px-2 py-0.5 text-xs bg-muted hover:bg-muted/80 rounded border text-muted-foreground"
          >
            Reset
          </button>
          <button
            type="button"
            onClick={() => setTrueScale(!trueScale)}
            className={`px-2 py-0.5 text-xs rounded border ${trueScale ? 'bg-green-600 text-white border-green-700' : 'bg-muted hover:bg-muted/80 text-muted-foreground'}`}
          >
            {trueScale ? '✓ True Scale' : 'True Scale'}
          </button>
        </div>
      )}
    </div>
  );
}
