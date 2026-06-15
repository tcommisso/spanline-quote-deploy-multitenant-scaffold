import { useRef, useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Printer, Download } from "lucide-react";
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import { computePerSideInset, type PerSideSetbacks, type Point2D } from "@/lib/polygonInset";
import { trpc } from "@/lib/trpc";

interface SitePlanPrintPageProps {
  /** Property boundary coordinates [lng, lat][] */
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
  /** Setback from front boundary in mm */
  setbackFrontMm?: number;
  /** Setback from left boundary in mm */
  setbackLeftMm?: number;
  /** Setback from rear boundary in mm */
  setbackRearMm?: number;
  /** Setback from right boundary in mm */
  setbackRightMm?: number;
  /** House walls */
  houseWalls?: string[];
  /** Lot identifier (Block/Section) */
  lotId?: string;
  /** Suburb */
  suburb?: string;
  /** Structure position offset */
  structureOffsetX?: number;
  structureOffsetY?: number;
  /** Structure rotation in degrees */
  structureRotation?: number;
  /** Client name */
  clientName?: string;
  /** Site address */
  siteAddress?: string;
  /** Quote number */
  quoteNumber?: string;
  /** Design adviser name */
  designAdviser?: string;
  /** Roof type */
  roofType?: string;
  /** Setback envelope color */
  setbackColor?: string;
  /** Post positions encoded as "side:percent" e.g. ["B-C:0", "B-C:50", "C-D:75"] */
  postPositions?: string[];
  /** Centroid [lng, lat] for satellite image alignment */
  centroid?: [number, number];
  /** Cached satellite image data URL */
  satelliteImageUrl?: string;
}

/**
 * A3 Print-Ready Site Plan Page
 * Full-page layout with title block, scale bar, north arrow, and site plan diagram.
 * Uses Mercator projection to properly align satellite image with boundary overlay.
 * Optimised for A3 landscape printing for council submission.
 */
