import { useState, useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Eye, Download, Loader2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { computePerSideInset, type PerSideSetbacks } from "@/lib/polygonInset";
import { logClientDownload } from "@/lib/userActivity";

interface SitePlanPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
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
  /** Lot identifier */
  lotId?: string;
  /** Suburb */
  suburb?: string;
  /** Centroid [lng, lat] for satellite image */
  centroid?: [number, number];
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
  /** Custom color for setback envelope (hex string) */
  setbackColor?: string;
}

/**
 * Full-screen preview dialog that renders the site plan with satellite image background,
 * exactly as it would appear in the PDF export. Allows users to verify the satellite
 * imagery, boundary overlay, and structure placement before generating the PDF.
 */
export default function SitePlanPreviewDialog({
  open,
  onOpenChange,
  boundaryCoords,
  propertyFrontageM = 15,
  propertyDepthM = 30,
  propertyAreaSqm,
  structureWidthMm,
  structureLengthMm,
  setbackFrontMm = 0,
  setbackLeftMm = 0,
  setbackRearMm = 0,
  setbackRightMm = 0,
  houseWalls = [],
  lotId,
  suburb,
  centroid,
  structureOffsetX = 0,
  structureOffsetY = 0,
  structureRotation = 0,
  clientName = "",
  siteAddress = "",
  quoteNumber = "",
  setbackColor = "#FF6B35",
}: SitePlanPreviewDialogProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [rendering, setRendering] = useState(false);
  const [satelliteLoaded, setSatelliteLoaded] = useState(false);
  const [satelliteError, setSatelliteError] = useState(false);
  const trpcUtils = trpc.useUtils();

  const canvasW = 960;
  const canvasH = 720;

  useEffect(() => {
    if (!open) return;
    renderPreview();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, boundaryCoords, centroid, structureWidthMm, structureLengthMm, structureOffsetX, structureOffsetY, structureRotation, setbackColor]);

  async function loadImage(url: string): Promise<HTMLImageElement | null> {
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = url;
      setTimeout(() => resolve(null), 10000);
    });
  }

  async function renderPreview() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    setRendering(true);
    setSatelliteLoaded(false);
    setSatelliteError(false);

    const padding = 60;
    const drawW = canvasW - padding * 2;
    const drawH = canvasH - padding * 2 - 60; // leave room for title bar
    const frontageM = propertyFrontageM;
    const depthM = propertyDepthM;
    const scale = Math.min(drawW / frontageM, drawH / depthM);
    const propW = frontageM * scale;
    const propH = depthM * scale;
    const propX = (canvasW - propW) / 2;
    const propY = padding + (drawH - propH) / 2;

    // Clear canvas
    ctx.fillStyle = "#1a1a2e";
    ctx.fillRect(0, 0, canvasW, canvasH);

    // Try satellite image background via server-side proxy
    if (centroid && centroid[0] && centroid[1]) {
      const [lng, lat] = centroid;
      const maxDim = Math.max(frontageM, depthM);
      let zoom = 19;
      if (maxDim > 60) zoom = 17;
      else if (maxDim > 40) zoom = 18;
      else if (maxDim > 20) zoom = 19;
      else zoom = 20;

      try {
        // Fetch satellite image data URL from server-side proxy
        const result = await trpcUtils.quotes.staticMapImage.fetch(
          { lat, lng, zoom, width: 640, height: 480 }
        );
        if (result?.dataUrl) {
          const satImg = await loadImage(result.dataUrl);
          if (satImg) {
            ctx.drawImage(satImg, 0, 0, canvasW, canvasH);
            ctx.fillStyle = "rgba(0, 0, 0, 0.2)";
            ctx.fillRect(0, 0, canvasW, canvasH);
            setSatelliteLoaded(true);
          } else {
            setSatelliteError(true);
            ctx.fillStyle = "#f0f4f8";
            ctx.fillRect(0, 0, canvasW, canvasH);
          }
        } else {
          setSatelliteError(true);
          ctx.fillStyle = "#f0f4f8";
          ctx.fillRect(0, 0, canvasW, canvasH);
        }
      } catch {
        setSatelliteError(true);
        ctx.fillStyle = "#f0f4f8";
        ctx.fillRect(0, 0, canvasW, canvasH);
      }
    } else {
      ctx.fillStyle = "#f0f4f8";
      ctx.fillRect(0, 0, canvasW, canvasH);
    }

    // Property boundary
    if (boundaryCoords && boundaryCoords.length >= 3) {
      let minLng = Infinity, maxLng = -Infinity, minLat = Infinity, maxLat = -Infinity;
      for (const [lng, lat] of boundaryCoords) {
        if (lng < minLng) minLng = lng;
        if (lng > maxLng) maxLng = lng;
        if (lat < minLat) minLat = lat;
        if (lat > maxLat) maxLat = lat;
      }
      const coordW = maxLng - minLng;
      const coordH = maxLat - minLat;
      if (coordW > 0 && coordH > 0) {
        const polyScale = Math.min((canvasW - padding * 2) / coordW, (canvasH - padding * 2 - 60) / coordH) * 0.85;
        const polyOffX = (canvasW - coordW * polyScale) / 2;
        const polyOffY = padding + ((drawH) - coordH * polyScale) / 2;

        ctx.strokeStyle = "#FFD700";
        ctx.lineWidth = 3;
        ctx.shadowColor = "rgba(255, 215, 0, 0.4)";
        ctx.shadowBlur = 6;
        ctx.setLineDash([]);
        ctx.beginPath();
        boundaryCoords.forEach(([lng, lat], i) => {
          const x = (lng - minLng) * polyScale + polyOffX;
          const y = (maxLat - lat) * polyScale + polyOffY;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        ctx.closePath();
        ctx.stroke();
        ctx.shadowBlur = 0;

        // Edge dimension labels
        ctx.font = "bold 11px sans-serif";
        ctx.textAlign = "center";
        for (let i = 0; i < boundaryCoords.length; i++) {
          const j = (i + 1) % boundaryCoords.length;
          const [lng1, lat1] = boundaryCoords[i];
          const [lng2, lat2] = boundaryCoords[j];
          const dLat = (lat2 - lat1) * 111320;
          const dLng = (lng2 - lng1) * 111320 * Math.cos(((lat1 + lat2) / 2) * Math.PI / 180);
          const distM = Math.sqrt(dLat * dLat + dLng * dLng);
          if (distM < 0.5) continue;
          const x1 = (lng1 - minLng) * polyScale + polyOffX;
          const y1 = (maxLat - lat1) * polyScale + polyOffY;
          const x2 = (lng2 - minLng) * polyScale + polyOffX;
          const y2 = (maxLat - lat2) * polyScale + polyOffY;
          const mx = (x1 + x2) / 2;
          const my = (y1 + y2) / 2;
          const angle = Math.atan2(y2 - y1, x2 - x1);
          const ox = Math.cos(angle + Math.PI / 2) * 16;
          const oy = Math.sin(angle + Math.PI / 2) * 16;
          // Background pill
          const label = `${distM.toFixed(1)}m`;
          const tw = ctx.measureText(label).width + 10;
          ctx.fillStyle = "rgba(0,0,0,0.75)";
          roundRect(ctx, mx + ox - tw / 2, my + oy - 8, tw, 16, 4);
          ctx.fill();
          ctx.fillStyle = "#FFD700";
          ctx.fillText(label, mx + ox, my + oy + 4);
        }
      }
    } else {
      // Fallback rectangle boundary
      ctx.strokeStyle = "#FFD700";
      ctx.lineWidth = 3;
      ctx.shadowColor = "rgba(255, 215, 0, 0.4)";
      ctx.shadowBlur = 6;
      ctx.setLineDash([12, 6]);
      ctx.strokeRect(propX, propY, propW, propH);
      ctx.setLineDash([]);
      ctx.shadowBlur = 0;

      // Dimension labels
      ctx.fillStyle = "#FFD700";
      ctx.font = "bold 13px sans-serif";
      ctx.textAlign = "center";
      // Frontage (bottom)
      ctx.fillText(`${frontageM.toFixed(1)}m`, propX + propW / 2, propY + propH + 25);
      // Depth (left)
      ctx.save();
      ctx.translate(propX - 25, propY + propH / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.fillText(`${depthM.toFixed(1)}m`, 0, 0);
      ctx.restore();
    }

    // Structure footprint
    const structWidthM = (structureWidthMm || 0) / 1000;
    const structLengthM = (structureLengthMm || 0) / 1000;
    if (structWidthM > 0 && structLengthM > 0) {
      const sw = structWidthM * scale;
      const sh = structLengthM * scale;
      // Position based on setbacks and offset
      let sx = propX + (setbackLeftMm / 1000) * scale + structureOffsetX * scale;
      let sy = propY + (setbackFrontMm / 1000) * scale + structureOffsetY * scale;
      // If no setbacks, center horizontally
      if (!setbackLeftMm && !setbackRightMm) {
        sx = propX + (propW - sw) / 2 + structureOffsetX * scale;
      }
      if (!setbackFrontMm && !setbackRearMm) {
        sy = propY + propH * 0.35 + structureOffsetY * scale;
      }

      // Structure fill (with rotation)
      const structCenterX = sx + sw / 2;
      const structCenterY = sy + sh / 2;
      ctx.save();
      ctx.translate(structCenterX, structCenterY);
      if (structureRotation !== 0) ctx.rotate((structureRotation * Math.PI) / 180);
      ctx.fillStyle = "rgba(34, 197, 94, 0.3)";
      ctx.fillRect(-sw / 2, -sh / 2, sw, sh);
      ctx.strokeStyle = "rgba(34, 197, 94, 0.95)";
      ctx.lineWidth = 3;
      ctx.strokeRect(-sw / 2, -sh / 2, sw, sh);

      // Structure label
      ctx.fillStyle = "white";
      ctx.font = "bold 14px sans-serif";
      ctx.textAlign = "center";
      ctx.shadowColor = "rgba(0,0,0,0.8)";
      ctx.shadowBlur = 3;
      ctx.fillText("STRUCTURE", 0, -8);
      ctx.font = "12px sans-serif";
      ctx.fillText(`${structWidthM.toFixed(1)}m × ${structLengthM.toFixed(1)}m`, 0, 10);
      ctx.shadowBlur = 0;
      ctx.restore();

      // Dimension lines
      ctx.strokeStyle = "rgba(34, 197, 94, 0.9)";
      ctx.lineWidth = 1;
      // Width line (top)
      ctx.beginPath();
      ctx.moveTo(sx, sy - 10);
      ctx.lineTo(sx + sw, sy - 10);
      ctx.stroke();
      // Width ticks
      ctx.beginPath();
      ctx.moveTo(sx, sy - 15);
      ctx.lineTo(sx, sy - 5);
      ctx.moveTo(sx + sw, sy - 15);
      ctx.lineTo(sx + sw, sy - 5);
      ctx.stroke();
      // Width label
      ctx.fillStyle = "rgba(34, 197, 94, 1)";
      ctx.font = "bold 10px sans-serif";
      const wLabel = `${structWidthM.toFixed(1)}m`;
      const wLabelW = ctx.measureText(wLabel).width + 8;
      ctx.fillStyle = "rgba(0,0,0,0.7)";
      roundRect(ctx, sx + sw / 2 - wLabelW / 2, sy - 25, wLabelW, 14, 3);
      ctx.fill();
      ctx.fillStyle = "rgba(34, 197, 94, 1)";
      ctx.fillText(wLabel, sx + sw / 2, sy - 15);

      // Depth line (right)
      ctx.strokeStyle = "rgba(34, 197, 94, 0.9)";
      ctx.beginPath();
      ctx.moveTo(sx + sw + 10, sy);
      ctx.lineTo(sx + sw + 10, sy + sh);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(sx + sw + 5, sy);
      ctx.lineTo(sx + sw + 15, sy);
      ctx.moveTo(sx + sw + 5, sy + sh);
      ctx.lineTo(sx + sw + 15, sy + sh);
      ctx.stroke();
      const dLabel = `${structLengthM.toFixed(1)}m`;
      const dLabelW = ctx.measureText(dLabel).width + 8;
      ctx.fillStyle = "rgba(0,0,0,0.7)";
      roundRect(ctx, sx + sw + 15, sy + sh / 2 - 7, dLabelW, 14, 3);
      ctx.fill();
      ctx.fillStyle = "rgba(34, 197, 94, 1)";
      ctx.textAlign = "left";
      ctx.fillText(dLabel, sx + sw + 19, sy + sh / 2 + 4);
      ctx.textAlign = "center";


      // Setback envelope — per-side inset polygon
      const hasSetbacks = setbackFrontMm > 0 || setbackRearMm > 0 || setbackLeftMm > 0 || setbackRightMm > 0;
      if (hasSetbacks && boundaryCoords && boundaryCoords.length >= 3) {
        // Build pixel points from boundary coords using same projection
        let bMinLng = Infinity, bMaxLng = -Infinity, bMinLat = Infinity, bMaxLat = -Infinity;
        for (const [lng, lat] of boundaryCoords) {
          if (lng < bMinLng) bMinLng = lng;
          if (lng > bMaxLng) bMaxLng = lng;
          if (lat < bMinLat) bMinLat = lat;
          if (lat > bMaxLat) bMaxLat = lat;
        }
        const bCoordW = bMaxLng - bMinLng;
        const bCoordH = bMaxLat - bMinLat;
        if (bCoordW > 0 && bCoordH > 0) {
          const bPolyScale = Math.min((canvasW - padding * 2) / bCoordW, (canvasH - padding * 2 - 60) / bCoordH) * 0.85;
          const bPolyOffX = (canvasW - bCoordW * bPolyScale) / 2;
          const bPolyOffY = padding + ((drawH) - bCoordH * bPolyScale) / 2;

          const bPolyPts = boundaryCoords.map(([lng, lat]) => ({
            x: (lng - bMinLng) * bPolyScale + bPolyOffX,
            y: (bMaxLat - lat) * bPolyScale + bPolyOffY,
          }));

          // Calibrate pixels-per-metre from first edge
          let bPxPerM = scale;
          if (boundaryCoords.length >= 2) {
            const [lng1, lat1] = boundaryCoords[0];
            const [lng2, lat2] = boundaryCoords[1];
            const dLat = (lat2 - lat1) * 111320;
            const dLng = (lng2 - lng1) * 111320 * Math.cos(((lat1 + lat2) / 2) * Math.PI / 180);
            const edgeM = Math.sqrt(dLat * dLat + dLng * dLng);
            const edgePx = Math.hypot(bPolyPts[1].x - bPolyPts[0].x, bPolyPts[1].y - bPolyPts[0].y);
            if (edgeM > 0.5 && edgePx > 1) bPxPerM = edgePx / edgeM;
          }

          const setbacksPx: PerSideSetbacks = {
            front: (setbackFrontMm / 1000) * bPxPerM,
            rear: (setbackRearMm / 1000) * bPxPerM,
            left: (setbackLeftMm / 1000) * bPxPerM,
            right: (setbackRightMm / 1000) * bPxPerM,
          };

          const insetPts = computePerSideInset(bPolyPts, setbacksPx);
          if (insetPts) {
            ctx.strokeStyle = setbackColor;
            ctx.lineWidth = 1.5;
            ctx.setLineDash([6, 4]);
            ctx.beginPath();
            insetPts.forEach((pt, i) => {
              if (i === 0) ctx.moveTo(pt.x, pt.y);
              else ctx.lineTo(pt.x, pt.y);
            });
            ctx.closePath();
            ctx.stroke();
            ctx.setLineDash([]);
          }
        }
      } else if (hasSetbacks) {
        // Fallback: draw individual setback lines from structure to property rect
        ctx.font = "9px sans-serif";
        ctx.setLineDash([4, 3]);
        ctx.strokeStyle = setbackColor;
        ctx.lineWidth = 1;
        if (setbackFrontMm > 0) {
          ctx.beginPath();
          ctx.moveTo(sx + sw / 2, propY);
          ctx.lineTo(sx + sw / 2, sy);
          ctx.stroke();
          ctx.fillStyle = setbackColor;
          ctx.fillText(`Front ${(setbackFrontMm / 1000).toFixed(1)}m`, sx + sw / 2 + 30, propY + (sy - propY) / 2 + 4);
        }
        if (setbackLeftMm > 0) {
          ctx.beginPath();
          ctx.moveTo(propX, sy + sh / 2);
          ctx.lineTo(sx, sy + sh / 2);
          ctx.stroke();
          ctx.fillStyle = setbackColor;
          ctx.fillText(`Left ${(setbackLeftMm / 1000).toFixed(1)}m`, propX + (sx - propX) / 2, sy + sh / 2 - 8);
        }
        if (setbackRearMm > 0) {
          ctx.beginPath();
          ctx.moveTo(sx + sw / 2, sy + sh);
          ctx.lineTo(sx + sw / 2, propY + propH);
          ctx.stroke();
          ctx.fillStyle = setbackColor;
          ctx.fillText(`Rear ${(setbackRearMm / 1000).toFixed(1)}m`, sx + sw / 2 + 30, sy + sh + (propY + propH - sy - sh) / 2 + 4);
        }
        if (setbackRightMm > 0) {
          ctx.beginPath();
          ctx.moveTo(sx + sw, sy + sh / 2);
          ctx.lineTo(propX + propW, sy + sh / 2);
          ctx.stroke();
          ctx.fillStyle = setbackColor;
          ctx.fillText(`Right ${(setbackRightMm / 1000).toFixed(1)}m`, sx + sw + (propX + propW - sx - sw) / 2, sy + sh / 2 - 8);
        }
        ctx.setLineDash([]);
      }
    }

    // North arrow
    ctx.fillStyle = satelliteLoaded ? "white" : "#333";
    ctx.strokeStyle = satelliteLoaded ? "white" : "#333";
    ctx.font = "bold 12px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("N", canvasW - 40, padding + 15);
    ctx.beginPath();
    ctx.moveTo(canvasW - 40, padding + 20);
    ctx.lineTo(canvasW - 40, padding + 45);
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(canvasW - 45, padding + 28);
    ctx.lineTo(canvasW - 40, padding + 20);
    ctx.lineTo(canvasW - 35, padding + 28);
    ctx.fill();

    // Street frontage label
    ctx.fillStyle = "rgba(0,0,0,0.7)";
    roundRect(ctx, canvasW / 2 - 60, canvasH - 50, 120, 22, 4);
    ctx.fill();
    ctx.fillStyle = "white";
    ctx.font = "bold 10px sans-serif";
    ctx.letterSpacing = "1px";
    ctx.fillText("STREET FRONTAGE", canvasW / 2, canvasH - 35);

    // Title bar at top
    ctx.fillStyle = "rgba(0,0,0,0.8)";
    ctx.fillRect(0, 0, canvasW, 40);
    ctx.fillStyle = "white";
    ctx.font = "bold 14px sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(`Site Plan Preview — ${quoteNumber}`, 16, 26);
    ctx.font = "11px sans-serif";
    ctx.textAlign = "right";
    const infoText = [clientName, siteAddress, lotId].filter(Boolean).join(" • ");
    ctx.fillText(infoText, canvasW - 16, 26);

    // Area badge
    if (propertyAreaSqm) {
      ctx.fillStyle = "rgba(0,0,0,0.75)";
      const areaLabel = `${propertyAreaSqm.toFixed(0)} m²`;
      const areaW = ctx.measureText(areaLabel).width + 16;
      roundRect(ctx, propX + propW - areaW - 5, propY + 8, areaW, 20, 4);
      ctx.fill();
      ctx.fillStyle = "white";
      ctx.font = "bold 11px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(areaLabel, propX + propW - areaW / 2 - 5, propY + 22);
    }

    // Satellite status indicator
    ctx.textAlign = "left";
    ctx.font = "10px sans-serif";
    if (satelliteLoaded) {
      ctx.fillStyle = "rgba(34, 197, 94, 0.9)";
      ctx.fillText("● Satellite imagery loaded", 16, canvasH - 12);
    } else if (satelliteError) {
      ctx.fillStyle = "rgba(239, 68, 68, 0.9)";
      ctx.fillText("● Satellite imagery unavailable", 16, canvasH - 12);
    } else if (!centroid) {
      ctx.fillStyle = "rgba(156, 163, 175, 0.9)";
      ctx.fillText("● No centroid data — fetch site data first", 16, canvasH - 12);
    }

    setRendering(false);
  }

  function handleDownloadImage() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const link = document.createElement("a");
    const filename = `SitePlan_${quoteNumber || "preview"}.png`;
    link.download = filename;
    link.href = canvas.toDataURL("image/png");
    link.click();
    logClientDownload({
      filename,
      source: "site_plan_preview_png",
      entityType: "quote",
      entityId: quoteNumber || undefined,
      mimeType: "image/png",
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[1040px] max-h-[90vh] overflow-hidden flex flex-col p-0">
        <DialogHeader className="px-6 pt-5 pb-3">
          <DialogTitle className="flex items-center gap-2">
            <Eye className="h-5 w-5 text-primary" />
            PDF Site Plan Preview
          </DialogTitle>
          <p className="text-sm text-muted-foreground">
            This preview shows the site plan as it will appear in the exported PDF proposal, including satellite imagery when available.
          </p>
        </DialogHeader>

        <div className="flex-1 overflow-auto px-6 pb-4">
          <div className="relative border rounded-lg overflow-hidden bg-muted/30">
            {rendering && (
              <div className="absolute inset-0 flex items-center justify-center bg-background/80 z-10">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <span className="ml-2 text-sm text-muted-foreground">Rendering preview...</span>
              </div>
            )}
            <canvas
              ref={canvasRef}
              width={canvasW}
              height={canvasH}
              className="w-full h-auto"
              style={{ display: "block" }}
            />
          </div>
        </div>

        <DialogFooter className="px-6 pb-5 pt-2 border-t">
          <div className="flex items-center gap-2 w-full justify-between">
            <span className="text-xs text-muted-foreground">
              {satelliteLoaded ? "Satellite image will be included in PDF export" : "PDF will use plain background (no satellite data)"}
            </span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handleDownloadImage}>
                <Download className="h-3.5 w-3.5 mr-1.5" />
                Save as PNG
              </Button>
              <Button variant="default" size="sm" onClick={() => onOpenChange(false)}>
                Close
              </Button>
            </div>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Helper to draw a rounded rectangle path */
function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}