export default function SitePlanPrintPage(props: SitePlanPrintPageProps) {
  const printRef = useRef<HTMLDivElement>(null);

  const {
    boundaryCoords,
    propertyFrontageM = 20,
    propertyDepthM = 30,
    propertyAreaSqm,
    structureWidthMm = 6000,
    structureLengthMm = 4000,
    setbackFrontMm = 0,
    setbackLeftMm = 0,
    setbackRearMm = 0,
    setbackRightMm = 0,
    houseWalls = [],
    lotId,
    suburb,
    structureOffsetX = 0,
    structureOffsetY = 0,
    structureRotation = 0,
    clientName = "",
    siteAddress = "",
    quoteNumber = "",
    designAdviser = "",
    roofType = "",
    setbackColor = "#FF6B35",
    postPositions = [],
    centroid,
    satelliteImageUrl,
  } = props;

  // SVG dimensions for A3 landscape (upscaled for quality)
  const svgW = 1120;
  const svgH = 780;
  const margin = 60;
  const titleBlockH = 100;
  const drawAreaW = svgW - margin * 2;
  const drawAreaH = svgH - margin - titleBlockH - 20;

  // Satellite image fetch dimensions (API max 640)
  const fetchImgW = 640;
  const fetchImgH = 480;

  // Auto-zoom based on boundary extents
  const hasCentroid = !!(centroid && centroid[0] && centroid[1]);
  const hasBoundary = !!(boundaryCoords && boundaryCoords.length >= 3);

  const zoom = useMemo(() => {
    if (hasBoundary && centroid) {
      const lngs = boundaryCoords!.map(c => c[0]);
      const lats = boundaryCoords!.map(c => c[1]);
      const minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
      const minLat = Math.min(...lats), maxLat = Math.max(...lats);
      const midLat = (minLat + maxLat) / 2;
      const extentLngM = (maxLng - minLng) * 111320 * Math.cos(midLat * Math.PI / 180);
      const extentLatM = (maxLat - minLat) * 111320;
      const maxExtentM = Math.max(extentLngM, extentLatM);
      const cosLat = Math.cos(midLat * Math.PI / 180);
      // Use 0.7 * fetchImgW to leave padding around the boundary
      const targetZoom = Math.log2((0.7 * fetchImgW * 156543.03 * cosLat) / maxExtentM);
      return Math.max(15, Math.min(21, Math.floor(targetZoom)));
    }
    return 19;
  }, [boundaryCoords, centroid, hasBoundary]);

  // Satellite image query
  const satQuery = trpc.quotes.staticMapImage.useQuery(
    { lat: centroid?.[1] ?? 0, lng: centroid?.[0] ?? 0, zoom, width: fetchImgW, height: fetchImgH },
    { enabled: hasCentroid && !satelliteImageUrl, staleTime: Infinity, retry: 1 }
  );
  const satDataUrl = satelliteImageUrl || satQuery.data?.dataUrl || null;
  const [satImgLoaded, setSatImgLoaded] = useState(false);
  const [satImgError, setSatImgError] = useState(false);
  useEffect(() => { setSatImgLoaded(false); setSatImgError(false); }, [satDataUrl]);
  const hasSatellite = !!(satDataUrl && satImgLoaded && !satImgError);

  // Convert mm to metres
  const structureWM = structureWidthMm / 1000;
  const structureLM = structureLengthMm / 1000;
  const setFrontM = setbackFrontMm / 1000;
  const setLeftM = setbackLeftMm / 1000;
  const setRearM = setbackRearMm / 1000;
  const setRightM = setbackRightMm / 1000;

  // ─── Mercator Projection (aligns with satellite image) ─────────────────────
  // This converts [lng, lat] to SVG pixel coordinates that match the satellite image position.
  // The satellite image is fetched at fetchImgW × fetchImgH and displayed in the drawArea.
  const toSvgPoint = useMemo(() => {
    if (!hasCentroid || !centroid) {
      // Fallback: simple bounding-box projection
      return null;
    }
    const [centerLng, centerLat] = centroid;
    const worldScale = 256 * Math.pow(2, zoom);
    const centerWorldX = ((centerLng + 180) / 360) * worldScale;
    const centerWorldY = (worldScale / 2) - (worldScale * Math.log(Math.tan(Math.PI / 4 + (centerLat * Math.PI / 180) / 2)) / (2 * Math.PI));

    return (lng: number, lat: number): { x: number; y: number } => {
      const worldX = ((lng + 180) / 360) * worldScale;
      const worldY = (worldScale / 2) - (worldScale * Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI / 180) / 2)) / (2 * Math.PI));
      // Position in the fetched image pixel space
      const imgPx = (worldX - centerWorldX) + fetchImgW / 2;
      const imgPy = (worldY - centerWorldY) + fetchImgH / 2;
      // Scale from fetched image space to SVG draw area space
      const svgX = margin + (imgPx / fetchImgW) * drawAreaW;
      const svgY = margin + (imgPy / fetchImgH) * drawAreaH;
      return { x: svgX, y: svgY };
    };
  }, [hasCentroid, centroid, zoom, fetchImgW, fetchImgH, margin, drawAreaW, drawAreaH]);

  // Metres per pixel in the SVG draw area (for structure sizing and scale bar)
  const metersPerSvgPx = useMemo(() => {
    if (hasCentroid && centroid) {
      const lat = centroid[1];
      // Resolution at this zoom: metres per pixel in the fetched image
      const mPerFetchPx = 156543.03 * Math.cos(lat * Math.PI / 180) / Math.pow(2, zoom);
      // Scale to SVG draw area
      return mPerFetchPx * (fetchImgW / drawAreaW);
    }
    // Fallback
    return propertyFrontageM / (drawAreaW * 0.95);
  }, [hasCentroid, centroid, zoom, fetchImgW, drawAreaW, propertyFrontageM]);

  const pxPerM = 1 / metersPerSvgPx;

  // ─── Boundary polygon in SVG coordinates ───────────────────────────────────
  const boundaryResult = useMemo(() => {
    if (!hasBoundary) return null;
    const coords = boundaryCoords!;

    if (toSvgPoint) {
      // Mercator mode — aligned with satellite
      const svgPoints = coords.map(([lng, lat]) => toSvgPoint(lng, lat));
      const path = svgPoints.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ") + " Z";
      const cx = svgPoints.reduce((s, p) => s + p.x, 0) / svgPoints.length;
      const cy = svgPoints.reduce((s, p) => s + p.y, 0) / svgPoints.length;

      // Edge dimensions
      const edges: { x1: number; y1: number; x2: number; y2: number; midX: number; midY: number; lengthM: number; angle: number }[] = [];
      for (let i = 0; i < coords.length; i++) {
        const j = (i + 1) % coords.length;
        const [lng1, lat1] = coords[i];
        const [lng2, lat2] = coords[j];
        const dLat = (lat2 - lat1) * 111320;
        const dLng = (lng2 - lng1) * 111320 * Math.cos(((lat1 + lat2) / 2) * Math.PI / 180);
        const distM = Math.sqrt(dLat * dLat + dLng * dLng);
        if (distM < 0.5) continue;
        const p1 = svgPoints[i];
        const p2 = svgPoints[j];
        const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x) * 180 / Math.PI;
        edges.push({
          x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y,
          midX: (p1.x + p2.x) / 2, midY: (p1.y + p2.y) / 2,
          lengthM: distM, angle,
        });
      }

      return { path, svgPoints, centroid: { x: cx, y: cy }, edges };
    }

    // Fallback: bounding-box projection (no satellite)
    const lngs = coords.map(c => c[0]);
    const lats = coords.map(c => c[1]);
    const minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
    const minLat = Math.min(...lats), maxLat = Math.max(...lats);
    const lngSpan = maxLng - minLng || 0.001;
    const latSpan = maxLat - minLat || 0.001;
    const polyScaleX = (drawAreaW * 0.95) / lngSpan;
    const polyScaleY = (drawAreaH * 0.95) / latSpan;
    const polyScale = Math.min(polyScaleX, polyScaleY);
    const polyW = lngSpan * polyScale;
    const polyH = latSpan * polyScale;
    const polyOffX = margin + (drawAreaW - polyW) / 2;
    const polyOffY = margin + (drawAreaH - polyH) / 2;

    const svgPoints = coords.map(([lng, lat]) => ({
      x: polyOffX + (lng - minLng) * polyScale,
      y: polyOffY + (maxLat - lat) * polyScale,
    }));
    const path = svgPoints.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ") + " Z";
    const cx = svgPoints.reduce((s, p) => s + p.x, 0) / svgPoints.length;
    const cy = svgPoints.reduce((s, p) => s + p.y, 0) / svgPoints.length;

    const edges: { x1: number; y1: number; x2: number; y2: number; midX: number; midY: number; lengthM: number; angle: number }[] = [];
    for (let i = 0; i < coords.length; i++) {
      const j = (i + 1) % coords.length;
      const [lng1, lat1] = coords[i];
      const [lng2, lat2] = coords[j];
      const dLat = (lat2 - lat1) * 111320;
      const dLng = (lng2 - lng1) * 111320 * Math.cos(((lat1 + lat2) / 2) * Math.PI / 180);
      const distM = Math.sqrt(dLat * dLat + dLng * dLng);
      if (distM < 0.5) continue;
      const p1 = svgPoints[i];
      const p2 = svgPoints[j];
      const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x) * 180 / Math.PI;
      edges.push({
        x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y,
        midX: (p1.x + p2.x) / 2, midY: (p1.y + p2.y) / 2,
        lengthM: distM, angle,
      });
    }

    return { path, svgPoints, centroid: { x: cx, y: cy }, edges };
  }, [hasBoundary, boundaryCoords, toSvgPoint, margin, drawAreaW, drawAreaH]);

  // Polygon centroid (for positioning structure, labels)
  const polyCentroid = boundaryResult?.centroid || { x: margin + drawAreaW / 2, y: margin + drawAreaH / 2 };

  // ─── Structure positioning ─────────────────────────────────────────────────
  const strW = structureWM * pxPerM;
  const strH = structureLM * pxPerM;
  const strX = polyCentroid.x - strW / 2 + structureOffsetX * pxPerM;
  const strY = polyCentroid.y - strH / 2 + structureOffsetY * pxPerM;


  // ─── Setback inset polygon ─────────────────────────────────────────────────
  const hasSetbacks = setFrontM > 0 || setRearM > 0 || setLeftM > 0 || setRightM > 0;
  const setbackInsetPath = useMemo(() => {
    if (!hasSetbacks || !boundaryResult || boundaryResult.svgPoints.length < 3) return "";
    const setbacksPx: PerSideSetbacks = {
      front: setFrontM * pxPerM,
      rear: setRearM * pxPerM,
      left: setLeftM * pxPerM,
      right: setRightM * pxPerM,
    };
    const insetPts = computePerSideInset(boundaryResult.svgPoints, setbacksPx);
    if (!insetPts) return "";
    return insetPts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ") + " Z";
  }, [hasSetbacks, boundaryResult, setFrontM, setRearM, setLeftM, setRightM, pxPerM]);

  // ─── Fallback property rect (no boundary) ─────────────────────────────────
  const fallbackScale = Math.min(drawAreaW / propertyFrontageM, drawAreaH / propertyDepthM) * 0.95;
  const propW = propertyFrontageM * fallbackScale;
  const propH = propertyDepthM * fallbackScale;
  const propX = margin + (drawAreaW - propW) / 2;
  const propY = margin + (drawAreaH - propH) / 2;

  // Scale bar
  const scaleBarM = (() => {
    const targetPx = 100;
    const targetM = targetPx * metersPerSvgPx;
    const niceSteps = [1, 2, 5, 10, 15, 20, 25, 30, 40, 50, 75, 100];
    let best = niceSteps[0];
    for (const s of niceSteps) {
      if (s <= targetM * 1.5) best = s;
    }
    return best;
  })();
  const scaleBarPx = scaleBarM * pxPerM;

  const today = new Date().toLocaleDateString("en-AU", { day: "2-digit", month: "short", year: "numeric" });

  const [downloading, setDownloading] = useState(false);

  function handlePrint() {
    const el = printRef.current;
    if (!el) return;
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(`<!DOCTYPE html><html><head><title>Site Plan - ${quoteNumber}</title>
      <style>
        @page { size: A3 landscape; margin: 10mm; }
        body { margin: 0; display: flex; align-items: center; justify-content: center; height: 100vh; }
        svg { width: 100%; height: auto; max-height: 100vh; }
      </style></head><body>${el.innerHTML}</body></html>`);
    w.document.close();
    setTimeout(() => { w.print(); }, 300);
  }

  async function handleDownloadPdf() {
    const el = printRef.current;
    if (!el) return;
    setDownloading(true);
    try {
      // Render the SVG container to canvas at high resolution
      const canvas = await html2canvas(el, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        backgroundColor: "#ffffff",
      });
      // A3 landscape dimensions in mm
      const a3W = 420;
      const a3H = 297;
      const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a3" });
      const imgData = canvas.toDataURL("image/png");
      pdf.addImage(imgData, "PNG", 0, 0, a3W, a3H);
      const filename = `Site_Plan_${quoteNumber || "draft"}_${new Date().toISOString().slice(0, 10)}.pdf`;
      pdf.save(filename);
    } catch (err) {
      console.error("PDF generation failed:", err);
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Print-Ready Site Plan (A3 Landscape)</h3>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={handlePrint}>
            <Printer className="h-3.5 w-3.5 mr-1" /> Print A3
          </Button>
          <Button size="sm" variant="outline" onClick={handleDownloadPdf} disabled={downloading}>
            <Download className="h-3.5 w-3.5 mr-1" /> {downloading ? "Generating..." : "Download PDF"}
          </Button>
        </div>
      </div>

      {/* Hidden image for satellite loading */}
      {satDataUrl && (
        <img
          src={satDataUrl}
          alt=""
          className="hidden"
          onLoad={() => setSatImgLoaded(true)}
          onError={() => setSatImgError(true)}
        />
      )}

      <div ref={printRef} className="border rounded-lg overflow-hidden bg-white">
        <svg
          viewBox={`0 0 ${svgW} ${svgH + titleBlockH}`}
          className="w-full h-auto"
          xmlns="http://www.w3.org/2000/svg"
          style={{ fontFamily: "Arial, sans-serif" }}
        >
          {/* Background */}
          <rect width={svgW} height={svgH + titleBlockH} fill="white" />

          {/* Satellite image background (clipped to draw area) */}
          {hasSatellite && (
            <>
              <defs>
                <clipPath id="sat-clip-a3">
                  <rect x={margin} y={margin} width={drawAreaW} height={drawAreaH} />
                </clipPath>
              </defs>
              <image
                href={satDataUrl!}
                x={margin}
                y={margin}
                width={drawAreaW}
                height={drawAreaH}
                preserveAspectRatio="none"
                clipPath="url(#sat-clip-a3)"
                opacity={0.85}
              />
              {/* Light overlay for readability */}
              <rect x={margin} y={margin} width={drawAreaW} height={drawAreaH} fill="rgba(255,255,255,0.1)" />
            </>
          )}

          {/* Border */}
          <rect x={10} y={10} width={svgW - 20} height={svgH + titleBlockH - 20} fill="none" stroke="#333" strokeWidth={2} />
          <rect x={14} y={14} width={svgW - 28} height={svgH + titleBlockH - 28} fill="none" stroke="#333" strokeWidth={0.5} />

          {/* North Arrow */}
          <g transform={`translate(${svgW - 80}, ${margin + 20})`}>
            <line x1={0} y1={30} x2={0} y2={0} stroke="#333" strokeWidth={1.5} />
            <polygon points="0,0 -5,10 5,10" fill="#333" />
            <text x={0} y={-5} textAnchor="middle" fontSize={10} fontWeight="bold" fill="#333">N</text>
            <circle cx={0} cy={15} r={15} fill="none" stroke="#999" strokeWidth={0.5} />
          </g>

          {/* Property Boundary */}
          {boundaryResult ? (
            <path
              d={boundaryResult.path}
              fill="none"
              stroke="#1a1a1a"
              strokeWidth={2}
              strokeDasharray="8,3"
            />
          ) : (
            <rect
              x={propX} y={propY} width={propW} height={propH}
              fill="none" stroke="#1a1a1a" strokeWidth={2} strokeDasharray="8,3"
            />
          )}

          {/* Edge dimension labels */}
          {boundaryResult && boundaryResult.edges.length > 0 ? (
            <>
              {boundaryResult.edges.map((edge, i) => {
                const edgeAngleRad = Math.atan2(edge.y2 - edge.y1, edge.x2 - edge.x1);
                const normalX = Math.cos(edgeAngleRad + Math.PI / 2);
                const normalY = Math.sin(edgeAngleRad + Math.PI / 2);
                const toMidX = edge.midX - polyCentroid.x;
                const toMidY = edge.midY - polyCentroid.y;
                const dot = normalX * toMidX + normalY * toMidY;
                const outSign = dot >= 0 ? 1 : -1;
                const offsetDist = 18;
                const labelX = edge.midX + normalX * outSign * offsetDist;
                const labelY = edge.midY + normalY * outSign * offsetDist;

                let textAngle = edge.angle;
                if (textAngle > 90) textAngle -= 180;
                if (textAngle < -90) textAngle += 180;

                return (
                  <g key={`edge-${i}`}>
                    <line
                      x1={edge.x1 + normalX * outSign * 5} y1={edge.y1 + normalY * outSign * 5}
                      x2={edge.x1 + normalX * outSign * 12} y2={edge.y1 + normalY * outSign * 12}
                      stroke="#555" strokeWidth={0.5}
                    />
                    <line
                      x1={edge.x2 + normalX * outSign * 5} y1={edge.y2 + normalY * outSign * 5}
                      x2={edge.x2 + normalX * outSign * 12} y2={edge.y2 + normalY * outSign * 12}
                      stroke="#555" strokeWidth={0.5}
                    />
                    <line
                      x1={edge.x1 + normalX * outSign * 8} y1={edge.y1 + normalY * outSign * 8}
                      x2={edge.x2 + normalX * outSign * 8} y2={edge.y2 + normalY * outSign * 8}
                      stroke="#555" strokeWidth={0.5}
                    />
                    <rect
                      x={labelX - 22} y={labelY - 7} width={44} height={14}
                      fill="white" stroke="none" rx={2}
                      transform={`rotate(${textAngle}, ${labelX}, ${labelY})`}
                    />
                    <text
                      x={labelX} y={labelY + 4}
                      textAnchor="middle" fontSize={9} fill="#333" fontWeight="bold"
                      transform={`rotate(${textAngle}, ${labelX}, ${labelY})`}
                    >
                      {edge.lengthM.toFixed(1)}m
                    </text>
                  </g>
                );
              })}
            </>
          ) : !boundaryResult && (
            <>
              <line x1={propX} y1={propY - 15} x2={propX + propW} y2={propY - 15} stroke="#555" strokeWidth={0.5} />
              <line x1={propX} y1={propY - 20} x2={propX} y2={propY - 10} stroke="#555" strokeWidth={0.5} />
              <line x1={propX + propW} y1={propY - 20} x2={propX + propW} y2={propY - 10} stroke="#555" strokeWidth={0.5} />
              <text x={propX + propW / 2} y={propY - 20} textAnchor="middle" fontSize={10} fill="#333">
                {propertyFrontageM.toFixed(1)}m
              </text>
              <line x1={propX - 15} y1={propY} x2={propX - 15} y2={propY + propH} stroke="#555" strokeWidth={0.5} />
              <line x1={propX - 20} y1={propY} x2={propX - 10} y2={propY} stroke="#555" strokeWidth={0.5} />
              <line x1={propX - 20} y1={propY + propH} x2={propX - 10} y2={propY + propH} stroke="#555" strokeWidth={0.5} />
              <text
                x={propX - 25} y={propY + propH / 2}
                textAnchor="middle" fontSize={10} fill="#333"
                transform={`rotate(-90, ${propX - 25}, ${propY + propH / 2})`}
              >
                {propertyDepthM.toFixed(1)}m
              </text>
            </>
          )}

          {/* Setback inset polygon (dashed) */}
          {setbackInsetPath && (
            <path
              d={setbackInsetPath}
              fill="none"
              stroke={setbackColor}
              strokeWidth={1.5}
              strokeDasharray="6,4"
              opacity={0.8}
            />
          )}

          {/* Setback label */}
          {hasSetbacks && (
            <text
              x={polyCentroid.x}
              y={polyCentroid.y + strH / 2 + 25}
              textAnchor="middle"
              fontSize={7}
              fill={setbackColor}
            >
              Setbacks: F{setFrontM.toFixed(1)}m R{setRearM.toFixed(1)}m L{setLeftM.toFixed(1)}m R{setRightM.toFixed(1)}m
            </text>
          )}


          {/* Structure footprint */}
          <g transform={`rotate(${structureRotation}, ${strX + strW / 2}, ${strY + strH / 2})`}>
            <rect
              x={strX} y={strY} width={strW} height={strH}
              fill="rgba(59, 130, 246, 0.15)" stroke="#2563eb" strokeWidth={2}
            />
            <text x={strX + strW / 2} y={strY + strH / 2 - 6} textAnchor="middle" fontSize={10} fill="#1e40af" fontWeight="bold">
              PROPOSED STRUCTURE
            </text>
            <text x={strX + strW / 2} y={strY + strH / 2 + 8} textAnchor="middle" fontSize={9} fill="#1e40af">
              {structureWM.toFixed(1)}m × {structureLM.toFixed(1)}m
            </text>
            {roofType && (
              <text x={strX + strW / 2} y={strY + strH / 2 + 20} textAnchor="middle" fontSize={8} fill="#3b82f6">
                ({roofType})
              </text>
            )}

            {/* Structure dimensions */}
            <line x1={strX} y1={strY - 8} x2={strX + strW} y2={strY - 8} stroke="#2563eb" strokeWidth={0.5} />
            <line x1={strX} y1={strY - 12} x2={strX} y2={strY - 4} stroke="#2563eb" strokeWidth={0.5} />
            <line x1={strX + strW} y1={strY - 12} x2={strX + strW} y2={strY - 4} stroke="#2563eb" strokeWidth={0.5} />
            <text x={strX + strW / 2} y={strY - 12} textAnchor="middle" fontSize={8} fill="#2563eb">
              {structureWM.toFixed(1)}m
            </text>
            <line x1={strX + strW + 8} y1={strY} x2={strX + strW + 8} y2={strY + strH} stroke="#2563eb" strokeWidth={0.5} />
            <line x1={strX + strW + 4} y1={strY} x2={strX + strW + 12} y2={strY} stroke="#2563eb" strokeWidth={0.5} />
            <line x1={strX + strW + 4} y1={strY + strH} x2={strX + strW + 12} y2={strY + strH} stroke="#2563eb" strokeWidth={0.5} />
            <text x={strX + strW + 15} y={strY + strH / 2 + 3} fontSize={8} fill="#2563eb">
              {structureLM.toFixed(1)}m
            </text>

            {/* Post position markers */}
            {postPositions.length > 0 && (() => {
              const edgeMap: Record<string, { x1: number; y1: number; x2: number; y2: number }> = {
                "A-B": { x1: strX, y1: strY, x2: strX + strW, y2: strY },
                "B-C": { x1: strX + strW, y1: strY, x2: strX + strW, y2: strY + strH },
                "C-D": { x1: strX + strW, y1: strY + strH, x2: strX, y2: strY + strH },
                "D-A": { x1: strX, y1: strY + strH, x2: strX, y2: strY },
              };
              const postR = 4;
              return postPositions.map((marker, idx) => {
                const [side, pctStr] = marker.split(":");
                const pct = parseInt(pctStr, 10) / 100;
                const edge = edgeMap[side];
                if (!edge) return null;
                const px = edge.x1 + (edge.x2 - edge.x1) * pct;
                const py = edge.y1 + (edge.y2 - edge.y1) * pct;
                return (
                  <circle key={`post-${idx}`} cx={px} cy={py} r={postR} fill="#16a34a" stroke="#ffffff" strokeWidth={1.5} />
                );
              });
            })()}
          </g>

          {/* Scale Bar */}
          <g transform={`translate(${margin + 10}, ${svgH - 20})`}>
            <rect x={0} y={0} width={scaleBarPx} height={6} fill="#333" />
            <rect x={0} y={0} width={scaleBarPx / 2} height={6} fill="#fff" stroke="#333" strokeWidth={0.5} />
            <text x={0} y={-3} fontSize={8} fill="#333">0</text>
            <text x={scaleBarPx / 2} y={-3} textAnchor="middle" fontSize={8} fill="#333">
              {(scaleBarM / 2).toFixed(0)}m
            </text>
            <text x={scaleBarPx} y={-3} textAnchor="middle" fontSize={8} fill="#333">
              {scaleBarM}m
            </text>
            <text x={scaleBarPx + 10} y={4} fontSize={8} fill="#666">
              Scale 1:{Math.round(1000 * metersPerSvgPx)}
            </text>
          </g>

          {/* Title Block */}
          <g transform={`translate(0, ${svgH})`}>
            <rect x={10} y={0} width={svgW - 20} height={titleBlockH - 10} fill="#f8f8f8" stroke="#333" strokeWidth={1} />
            <line x1={svgW * 0.35} y1={0} x2={svgW * 0.35} y2={titleBlockH - 10} stroke="#333" strokeWidth={0.5} />
            <line x1={svgW * 0.65} y1={0} x2={svgW * 0.65} y2={titleBlockH - 10} stroke="#333" strokeWidth={0.5} />

            {/* Left section - Company */}
            <text x={30} y={20} fontSize={12} fontWeight="bold" fill="#333">SPANLINE</text>
            <text x={30} y={35} fontSize={8} fill="#666">Outdoor Living Solutions</text>
            <text x={30} y={50} fontSize={8} fill="#666">Site Plan — For Council Submission</text>

            {/* Middle section - Project details */}
            <text x={svgW * 0.37} y={15} fontSize={8} fill="#666">Client:</text>
            <text x={svgW * 0.37} y={27} fontSize={10} fontWeight="bold" fill="#333">{clientName}</text>
            <text x={svgW * 0.37} y={42} fontSize={8} fill="#666">Site:</text>
            <text x={svgW * 0.37} y={54} fontSize={9} fill="#333">{siteAddress}</text>
            {lotId && (
              <>
                <text x={svgW * 0.37} y={69} fontSize={8} fill="#666">Lot/Block:</text>
                <text x={svgW * 0.37} y={81} fontSize={9} fill="#333">{lotId}{suburb ? `, ${suburb}` : ""}</text>
              </>
            )}

            {/* Right section - Drawing info */}
            <text x={svgW * 0.67} y={15} fontSize={8} fill="#666">Quote No:</text>
            <text x={svgW * 0.67} y={27} fontSize={10} fontWeight="bold" fill="#333">{quoteNumber}</text>
            <text x={svgW * 0.67} y={42} fontSize={8} fill="#666">Design Adviser:</text>
            <text x={svgW * 0.67} y={54} fontSize={9} fill="#333">{designAdviser}</text>
            <text x={svgW * 0.67} y={69} fontSize={8} fill="#666">Date:</text>
            <text x={svgW * 0.67} y={81} fontSize={9} fill="#333">{today}</text>
            {propertyAreaSqm && (
              <>
                <text x={svgW * 0.85} y={15} fontSize={8} fill="#666">Site Area:</text>
                <text x={svgW * 0.85} y={27} fontSize={9} fill="#333">{propertyAreaSqm.toFixed(0)} m²</text>
              </>
            )}
          </g>

          {/* Lot/Block label on plan */}
          {lotId && (
            <text
              x={polyCentroid.x}
              y={boundaryResult ? Math.max(...boundaryResult.svgPoints.map(p => p.y)) + 20 : propY + propH + 20}
              textAnchor="middle"
              fontSize={10}
              fill="#333"
              fontWeight="bold"
            >
              {lotId}{suburb ? ` — ${suburb}` : ""}
            </text>
          )}
        </svg>
      </div>

      <p className="text-xs text-muted-foreground">
        Click "Print A3" to open a print-ready version optimised for A3 landscape paper. Includes title block, scale bar, and north arrow for council submission.
      </p>
    </div>
  );
}
