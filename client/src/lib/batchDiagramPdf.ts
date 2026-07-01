/**
 * Batch Diagram PDF Export
 * Combines site plan, front/side elevations, and roof plan into a single multi-page PDF.
 */

import jsPDF from "jspdf";
import { renderRoofDiagram, parseRoofType, type RoofDiagramOptions } from "./renderRoofDiagram";
import { loadCompanyDetails, loadCustomLogo, type CustomLogo, type CompanyDetails } from "./proposalStore";
import { computePerSideInset, type PerSideSetbacks } from "./polygonInset";
import { logClientDownload } from "./userActivity";



/** Load an image from a URL, returns null on failure. Retries without crossOrigin if CORS blocks. */
function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    let resolved = false;
    const done = (result: HTMLImageElement | null) => {
      if (!resolved) { resolved = true; resolve(result); }
    };
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => done(img);
    img.onerror = () => {
      // Retry without crossOrigin (won't taint canvas but allows display)
      const img2 = new Image();
      img2.onload = () => done(img2);
      img2.onerror = () => done(null);
      img2.src = url;
    };
    img.src = url;
    setTimeout(() => done(null), 15000);
  });
}

export interface BatchDiagramData {
  quoteNumber: string;
  clientName: string;
  siteAddress?: string;
  designAdviser?: string;
  // Site plan data
  sitePlan?: {
    boundaryCoords?: [number, number][];
    centroid?: [number, number];
    lotId?: string;
    suburb?: string;
    areaSqm?: number;
    frontageM?: number;
    depthM?: number;
    satelliteDataUrl?: string;
  };
  structureWidthMm?: number;
  structureLengthMm?: number;
  setbackFrontMm?: number;
  setbackLeftMm?: number;
  setbackRearMm?: number;
  setbackRightMm?: number;
  houseWalls?: string[];
  structureOffsetX?: number;
  structureOffsetY?: number;
  structureRotation?: number;
  setbackColor?: string;
  /** Post positions encoded as "side:percent" e.g. ["B-C:0", "B-C:50", "C-D:75"] */
  postPositions?: string[];
  // Elevation data
  specFloorHeight?: string;
  specRoofToFloor?: string;
  specFloorToGround?: string;
  specHouseEave?: string;
  specJobEave?: string;
  specPostsNumber?: string;
  specPostsType?: string;
  specRoofType?: string;
  specRoofShape?: string;
  specFall?: string;
  // Roof diagram data
  specWidth?: string;
  specLength?: string;
  specRoofTopColour?: string;
  specBeamColour?: string;
  specPostsColour?: string;
  // Cross-section diagram data
  specHouseRoofType?: string;
  specCutBackEave?: string;
  specRemoveGutterFlash?: string;
  specHouseWallType?: string;
  specFallOnGround?: string;
  specGroundLevel?: string;
  // Front elevation (fillable) data
  specPostSpacing?: string;
  specGutterType?: string;
  specRoofOverhang?: string;
  specBeamSize?: string;
  /** Beam positions as JSON array of {y: number} (percent from top edge, 0-1) */
  specBeamPositions?: string;
  /** Beam entries JSON to determine if beams exist */
  specBeamEntries?: string;
  /** Explicit fall direction from roof section */
  specFallDirection?: string;
  // Connection detail
  connectionType?: string;
  connectionCode?: string; // short code: BCH, GBL, POP, FLY, WFX, FSS
  connectionImageUrl?: string;
  // Skylight data
  specSkylightType?: string;
  specSkylightLm?: string;
  specSkylightQty?: string;
  specSkylightFinish?: string;
  // Plan View annotations
  /** Gutter sides (e.g. ["A-B", "C-D"]) */
  gutterSides?: string[];
  /** Downpipe markers on gutter edges (e.g. ["A-B:25", "C-D:75"]) */
  downpipeMarkers?: string[];
  /** Downpipe locations at corners (e.g. ["A", "C"]) */
  downpipeLocations?: string[];
  /** Post type/size label (e.g. "90×90 SHS") */
  specPostSize?: string;
}

/** Draw branded header bar on the first page */
function drawHeader(doc: jsPDF, logoData: string | null, company: CompanyDetails, quoteNumber: string, clientName: string, logoWidth?: number, logoHeight?: number) {
  const pageWidth = doc.internal.pageSize.getWidth();
  // Dark header bar
  doc.setFillColor(60, 50, 45);
  doc.rect(0, 0, pageWidth, 36, "F");

  let textX = 14;
  if (logoData) {
    try {
      // Scale logo to fit header height (30mm) while preserving aspect ratio
      const targetH = 30;
      let imgW = 30;
      if (logoWidth && logoHeight && logoHeight > 0) {
        imgW = targetH * (logoWidth / logoHeight);
      }
      // Clamp width to prevent overly wide logos
      imgW = Math.min(imgW, 80);
      // Detect image format from data URL
      const imgFormat = logoData.includes("image/jpeg") || logoData.includes("image/jpg") ? "JPEG" : "PNG";
      doc.addImage(logoData, imgFormat, 10, 3, imgW, targetH);
      textX = 10 + imgW + 4;
    } catch { /* ignore */ }
  }

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.text("Construction Diagrams", textX, 16);
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text(`${quoteNumber} — ${clientName}`, textX, 24);

  // Date on right
  doc.setFontSize(8);
  const dateStr = new Date().toLocaleDateString("en-AU", { day: "2-digit", month: "long", year: "numeric" });
  doc.text(`Generated: ${dateStr}`, pageWidth - 14, 16, { align: "right" });
  if (company.companyName) {
    doc.setFontSize(7);
    doc.text(company.companyName, pageWidth - 14, 22, { align: "right" });
  }
}

/** Draw page footer with page numbers */
function drawFooter(doc: jsPDF, quoteNumber: string) {
  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setFontSize(7);
    doc.setTextColor(160, 150, 140);
    doc.text(
      `${quoteNumber} — Construction Diagrams — Page ${p} of ${totalPages}`,
      doc.internal.pageSize.getWidth() / 2,
      doc.internal.pageSize.getHeight() - 8,
      { align: "center" }
    );
  }
}

/** Draw page title */
function drawPageTitle(doc: jsPDF, title: string, subtitle?: string) {
  const pageWidth = doc.internal.pageSize.getWidth();
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(30, 35, 40);
  doc.text(title, pageWidth / 2, 50, { align: "center" });
  if (subtitle) {
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(80, 85, 90);
    doc.text(subtitle, pageWidth / 2, 58, { align: "center" });
  }
}

/** Compute optimal zoom level based on boundary extents or property dimensions */
function computeBatchAutoZoom(sp: BatchDiagramData["sitePlan"]): number {
  const frontageM = sp?.frontageM || 20;
  const depthM = sp?.depthM || 30;
  if (sp?.boundaryCoords && sp.boundaryCoords.length >= 3 && sp.centroid) {
    let minLng = Infinity, maxLng = -Infinity, minLat = Infinity, maxLat = -Infinity;
    for (const [lng, lat] of sp.boundaryCoords) {
      if (lng < minLng) minLng = lng;
      if (lng > maxLng) maxLng = lng;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
    }
    const midLat = (minLat + maxLat) / 2;
    const extentLngM = (maxLng - minLng) * 111320 * Math.cos(midLat * Math.PI / 180);
    const extentLatM = (maxLat - minLat) * 111320;
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
}

/** Render site plan to canvas with satellite background */
async function renderSitePlanCanvas(data: BatchDiagramData, canvasW: number, canvasH: number): Promise<HTMLCanvasElement | null> {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = canvasW;
    canvas.height = canvasH;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    const sp = data.sitePlan;
    const coords = sp?.boundaryCoords;
    const centroid = sp?.centroid;
    // Scale factor: base design is 480x340 canvas, scale everything proportionally for A3
    const sf = Math.min(canvasW / 480, canvasH / 340);

    // Try cached satellite image first, then fall back to server-side proxy
    let satLoaded = false;
    if (sp?.satelliteDataUrl) {
      try {
        const satImg = await loadImage(sp.satelliteDataUrl);
        if (satImg) {
          ctx.drawImage(satImg, 0, 0, canvasW, canvasH);
          ctx.fillStyle = "rgba(255, 255, 255, 0.15)";
          ctx.fillRect(0, 0, canvasW, canvasH);
          satLoaded = true;
        }
      } catch { /* ignore */ }
    }
    if (!satLoaded && centroid) {
      try {
        const [lng, lat] = centroid;
        const zoom = computeBatchAutoZoom(sp);
        const imgW = Math.min(640, Math.round(canvasW / 2));
        const imgH = Math.min(640, Math.round(canvasH / 2));
        const batchInput = JSON.stringify({ "0": { json: { lat, lng, zoom, width: imgW, height: imgH } } });
        const resp = await fetch(`/api/trpc/quotes.staticMapImage?batch=1&input=${encodeURIComponent(batchInput)}`);
        if (resp.ok) {
          const json = await resp.json();
          const dataUrl = Array.isArray(json) ? json[0]?.result?.data?.json?.dataUrl : json?.result?.data?.dataUrl;
          if (dataUrl) {
            const satImg = await loadImage(dataUrl);
            if (satImg) {
              ctx.drawImage(satImg, 0, 0, canvasW, canvasH);
              ctx.fillStyle = "rgba(255, 255, 255, 0.15)";
              ctx.fillRect(0, 0, canvasW, canvasH);
              satLoaded = true;
            }
          }
        }
      } catch { /* ignore */ }
    }
    if (!satLoaded) {
      ctx.fillStyle = "#f0f4f0";
      ctx.fillRect(0, 0, canvasW, canvasH);
    }

    // Draw boundary if available
    if (coords && coords.length > 2) {
      // Use Mercator projection when centroid is available (matches satellite image)
      let toPixel: (lng: number, lat: number) => [number, number];

      if (centroid) {
        const [centerLng, centerLat] = centroid;
        const zoom = computeBatchAutoZoom(sp);
        const worldScale = 256 * Math.pow(2, zoom);
        const centerWorldX = ((centerLng + 180) / 360) * worldScale;
        const centerWorldY = (worldScale / 2) - (worldScale * Math.log(Math.tan(Math.PI / 4 + (centerLat * Math.PI / 180) / 2)) / (2 * Math.PI));
        const fetchImgW = Math.min(640, Math.round(canvasW / 2));
        const fetchImgH = Math.min(640, Math.round(canvasH / 2));
        toPixel = (lng: number, lat: number): [number, number] => {
          const worldX = ((lng + 180) / 360) * worldScale;
          const worldY = (worldScale / 2) - (worldScale * Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI / 180) / 2)) / (2 * Math.PI));
          const px = (worldX - centerWorldX) + fetchImgW / 2;
          const py = (worldY - centerWorldY) + fetchImgH / 2;
          return [(px / fetchImgW) * canvasW, (py / fetchImgH) * canvasH];
        };
      } else {
        const lngs = coords.map(c => c[0]);
        const lats = coords.map(c => c[1]);
        const minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
        const minLat = Math.min(...lats), maxLat = Math.max(...lats);
        const padding = 60;
        const drawW = canvasW - padding * 2;
        const drawH = canvasH - padding * 2;
        const scaleX = drawW / (maxLng - minLng || 1);
        const scaleY = drawH / (maxLat - minLat || 1);
        const scale = Math.min(scaleX, scaleY);
        toPixel = (lng: number, lat: number): [number, number] => {
          const x = padding + (lng - minLng) * scale + (drawW - (maxLng - minLng) * scale) / 2;
          const y = padding + (maxLat - lat) * scale + (drawH - (maxLat - minLat) * scale) / 2;
          return [x, y];
        };
      }

      // Boundary polygon
      ctx.strokeStyle = "#e63946";
      ctx.lineWidth = Math.max(3, Math.round(3 * sf));
      ctx.setLineDash([]);
      ctx.beginPath();
      const [startX, startY] = toPixel(coords[0][0], coords[0][1]);
      ctx.moveTo(startX, startY);
      for (let i = 1; i < coords.length; i++) {
        const [px, py] = toPixel(coords[i][0], coords[i][1]);
        ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.stroke();

      // Fill boundary with semi-transparent
      ctx.fillStyle = "rgba(230, 57, 70, 0.08)";
      ctx.fill();

      // Edge dimension labels on ALL sides
      const edgeFontSize = Math.max(12, Math.round(12 * sf));
      ctx.font = `bold ${edgeFontSize}px sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      // Compute centroid of rendered polygon for outward offset direction
      const allPts: [number, number][] = coords.map(([lng, lat]) => toPixel(lng, lat));
      const polyCx = allPts.reduce((s, p) => s + p[0], 0) / allPts.length;
      const polyCy = allPts.reduce((s, p) => s + p[1], 0) / allPts.length;
      for (let i = 0; i < coords.length; i++) {
        const j = (i + 1) % coords.length;
        const [lng1, lat1] = coords[i];
        const [lng2, lat2] = coords[j];
        const dLat = (lat2 - lat1) * 111320;
        const dLng = (lng2 - lng1) * 111320 * Math.cos(((lat1 + lat2) / 2) * Math.PI / 180);
        const distM = Math.sqrt(dLat * dLat + dLng * dLng);
        if (distM < 0.5) continue;
        const [px1, py1] = allPts[i];
        const [px2, py2] = allPts[j];
        const mx = (px1 + px2) / 2;
        const my = (py1 + py2) / 2;
        const angle = Math.atan2(py2 - py1, px2 - px1);
        // Offset perpendicular to the edge, outward from polygon centroid
        const perpX = Math.cos(angle + Math.PI / 2);
        const perpY = Math.sin(angle + Math.PI / 2);
        const testDist = 20 * sf;
        const testX = mx + perpX * testDist;
        const testY = my + perpY * testDist;
        const distFromCenter = Math.hypot(testX - polyCx, testY - polyCy);
        const distFromCenterOpp = Math.hypot(mx - perpX * testDist - polyCx, my - perpY * testDist - polyCy);
        const sign = distFromCenter > distFromCenterOpp ? 1 : -1;
        const offsetDist = Math.round(18 * sf);
        const lx = mx + perpX * offsetDist * sign;
        const ly = my + perpY * offsetDist * sign;
        const label = `${distM.toFixed(1)}m`;
        const textW = ctx.measureText(label).width + Math.round(8 * sf);
        const pillH = Math.round(16 * sf);
        ctx.save();
        ctx.translate(lx, ly);
        let textAngle = angle;
        if (textAngle > Math.PI / 2) textAngle -= Math.PI;
        if (textAngle < -Math.PI / 2) textAngle += Math.PI;
        ctx.rotate(textAngle);
        ctx.fillStyle = "rgba(0, 0, 0, 0.8)";
        ctx.beginPath();
        ctx.roundRect(-textW / 2, -pillH / 2, textW, pillH, Math.round(3 * sf));
        ctx.fill();
        ctx.fillStyle = "#FFD700";
        ctx.fillText(label, 0, 0);
        ctx.restore();
      }
      ctx.textBaseline = "alphabetic";

      // Structure footprint
      if (data.structureWidthMm && data.structureLengthMm) {
        const structWM = data.structureWidthMm / 1000;
        const structLM = data.structureLengthMm / 1000;

        // Compute pixels-per-metre from the Mercator projection (matching on-screen SitePlanDiagram)
        let pxPerM: number;
        if (centroid) {
          const batchZoom = computeBatchAutoZoom(sp);
          const lat = centroid[1];
          const mPerFetchPx = 156543.03 * Math.cos(lat * Math.PI / 180) / Math.pow(2, batchZoom);
          const fetchImgWLocal = Math.min(640, Math.round(canvasW / 2));
          // Scale from fetch image px to canvas px
          pxPerM = (1 / mPerFetchPx) * (canvasW / fetchImgWLocal);
        } else {
          // Fallback: use property dimensions to derive scale
          const frontageM = sp?.frontageM || 20;
          const depthM = sp?.depthM || 30;
          const structDrawW = canvasW - Math.round(120 * sf);
          const structDrawH = canvasH - Math.round(120 * sf);
          pxPerM = Math.min(structDrawW / frontageM, structDrawH / depthM);
        }

        // Position at boundary polygon centroid (not canvas centre)
        const centerX = polyCx + (data.structureOffsetX || 0) * pxPerM;
        const centerY = polyCy + (data.structureOffsetY || 0) * pxPerM;
        const rectW = structWM * pxPerM;
        const rectH = structLM * pxPerM;
        const rotDeg = data.structureRotation || 0;

        ctx.save();
        ctx.translate(centerX, centerY);
        if (rotDeg !== 0) ctx.rotate((rotDeg * Math.PI) / 180);
        ctx.fillStyle = "rgba(59, 130, 246, 0.25)";
        ctx.strokeStyle = "#2563eb";
        ctx.lineWidth = Math.max(2, Math.round(2 * sf));
        ctx.setLineDash([]);
        ctx.fillRect(-rectW / 2, -rectH / 2, rectW, rectH);
        ctx.strokeRect(-rectW / 2, -rectH / 2, rectW, rectH);

        // Structure label
        ctx.fillStyle = "#1e40af";
        ctx.font = `bold ${Math.max(11, Math.round(11 * sf))}px sans-serif`;
        ctx.textAlign = "center";
        ctx.fillText(`${structWM.toFixed(1)}m × ${structLM.toFixed(1)}m`, 0, Math.round(4 * sf));

        // Post position markers — drawn inside the rotated context
        if (data.postPositions && data.postPositions.length > 0) {
          const halfW = rectW / 2;
          const halfH = rectH / 2;
          // Edge definitions relative to structure center: A=top-left, B=top-right, C=bottom-right, D=bottom-left
          const edgeMap: Record<string, { x1: number; y1: number; x2: number; y2: number }> = {
            "A-B": { x1: -halfW, y1: -halfH, x2: halfW, y2: -halfH },
            "B-C": { x1: halfW, y1: -halfH, x2: halfW, y2: halfH },
            "C-D": { x1: halfW, y1: halfH, x2: -halfW, y2: halfH },
            "D-A": { x1: -halfW, y1: halfH, x2: -halfW, y2: -halfH },
          };
          const postRadius = Math.max(4, Math.round(4 * sf));
          for (const marker of data.postPositions) {
            const [side, pctStr] = marker.split(":");
            const pct = parseInt(pctStr, 10) / 100;
            const edge = edgeMap[side];
            if (!edge) continue;
            const px = edge.x1 + (edge.x2 - edge.x1) * pct;
            const py = edge.y1 + (edge.y2 - edge.y1) * pct;
            // Filled circle with white border
            ctx.beginPath();
            ctx.arc(px, py, postRadius, 0, Math.PI * 2);
            ctx.fillStyle = "#16a34a";
            ctx.fill();
            ctx.strokeStyle = "#ffffff";
            ctx.lineWidth = Math.max(1, Math.round(1.5 * sf));
            ctx.setLineDash([]);
            ctx.stroke();
          }
          // Post count label below structure
          ctx.fillStyle = "rgba(0,0,0,0.7)";
          const postLabel = `${data.postPositions.length} post${data.postPositions.length !== 1 ? "s" : ""}`;
          const postFontSize = Math.max(9, Math.round(9 * sf));
          ctx.font = `${postFontSize}px sans-serif`;
          ctx.textAlign = "center";
          ctx.fillStyle = "#16a34a";
          ctx.fillText(postLabel, 0, halfH + Math.round(16 * sf));
        }

        ctx.restore();
      }

      // Setback envelope (dashed inset polygon) — per-side inset
      const hasSetbacks = data.setbackFrontMm || data.setbackRearMm || data.setbackLeftMm || data.setbackRightMm;
      if (hasSetbacks && coords.length >= 3) {
        const setbackM = {
          front: (data.setbackFrontMm || 0) / 1000,
          rear: (data.setbackRearMm || 0) / 1000,
          left: (data.setbackLeftMm || 0) / 1000,
          right: (data.setbackRightMm || 0) / 1000,
        };

        // Convert boundary to pixel points for the inset algorithm
        const boundaryPxPts = coords.map(([lng, lat]) => {
          const [px, py] = toPixel(lng, lat);
          return { x: px, y: py };
        });

        // Calibrate pixels-per-metre from the first edge
        let pxPerM = 1;
        if (coords.length >= 2) {
          const [lng1, lat1] = coords[0];
          const [lng2, lat2] = coords[1];
          const dLat = (lat2 - lat1) * 111320;
          const dLng = (lng2 - lng1) * 111320 * Math.cos(((lat1 + lat2) / 2) * Math.PI / 180);
          const edgeM = Math.sqrt(dLat * dLat + dLng * dLng);
          const [px1, py1] = toPixel(lng1, lat1);
          const [px2, py2] = toPixel(lng2, lat2);
          const edgePx = Math.hypot(px2 - px1, py2 - py1);
          if (edgeM > 0.5 && edgePx > 1) pxPerM = edgePx / edgeM;
        }

        const setbacksPx: PerSideSetbacks = {
          front: setbackM.front * pxPerM,
          rear: setbackM.rear * pxPerM,
          left: setbackM.left * pxPerM,
          right: setbackM.right * pxPerM,
        };

        const insetPts = computePerSideInset(boundaryPxPts, setbacksPx);
        if (insetPts) {
          const sbColor = data.setbackColor || "#FF8C00";
          ctx.strokeStyle = sbColor;
          ctx.lineWidth = Math.max(2, Math.round(2 * sf));
          ctx.setLineDash([Math.round(8 * sf), Math.round(4 * sf)]);
          ctx.beginPath();
          insetPts.forEach((pt, i) => {
            if (i === 0) ctx.moveTo(pt.x, pt.y);
            else ctx.lineTo(pt.x, pt.y);
          });
          ctx.closePath();
          ctx.stroke();
          ctx.setLineDash([]);

          // Setback label
          ctx.fillStyle = "rgba(0,0,0,0.7)";
          const setbackLabel = `Setbacks: F${setbackM.front.toFixed(1)}m R${setbackM.rear.toFixed(1)}m L${setbackM.left.toFixed(1)}m R${setbackM.right.toFixed(1)}m`;
          const setbackFontSize = Math.max(9, Math.round(9 * sf));
          ctx.font = `${setbackFontSize}px sans-serif`;
          const slW = ctx.measureText(setbackLabel).width + Math.round(10 * sf);
          const slH = Math.round(14 * sf);
          const slX = canvasW / 2 - slW / 2;
          const slY = canvasH - Math.round(45 * sf);
          ctx.beginPath();
          ctx.roundRect(slX, slY, slW, slH, Math.round(3 * sf));
          ctx.fill();
          ctx.fillStyle = sbColor;
          ctx.textAlign = "center";
          ctx.fillText(setbackLabel, canvasW / 2, slY + slH - Math.round(3 * sf));
        }
      }
    } else {
      // No boundary - just show structure rectangle
      ctx.fillStyle = "#555";
      ctx.font = `${Math.max(14, Math.round(14 * sf))}px sans-serif`;
      ctx.textAlign = "center";
      ctx.fillText("No parcel boundary data available", canvasW / 2, canvasH / 2 - 20);
      if (data.structureWidthMm && data.structureLengthMm) {
        ctx.fillText(
          `Structure: ${(data.structureWidthMm / 1000).toFixed(1)}m × ${(data.structureLengthMm / 1000).toFixed(1)}m`,
          canvasW / 2, canvasH / 2 + 10
        );
      }
    }

    // North arrow (scaled)
    const arrowX = canvasW - Math.round(40 * sf);
    const arrowYPos = Math.round(40 * sf);
    ctx.strokeStyle = "#333";
    ctx.fillStyle = "#333";
    ctx.lineWidth = Math.max(2, Math.round(2 * sf));
    ctx.beginPath();
    ctx.moveTo(arrowX, arrowYPos + Math.round(20 * sf));
    ctx.lineTo(arrowX, arrowYPos - Math.round(10 * sf));
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(arrowX - Math.round(5 * sf), arrowYPos - Math.round(3 * sf));
    ctx.lineTo(arrowX, arrowYPos - Math.round(12 * sf));
    ctx.lineTo(arrowX + Math.round(5 * sf), arrowYPos - Math.round(3 * sf));
    ctx.closePath();
    ctx.fill();
    ctx.font = `bold ${Math.max(10, Math.round(10 * sf))}px sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText("N", arrowX, arrowYPos + Math.round(32 * sf));

    // Lot info
    if (sp?.lotId || sp?.suburb) {
      ctx.fillStyle = "#333";
      ctx.font = `${Math.max(11, Math.round(11 * sf))}px sans-serif`;
      ctx.textAlign = "left";
      const lotText = [sp?.lotId, sp?.suburb, sp?.areaSqm ? `${sp.areaSqm.toFixed(0)} m²` : ""].filter(Boolean).join(" • ");
      ctx.fillText(lotText, Math.round(10 * sf), canvasH - Math.round(10 * sf));
    }

    // Scale bar (bottom-left corner)
    {
      let metersPerPx: number;
      if (centroid && coords && coords.length >= 3) {
        const zoom = computeBatchAutoZoom(sp);
        const lat = centroid[1];
        // Google Static Maps: resolution = 156543.03 * cos(lat) / 2^zoom  (metres per pixel)
        // The fetched image is 640x480, rendered to canvasW x canvasH
        metersPerPx = (156543.03 * Math.cos(lat * Math.PI / 180) / Math.pow(2, zoom)) * (640 / canvasW);
      } else {
        const frontageM = sp?.frontageM || 20;
        metersPerPx = frontageM / (canvasW * 0.7);
      }

      // Choose a nice round scale bar length
      const targetBarPx = Math.round(100 * sf);
      const targetMeters = targetBarPx * metersPerPx;
      const niceSteps = [1, 2, 5, 10, 15, 20, 25, 30, 40, 50, 75, 100, 150, 200, 500];
      let scaleM = niceSteps[0];
      for (const s of niceSteps) {
        if (s <= targetMeters * 1.5) scaleM = s;
      }
      const barPx = scaleM / metersPerPx;

      const barX = Math.round(15 * sf);
      const barY = canvasH - Math.round(30 * sf);
      const barH = Math.round(6 * sf);

      // Background
      ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
      ctx.beginPath();
      ctx.roundRect(barX - Math.round(4 * sf), barY - Math.round(16 * sf), barPx + Math.round(8 * sf), barH + Math.round(24 * sf), Math.round(4 * sf));
      ctx.fill();

      // Bar segments (alternating black/white)
      const segments = 2;
      const segW = barPx / segments;
      for (let s = 0; s < segments; s++) {
        ctx.fillStyle = s % 2 === 0 ? "#ffffff" : "#999999";
        ctx.fillRect(barX + s * segW, barY, segW, barH);
      }
      // Border
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = Math.max(1, Math.round(sf));
      ctx.strokeRect(barX, barY, barPx, barH);

      // Tick marks
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = Math.max(1, Math.round(sf));
      for (let t = 0; t <= segments; t++) {
        const tx = barX + t * segW;
        ctx.beginPath();
        ctx.moveTo(tx, barY - Math.round(2 * sf));
        ctx.lineTo(tx, barY + barH + Math.round(2 * sf));
        ctx.stroke();
      }

      // Labels
      ctx.fillStyle = "#ffffff";
      ctx.font = `bold ${Math.max(9, Math.round(9 * sf))}px sans-serif`;
      ctx.textAlign = "left";
      ctx.textBaseline = "bottom";
      ctx.fillText("0", barX, barY - Math.round(3 * sf));
      ctx.textAlign = "right";
      ctx.fillText(`${scaleM}m`, barX + barPx, barY - Math.round(3 * sf));
      ctx.textBaseline = "alphabetic";
    }

    return canvas;
  } catch {
    return null;
  }
}

/** Render cross-section diagram directly to PDF using jsPDF drawing primitives */
function renderCrossSectionToPdf(doc: jsPDF, data: BatchDiagramData, x: number, y: number, w: number, h: number) {
  const roofPitch = parseFloat(data.specFall || "5");
  const fallOnGround = parseFloat(data.specFallOnGround || "0");

  // Layout coordinates
  const wallX = x + w * 0.25;
  const wallTop = y + h * 0.15;
  const wallBottom = y + h * 0.85;
  const wallH = wallBottom - wallTop;
  const beamY = wallTop + wallH * 0.25;
  const postX = x + w * 0.75;
  const floorY = wallBottom;
  const groundY = wallBottom + 15;

  // Roof angle calculation
  const roofAngleRad = (roofPitch * Math.PI) / 180;
  const roofRun = postX - wallX;
  const roofDrop = Math.tan(roofAngleRad) * roofRun;

  // House roof (sloping from upper-left)
  const roofStartX = wallX - 30;
  const roofStartY = wallTop - 30;
  const roofEndX = wallX + 10;
  const roofEndY = wallTop - 5;
  doc.setDrawColor(0);
  doc.setLineWidth(1.5);
  doc.line(roofStartX, roofStartY, roofEndX, roofEndY);

  // House wall (vertical)
  doc.setLineWidth(2);
  doc.line(wallX, wallTop, wallX, wallBottom);

  // Eave/fascia
  doc.setLineWidth(1);
  doc.line(wallX, wallTop, wallX + 15, wallTop);
  doc.line(wallX + 15, wallTop, wallX + 15, wallTop + 8);

  // Beam (from wall to post)
  doc.setLineWidth(2.5);
  doc.line(wallX, beamY, postX, beamY + roofDrop);

  // Roof sheet on beam
  doc.setLineWidth(0.8);
  doc.setDrawColor(80);
  doc.line(wallX - 5, beamY - 3, postX + 10, beamY + roofDrop - 3);

  // Post (vertical at right)
  doc.setDrawColor(0);
  doc.setLineWidth(2);
  const postTop = beamY + roofDrop;
  doc.line(postX, postTop, postX, floorY);

  // Floor level line
  doc.setLineWidth(0.5);
  doc.setDrawColor(100);
  doc.line(wallX - 20, floorY, postX + 30, floorY);

  // Ground level (with slope if fallOnGround > 0)
  doc.setLineWidth(0.8);
  doc.setDrawColor(60, 40, 20);
  const groundSlope = fallOnGround > 0 ? Math.min(15, fallOnGround * 2) : 0;
  doc.line(wallX - 20, groundY, postX + 30, groundY + groundSlope);
  // Ground hatching
  for (let gx = wallX - 20; gx < postX + 30; gx += 8) {
    doc.line(gx, groundY + ((gx - wallX + 20) / (postX + 50 - wallX + 20)) * groundSlope, gx - 4, groundY + ((gx - wallX + 20) / (postX + 50 - wallX + 20)) * groundSlope + 5);
  }

  // Labels
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(0);

  // Roof Pitch label
  doc.text(`Roof Pitch: ${data.specFall || "—"}°`, roofStartX, roofStartY - 5);
  // Roof Type
  doc.text(`Roof Type: ${data.specHouseRoofType || "—"}`, roofStartX + 5, roofStartY + 12);
  // Cut Back Eave
  doc.text(`Cut Back Eave: ${data.specCutBackEave || "—"}`, wallX + 20, wallTop + 5);
  // Remove Gutter & Flash
  doc.text(`Remove Gutter/Flash: ${data.specRemoveGutterFlash || "—"}`, postX + 15, wallTop + 5);
  // Wall Type
  doc.text(`Wall Type: ${data.specHouseWallType || "—"}`, wallX - 60, wallTop + wallH * 0.5);
  // Fall on Ground
  doc.text(`Fall: ${data.specFallOnGround || "—"}mm`, postX + 15, groundY + groundSlope / 2);
  // Ground Level
  doc.text(`Ground Level: ${data.specGroundLevel || "—"}mm`, postX - 20, groundY + groundSlope + 15);
  // Floor Level
  doc.text("Floor Level", wallX + 10, floorY - 3);
}

/** Render front elevation detail directly to PDF */
function renderFrontElevationToPdf(doc: jsPDF, data: BatchDiagramData, x: number, y: number, w: number, h: number) {
  const postCount = parseInt(data.specPostsNumber || "3", 10);
  const structW = w * 0.8;
  const startX = x + (w - structW) / 2;
  const groundY = y + h * 0.85;
  const beamY = y + h * 0.2;
  const gutterY = beamY - 8;
  const roofTopY = y + h * 0.08;

  // Roof (trapezoidal)
  doc.setDrawColor(0);
  doc.setLineWidth(1);
  doc.setFillColor(220, 220, 220);
  const overhang = 15;
  doc.line(startX - overhang, gutterY, startX + structW + overhang, gutterY); // gutter line
  doc.line(startX - overhang, gutterY, startX + 20, roofTopY); // left roof slope
  doc.line(startX + structW + overhang, gutterY, startX + structW - 20, roofTopY); // right roof slope
  doc.line(startX + 20, roofTopY, startX + structW - 20, roofTopY); // ridge

  // Beam
  doc.setLineWidth(2.5);
  doc.line(startX, beamY, startX + structW, beamY);

  // Posts
  doc.setLineWidth(2);
  const postSpacingPx = structW / Math.max(postCount - 1, 1);
  for (let i = 0; i < postCount; i++) {
    const px = startX + i * postSpacingPx;
    doc.line(px, beamY, px, groundY);
    // Post base
    doc.setLineWidth(0.5);
    doc.rect(px - 3, groundY - 2, 6, 4);
    doc.setLineWidth(2);
  }

  // Ground line
  doc.setLineWidth(0.8);
  doc.setDrawColor(80, 60, 40);
  doc.line(startX - 20, groundY, startX + structW + 20, groundY);

  // Dimension arrows - width
  doc.setDrawColor(0);
  doc.setLineWidth(0.3);
  const dimY = groundY + 20;
  doc.line(startX, dimY, startX + structW, dimY);
  doc.line(startX, groundY + 5, startX, dimY + 3);
  doc.line(startX + structW, groundY + 5, startX + structW, dimY + 3);
  // Arrowheads
  doc.triangle(startX, dimY, startX + 3, dimY - 1.5, startX + 3, dimY + 1.5, "F");
  doc.triangle(startX + structW, dimY, startX + structW - 3, dimY - 1.5, startX + structW - 3, dimY + 1.5, "F");

  // Height dimension
  const hDimX = startX - 20;
  doc.line(hDimX, beamY, hDimX, groundY);
  doc.line(hDimX - 3, beamY, startX - 5, beamY);
  doc.line(hDimX - 3, groundY, startX - 5, groundY);
  doc.triangle(hDimX, beamY, hDimX - 1.5, beamY + 3, hDimX + 1.5, beamY + 3, "F");
  doc.triangle(hDimX, groundY, hDimX - 1.5, groundY - 3, hDimX + 1.5, groundY - 3, "F");

  // Labels
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(0);
  doc.text(`${data.specWidth || "—"}m`, startX + structW / 2, dimY + 8, { align: "center" });
  // specFloorHeight is in mm, display as mm
  doc.text(`${data.specFloorHeight || "—"}mm`, hDimX - 5, beamY + (groundY - beamY) / 2, { align: "center", angle: 90 });

  // Post spacing label
  if (postCount > 1) {
    doc.setFontSize(7);
    doc.text(`Post spacing: ${data.specPostSpacing || "—"}mm`, startX + postSpacingPx / 2, beamY + 12, { align: "center" });
  }

  // Beam size label
  doc.setFontSize(7);
  doc.text(`Beam: ${data.specBeamSize || "—"}`, startX + structW / 2, beamY - 4, { align: "center" });
  // Gutter label
  doc.text(`Gutter: ${data.specGutterType || "—"}`, startX + structW + overhang + 5, gutterY + 3);
  // Post type
  doc.text(`Posts: ${data.specPostsType || "—"}`, startX + structW + 10, beamY + (groundY - beamY) / 2);
}

/** Render side elevation detail directly to PDF — shows projection depth with roof slope from side view */
function renderSideElevationToPdf(doc: jsPDF, data: BatchDiagramData, x: number, y: number, w: number, h: number) {
  const roofPitch = parseFloat(data.specFall || "2");
  const projectionM = parseFloat(data.specLength || "5");
  const floorHeightMm = parseFloat(data.specFloorHeight || "");
  const legacyUnderEaveToFloor = Number.isFinite(floorHeightMm) && floorHeightMm >= 1800 ? data.specFloorHeight : undefined;
  const underEaveToFloor = data.specRoofToFloor || legacyUnderEaveToFloor || "2400";
  const heightMm = parseFloat(underEaveToFloor);
  const roofType = data.specRoofType || "—";
  const postType = data.specPostsType || "90×90 SHS";
  const beamSize = data.specBeamSize || "—";

  // Layout proportions
  const drawW = w * 0.75;
  const drawH = h * 0.72;
  const startX = x + (w - drawW) / 2;
  const groundY = y + h * 0.88;
  const floorY = groundY - 4;

  // Post height proportional to drawing area
  const postH = drawH * 0.75;
  const beamY = floorY - postH;

  // House wall on left, post on right
  const wallX = startX + drawW * 0.12;
  const postX = startX + drawW * 0.88;
  const roofRun = postX - wallX;

  // Roof slope
  const roofAngleRad = (roofPitch * Math.PI) / 180;
  const roofDrop = Math.tan(roofAngleRad) * roofRun;
  const postTopY = beamY + roofDrop;

  // === House Wall (left side) ===
  doc.setDrawColor(80, 60, 40);
  doc.setLineWidth(3);
  // Wall extends well above the eave/beam connection to ground
  const wallTopY = beamY - drawH * 0.28;
  doc.line(wallX, wallTopY, wallX, floorY);

  // House roof (sloping up-left from wall top)
  doc.setLineWidth(1.5);
  doc.setDrawColor(100, 80, 60);
  doc.line(wallX - 40, wallTopY - 20, wallX + 10, wallTopY + 10);

  // Eave/fascia overhang extending right from wall at eave (beam) level
  // The new roof connects HERE at the eave level
  doc.setDrawColor(80, 60, 40);
  doc.setLineWidth(1.2);
  doc.line(wallX, beamY - 3, wallX + 16, beamY - 3);
  // Fascia board (vertical at end of eave)
  doc.setDrawColor(0);
  doc.setLineWidth(1);
  doc.line(wallX + 16, beamY - 7, wallX + 16, beamY + 3);

  // === Beam (sloping from wall to post) ===
  doc.setDrawColor(0);
  doc.setLineWidth(3);
  doc.line(wallX, beamY, postX, postTopY);

  // === Roof sheet (parallel to beam, slightly above) ===
  doc.setLineWidth(1);
  doc.setDrawColor(60);
  const roofThickness = 4;
  // Top surface of roof
  doc.line(wallX - 8, beamY - roofThickness, postX + 12, postTopY - roofThickness);
  // Bottom surface (the beam line above serves as this)
  // Front edge overhang
  doc.line(postX + 12, postTopY - roofThickness, postX + 12, postTopY + 2);

  // Gutter at low end
  doc.setLineWidth(0.8);
  doc.setDrawColor(80);
  // Simple gutter profile
  doc.line(postX + 8, postTopY + 2, postX + 16, postTopY + 2);
  doc.line(postX + 16, postTopY + 2, postX + 16, postTopY + 8);
  doc.line(postX + 8, postTopY + 2, postX + 8, postTopY + 6);

  // === Post (vertical at right) ===
  doc.setDrawColor(0);
  doc.setLineWidth(2.5);
  doc.line(postX, postTopY, postX, floorY);
  // Post base plate
  doc.setLineWidth(0.8);
  doc.rect(postX - 4, floorY - 3, 8, 5);

  // === Ground line with hatching ===
  doc.setLineWidth(1);
  doc.setDrawColor(80, 60, 40);
  doc.line(wallX - 30, groundY, postX + 40, groundY);
  // Hatching
  doc.setLineWidth(0.3);
  for (let gx = wallX - 30; gx < postX + 40; gx += 6) {
    doc.line(gx, groundY, gx - 3, groundY + 4);
  }

  // === Floor level line (dashed) ===
  doc.setDrawColor(150);
  doc.setLineWidth(0.4);
  doc.setLineDashPattern([3, 2], 0);
  doc.line(wallX - 20, floorY, postX + 30, floorY);
  doc.setLineDashPattern([], 0);

  // === Dimension: Projection (horizontal, below ground) ===
  doc.setDrawColor(0);
  doc.setLineWidth(0.4);
  const projDimY = groundY + 18;
  doc.line(wallX, projDimY, postX, projDimY);
  doc.line(wallX, groundY + 5, wallX, projDimY + 3);
  doc.line(postX, groundY + 5, postX, projDimY + 3);
  // Arrowheads
  doc.triangle(wallX, projDimY, wallX + 3, projDimY - 1.5, wallX + 3, projDimY + 1.5, "F");
  doc.triangle(postX, projDimY, postX - 3, projDimY - 1.5, postX - 3, projDimY + 1.5, "F");

  // === Dimension: Post height (vertical, right side) ===
  const hDimX = postX + 25;
  doc.line(hDimX, postTopY, hDimX, floorY);
  doc.line(postX + 5, postTopY, hDimX + 3, postTopY);
  doc.line(postX + 5, floorY, hDimX + 3, floorY);
  doc.triangle(hDimX, postTopY, hDimX - 1.5, postTopY + 3, hDimX + 1.5, postTopY + 3, "F");
  doc.triangle(hDimX, floorY, hDimX - 1.5, floorY - 3, hDimX + 1.5, floorY - 3, "F");

  // === Dimension: Overall height (from beam at wall to floor, left side) ===
  const ohDimX = wallX - 30;
  doc.line(ohDimX, beamY, ohDimX, floorY);
  doc.line(ohDimX - 3, beamY, wallX - 5, beamY);
  doc.line(ohDimX - 3, floorY, wallX - 5, floorY);
  doc.triangle(ohDimX, beamY, ohDimX - 1.5, beamY + 3, ohDimX + 1.5, beamY + 3, "F");
  doc.triangle(ohDimX, floorY, ohDimX - 1.5, floorY - 3, ohDimX + 1.5, floorY - 3, "F");

  // === Roof pitch angle indicator ===
  doc.setDrawColor(200, 50, 50);
  doc.setLineWidth(0.5);
  // Small arc near the wall end showing the pitch angle
  const arcR = 25;
  const arcStartX = wallX + arcR;
  const arcEndX = wallX + arcR * Math.cos(roofAngleRad);
  const arcEndY = beamY + arcR * Math.sin(roofAngleRad);
  doc.line(wallX, beamY, arcStartX, beamY); // horizontal reference
  doc.line(wallX, beamY, arcEndX, arcEndY); // slope line

  // === Labels ===
  doc.setDrawColor(0);
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(0);

  // Projection label
  doc.text(`${projectionM.toFixed(2)}m O/ALL PROJECTION`, wallX + roofRun / 2, projDimY + 8, { align: "center" });

  // Post height label (right)
  const postHeightMm = Math.round(heightMm - roofDrop / postH * heightMm);
  doc.text(`${underEaveToFloor || "—"}mm`, hDimX + 4, postTopY + (floorY - postTopY) / 2, { align: "left" });

  // Overall height label (left)
  doc.text(`${heightMm.toFixed(0)}mm O/A`, ohDimX - 5, beamY + (floorY - beamY) / 2, { align: "center", angle: 90 });

  // Roof pitch label
  doc.setFontSize(8);
  doc.setTextColor(200, 50, 50);
  doc.text(`ROOF FALL ${roofPitch}°`, wallX + 35, beamY - 8);

  // Roof type label (on the roof sheet)
  doc.setFontSize(8);
  doc.setTextColor(60);
  const roofLabelX = wallX + roofRun * 0.4;
  const roofLabelY = beamY + roofDrop * 0.4 - 12;
  doc.text(`${roofType.toUpperCase()} @ ${roofPitch}°`, roofLabelX, roofLabelY, { align: "center" });

  // EAVE LEVEL dashed line label
  doc.setFontSize(6);
  doc.setTextColor(100);
  doc.setLineDashPattern([2, 2], 0);
  doc.setDrawColor(150);
  doc.setLineWidth(0.3);
  doc.line(wallX, beamY, wallX - 20, beamY);
  doc.setLineDashPattern([], 0);
  doc.text("EAVE LEVEL", wallX - 22, beamY - 2, { align: "right" });

  // Post type label
  doc.setFontSize(7);
  doc.setTextColor(0);
  doc.text(`Post ${postType}`, postX - 5, floorY - postH * 0.3, { align: "right", angle: 90 });

  // Beam size label
  doc.text(`Beam: ${beamSize}`, wallX + roofRun * 0.5, beamY + roofDrop * 0.5 + 10, { align: "center" });

  // House wall label
  doc.setFontSize(7);
  doc.setTextColor(80, 60, 40);
  doc.text("EXISTING HOUSE", wallX - 5, wallTopY + (beamY - wallTopY) / 2, { align: "center", angle: 90 });

  // Gutter label
  doc.setFontSize(6);
  doc.setTextColor(80);
  doc.text(`Gutter: ${data.specGutterType || "—"}`, postX + 18, postTopY + 5);
}

/** Render plan view (top-down) directly to PDF */
function renderPlanViewToPdf(doc: jsPDF, data: BatchDiagramData, x: number, y: number, w: number, h: number) {
  const houseWalls = data.houseWalls || [];
  const postPositions = data.postPositions || [];

  // Structure rectangle
  const rectW = w * 0.7;
  const rectH = h * 0.7;
  const rectX = x + (w - rectW) / 2;
  const rectY = y + (h - rectH) / 2;

  // Main outline
  doc.setDrawColor(0);
  doc.setLineWidth(1.5);
  doc.rect(rectX, rectY, rectW, rectH);

  // Corner labels
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(0);
  doc.text("A", rectX - 8, rectY - 4);
  doc.text("B", rectX + rectW + 4, rectY - 4);
  doc.text("C", rectX + rectW + 4, rectY + rectH + 8);
  doc.text("D", rectX - 8, rectY + rectH + 8);

  // Sides
  const sides: Record<string, { x1: number; y1: number; x2: number; y2: number }> = {
    "A-B": { x1: rectX, y1: rectY, x2: rectX + rectW, y2: rectY },
    "B-C": { x1: rectX + rectW, y1: rectY, x2: rectX + rectW, y2: rectY + rectH },
    "C-D": { x1: rectX + rectW, y1: rectY + rectH, x2: rectX, y2: rectY + rectH },
    "D-A": { x1: rectX, y1: rectY + rectH, x2: rectX, y2: rectY },
  };

  // House walls (thick hatched)
  for (const wall of houseWalls) {
    const edge = sides[wall];
    if (!edge) continue;
    doc.setDrawColor(139, 69, 19);
    doc.setLineWidth(4);
    doc.line(edge.x1, edge.y1, edge.x2, edge.y2);
    // Label
    doc.setFontSize(7);
    doc.setTextColor(139, 69, 19);
    const mx = (edge.x1 + edge.x2) / 2;
    const my = (edge.y1 + edge.y2) / 2;
    const isH = wall === "A-B" || wall === "C-D";
    doc.text("HOUSE", mx + (isH ? 0 : (wall === "D-A" ? -12 : 12)), my + (isH ? (wall === "A-B" ? -6 : 10) : 0), { align: "center" });
  }

  // ═══ Gutter lines (blue) on configured sides ═══
  const gutterSides = data.gutterSides || [];
  if (gutterSides.length > 0) {
    doc.setDrawColor(37, 99, 235); // blue-600
    doc.setLineWidth(2.5);
    doc.setLineDashPattern([], 0);
    for (const gs of gutterSides) {
      const edge = sides[gs];
      if (!edge) continue;
      // Offset gutter line slightly inward from the edge
      const isH = gs === "A-B" || gs === "C-D";
      const inset = 4;
      let gx1 = edge.x1, gy1 = edge.y1, gx2 = edge.x2, gy2 = edge.y2;
      if (isH) {
        const dir = gs === "A-B" ? 1 : -1;
        gy1 += inset * dir;
        gy2 += inset * dir;
      } else {
        const dir = gs === "D-A" ? 1 : -1;
        gx1 += inset * dir;
        gx2 += inset * dir;
      }
      doc.line(gx1, gy1, gx2, gy2);
      // "GUTTER" label
      const gmx = (gx1 + gx2) / 2;
      const gmy = (gy1 + gy2) / 2;
      doc.setFontSize(5);
      doc.setTextColor(37, 99, 235);
      if (isH) {
        doc.text("GUTTER", gmx, gmy + (gs === "A-B" ? 4 : -2), { align: "center" });
      } else {
        doc.text("GUTTER", gmx + (gs === "D-A" ? 4 : -4), gmy, { align: "center", angle: 90 });
      }
    }
  }

  // Beam lines — only render if beams actually exist in spec
  let hasBeams = false;
  let beamEntriesParsed: Array<{ type: string; size: string; lm: number }> = [];
  try {
    const beamEntries = data.specBeamEntries ? JSON.parse(data.specBeamEntries) : [];
    hasBeams = Array.isArray(beamEntries) && beamEntries.length > 0;
    if (hasBeams) beamEntriesParsed = beamEntries;
  } catch { /* ignore */ }

  // Parse beam positions — new format: "idx:pct:orientation" joined by semicolons
  // Legacy format was JSON array of {y: number}. We support both.
  // Declared outside the if(hasBeams) block so post markers can reference beam positions.
  type ParsedBeam = { idx: number; pct: number; orientation: "H" | "V" };
  let parsedBeams: ParsedBeam[] = [];
  try {
    const raw = data.specBeamPositions || "";
    if (raw.includes(":")) {
      parsedBeams = raw.split(";").filter(Boolean).map(s => {
        const parts = s.split(":");
        return {
          idx: parseInt(parts[0], 10),
          pct: parseInt(parts[1], 10),
          orientation: (parts[2] === "V" ? "V" : "H") as "H" | "V",
        };
      }).filter(b => !isNaN(b.idx) && !isNaN(b.pct));
    } else if (raw.startsWith("[")) {
      const legacy: { y: number }[] = JSON.parse(raw);
      parsedBeams = legacy.map((b, i) => ({ idx: i, pct: b.y, orientation: "H" as const }));
    }
  } catch { /* ignore parse errors */ }

  if (hasBeams) {
    doc.setDrawColor(50);
    doc.setLineWidth(1.5);
    doc.setLineDashPattern([4, 2], 0);

    if (parsedBeams.length > 0) {
      // Render each beam at its position with correct orientation
      const projMm = parseFloat(data.specLength || "0") * 1000;
      const widthMm = parseFloat(data.specWidth || "0") * 1000;

      for (const beam of parsedBeams) {
        if (beam.orientation === "H") {
          const by = rectY + rectH * (beam.pct / 100);
          doc.line(rectX, by, rectX + rectW, by);
          // Distance label from house wall (A-B edge)
          const distMm = Math.round(beam.pct * projMm / 100);
          doc.setFontSize(6);
          doc.setTextColor(80);
          doc.text(`${distMm}mm`, rectX - 2, by + 1, { align: "right" });
          // Beam size label (e.g. "S 140×50")
          const entry = beamEntriesParsed[beam.idx];
          if (entry) {
            const prefix = entry.type === "Steel" ? "S" : "A";
            doc.setFontSize(7);
            doc.setTextColor(50);
            doc.text(`${prefix} ${entry.size}`, rectX + rectW / 2, by - 2, { align: "center" });
          }
        } else {
          const bx = rectX + rectW * (beam.pct / 100);
          doc.line(bx, rectY, bx, rectY + rectH);
          // Distance label from left edge (D-A)
          const distMm = Math.round(beam.pct * widthMm / 100);
          doc.setFontSize(6);
          doc.setTextColor(80);
          doc.text(`${distMm}mm`, bx, rectY - 3, { align: "center" });
          // Beam size label
          const entry = beamEntriesParsed[beam.idx];
          if (entry) {
            const prefix = entry.type === "Steel" ? "S" : "A";
            doc.setFontSize(7);
            doc.setTextColor(50);
            doc.text(`${prefix} ${entry.size}`, bx + 3, rectY + rectH / 2, { align: "left", angle: 90 });
          }
        }
      }
    } else {
      // Fallback: single beam parallel to house wall, offset inward
      const beamOff = 12;
      if (houseWalls.includes("A-B")) {
        doc.line(rectX, rectY + beamOff, rectX + rectW, rectY + beamOff);
      } else if (houseWalls.includes("C-D")) {
        doc.line(rectX, rectY + rectH - beamOff, rectX + rectW, rectY + rectH - beamOff);
      } else if (houseWalls.includes("D-A")) {
        doc.line(rectX + beamOff, rectY, rectX + beamOff, rectY + rectH);
      } else if (houseWalls.includes("B-C")) {
        doc.line(rectX + rectW - beamOff, rectY, rectX + rectW - beamOff, rectY + rectH);
      } else {
        doc.line(rectX, rectY + beamOff, rectX + rectW, rectY + beamOff);
      }
      // Legacy beam label
      doc.setFontSize(7);
      doc.setTextColor(50);
      doc.text(data.specBeamSize || "BEAM", rectX + rectW / 2, rectY + 16, { align: "center" });
    }

    doc.setLineDashPattern([], 0);
  }

  // Post markers — supports edge posts ("side:pct") and beam-mounted posts ("beam:beamIdx:pct")
  doc.setFillColor(30, 41, 59);
  for (const marker of postPositions) {
    if (marker.startsWith("beam:")) {
      // Beam-mounted post: "beam:beamIdx:percentAlongBeam"
      const parts = marker.split(":");
      const beamIdx = parseInt(parts[1], 10);
      const pctAlongBeam = parseInt(parts[2], 10) / 100;
      // Find the corresponding beam from parsedBeams (if available)
      const beam = (hasBeams && parsedBeams.length > beamIdx) ? parsedBeams[beamIdx] : null;
      if (beam) {
        let px: number, py: number;
        if (beam.orientation === "H") {
          // Horizontal beam at beam.pct% from top, post at pctAlongBeam along width
          py = rectY + rectH * (beam.pct / 100);
          px = rectX + rectW * pctAlongBeam;
        } else {
          // Vertical beam at beam.pct% from left, post at pctAlongBeam along height
          px = rectX + rectW * (beam.pct / 100);
          py = rectY + rectH * pctAlongBeam;
        }
        // Draw post marker (diamond shape for beam-mounted posts)
        doc.setFillColor(79, 70, 229); // indigo for beam-mounted
        const d = 3;
        doc.lines([[d, d], [d, -d], [-d, -d], [-d, d]], px - d, py, [1, 1], "F");
        // "on beam" annotation
        doc.setFontSize(5);
        doc.setTextColor(79, 70, 229);
        doc.text("on beam", px, py + 5, { align: "center" });
        doc.setFillColor(30, 41, 59); // reset fill
      }
    } else {
      // Edge post: "side:pct"
      const [side, pctStr] = marker.split(":");
      const pct = parseInt(pctStr, 10) / 100;
      const edge = sides[side];
      if (!edge) continue;
      const px = edge.x1 + (edge.x2 - edge.x1) * pct;
      const py = edge.y1 + (edge.y2 - edge.y1) * pct;
      doc.rect(px - 2.5, py - 2.5, 5, 5, "F");
    }
  }

  // ═══ Downpipe markers (green circles with DP text) ═══
  const downpipeMarkers = data.downpipeMarkers || [];
  const downpipeLocations = data.downpipeLocations || [];

  // DP markers on gutter edges ("side:pct" format)
  for (const marker of downpipeMarkers) {
    const [side, pctStr] = marker.split(":");
    const pct = parseInt(pctStr, 10) / 100;
    const edge = sides[side];
    if (!edge) continue;
    const dpx = edge.x1 + (edge.x2 - edge.x1) * pct;
    const dpy = edge.y1 + (edge.y2 - edge.y1) * pct;
    doc.setFillColor(22, 163, 106); // green-600
    doc.circle(dpx, dpy, 3.5, "F");
    doc.setFontSize(4);
    doc.setTextColor(255, 255, 255);
    doc.text("DP", dpx, dpy + 1, { align: "center" });
  }

  // DP location indicators at corners
  const cornerCoords: Record<string, { x: number; y: number }> = {
    A: { x: rectX + 6, y: rectY + 6 },
    B: { x: rectX + rectW - 6, y: rectY + 6 },
    C: { x: rectX + rectW - 6, y: rectY + rectH - 6 },
    D: { x: rectX + 6, y: rectY + rectH - 6 },
  };
  for (const loc of downpipeLocations) {
    const pos = cornerCoords[loc];
    if (!pos) continue;
    doc.setFillColor(21, 128, 61); // green-700
    doc.circle(pos.x, pos.y, 4, "F");
    doc.setFontSize(5);
    doc.setTextColor(255, 255, 255);
    doc.text("DP", pos.x, pos.y + 1.5, { align: "center" });
  }

  // ═══ Post size label ═══
  if (data.specPostSize || data.specPostsType) {
    doc.setFontSize(7);
    doc.setTextColor(30, 41, 59);
    doc.text(`Posts: ${data.specPostSize || data.specPostsType}`, rectX + rectW / 2, rectY + rectH + 25, { align: "center" });
  }

  // Dimension arrows
  doc.setDrawColor(0);
  doc.setLineWidth(0.3);
  doc.setTextColor(0);
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");

  // Top dimension (width)
  const topDimY = rectY - 15;
  doc.line(rectX, topDimY, rectX + rectW, topDimY);
  doc.line(rectX, topDimY - 3, rectX, rectY - 3);
  doc.line(rectX + rectW, topDimY - 3, rectX + rectW, rectY - 3);
  doc.triangle(rectX, topDimY, rectX + 2, topDimY - 1, rectX + 2, topDimY + 1, "F");
  doc.triangle(rectX + rectW, topDimY, rectX + rectW - 2, topDimY - 1, rectX + rectW - 2, topDimY + 1, "F");
  doc.text(`${data.specWidth || "—"}m (Width)`, rectX + rectW / 2, topDimY - 4, { align: "center" });

  // Right dimension (projection)
  const rightDimX = rectX + rectW + 15;
  doc.line(rightDimX, rectY, rightDimX, rectY + rectH);
  doc.line(rectX + rectW + 3, rectY, rightDimX + 3, rectY);
  doc.line(rectX + rectW + 3, rectY + rectH, rightDimX + 3, rectY + rectH);
  doc.triangle(rightDimX, rectY, rightDimX - 1, rectY + 2, rightDimX + 1, rectY + 2, "F");
  doc.triangle(rightDimX, rectY + rectH, rightDimX - 1, rectY + rectH - 2, rightDimX + 1, rectY + rectH - 2, "F");
  doc.text(`${data.specLength || "—"}m (Projection)`, rightDimX + 8, rectY + rectH / 2, { align: "center", angle: 90 });

  // Roof type label in centre
  doc.setFontSize(10);
  doc.setTextColor(100);
  doc.text(data.specRoofType || "", rectX + rectW / 2, rectY + rectH / 2, { align: "center" });

  // Post count (shifted down if post size label is shown)
  const postCountY = (data.specPostSize || data.specPostsType) ? rectY + rectH + 32 : rectY + rectH + 18;
  doc.setFontSize(8);
  doc.setTextColor(0);
  const postCountText = `Total: ${postPositions.length} post${postPositions.length !== 1 ? "s" : ""}${data.specPostSpacing ? ` @ ${data.specPostSpacing}mm c/c` : ""}`;
  doc.text(postCountText, rectX + rectW / 2, postCountY, { align: "center" });

  // ═══ Legend at bottom ═══
  const legendY = y + h - 8;
  doc.setFontSize(6);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(0);
  let legendX = x + 5;
  doc.text("Legend:", legendX, legendY);
  legendX += 16;
  // Gutter
  doc.setDrawColor(37, 99, 235);
  doc.setLineWidth(2);
  doc.line(legendX, legendY - 1, legendX + 8, legendY - 1);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(37, 99, 235);
  doc.text("Gutter", legendX + 10, legendY);
  legendX += 28;
  // DP
  doc.setFillColor(22, 163, 106);
  doc.circle(legendX + 2, legendY - 1, 2, "F");
  doc.setTextColor(22, 163, 106);
  doc.text("Downpipe", legendX + 6, legendY);
  legendX += 28;
  // Post
  doc.setFillColor(30, 41, 59);
  doc.rect(legendX, legendY - 2.5, 4, 4, "F");
  doc.setTextColor(30, 41, 59);
  doc.text("Post", legendX + 6, legendY);
  legendX += 20;
  // Beam
  doc.setDrawColor(50);
  doc.setLineWidth(1);
  doc.setLineDashPattern([2, 1], 0);
  doc.line(legendX, legendY - 1, legendX + 8, legendY - 1);
  doc.setLineDashPattern([], 0);
  doc.setTextColor(50);
  doc.text("Beam", legendX + 10, legendY);
  legendX += 24;
  // House wall
  doc.setDrawColor(139, 69, 19);
  doc.setLineWidth(3);
  doc.line(legendX, legendY - 1, legendX + 8, legendY - 1);
  doc.setTextColor(139, 69, 19);
  doc.setLineWidth(0.3);
  doc.text("House Wall", legendX + 10, legendY);

  // North arrow
  doc.setDrawColor(0);
  doc.setLineWidth(1);
  const naX = x + w - 20;
  const naY = y + 10;
  doc.line(naX, naY + 15, naX, naY);
  doc.triangle(naX, naY, naX - 2, naY + 4, naX + 2, naY + 4, "F");
  doc.setFontSize(8);
  doc.text("N", naX, naY - 3, { align: "center" });
}

/**
 * Generate a multi-page PDF combining site plan, elevations, and roof plan.
 * Returns a blob URL for preview or triggers download.
 */
export async function generateBatchDiagramPdf(data: BatchDiagramData, mode: "download" | "preview" = "download"): Promise<string | null> {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a3" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 15;
  const contentWidth = pageWidth - margin * 2;
  const contentHeight = pageHeight - 70; // space for header + footer

  const company = loadCompanyDetails();
  const logo: CustomLogo | null = loadCustomLogo();
  const logoData = logo?.dataUrl ?? null;
  const logoW = logo?.width;
  const logoH = logo?.height;

  // ─── Page 1: Site Plan ─────────────────────────────────────────────────────
  drawHeader(doc, logoData, company, data.quoteNumber, data.clientName, logoW, logoH);
  drawPageTitle(doc, "Site Plan", data.siteAddress || undefined);

  const sitePlanCanvas = await renderSitePlanCanvas(data, contentWidth * 3, contentHeight * 3);
  if (sitePlanCanvas) {
    const imgData = sitePlanCanvas.toDataURL("image/png");
    const imgW = contentWidth;
    const imgH = contentHeight - 10;
    doc.addImage(imgData, "PNG", margin, 62, imgW, imgH);
  }

  // Lot info at bottom
  if (data.sitePlan?.lotId || data.sitePlan?.suburb) {
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(80, 85, 90);
    const lotLine = [data.sitePlan?.lotId, data.sitePlan?.suburb, data.sitePlan?.areaSqm ? `${data.sitePlan.areaSqm.toFixed(0)} m²` : ""].filter(Boolean).join(" • ");
    doc.text(lotLine, margin, pageHeight - 15);
  }

  // ─── Page 2: Roof Plan (3D Diagram) ───────────────────────────────────────
  doc.addPage();
  drawHeader(doc, logoData, company, data.quoteNumber, data.clientName, logoW, logoH);

  // Use specRoofShape (e.g. "Gable", "Hip") for 3D diagram type, not specRoofType (product name)
  const roofType = parseRoofType(data.specRoofShape || data.specRoofType);
  const roofTypeLabel = roofType === "split_gable" ? "Split Gable" : roofType.charAt(0).toUpperCase() + roofType.slice(1);
  drawPageTitle(doc, "Roof Plan", `Type: ${roofTypeLabel}  |  ${data.specWidth || "—"}m × ${data.specLength || "—"}m`);

  const width = parseFloat(data.specWidth || "4") * 1000;
  const length = parseFloat(data.specLength || "3") * 1000;
  // specFloorHeight is stored in mm (e.g. "2400"), specWidth/specLength are in metres
  const rawH = parseFloat(data.specFloorHeight || "2400");
  const height = rawH < 10 ? rawH * 1000 : rawH; // handle both "2.4" (m) and "2400" (mm)

  // Build skylight info if available
  const skylightInfo = (data.specSkylightType && data.specSkylightType !== "None" && data.specSkylightQty && data.specSkylightLm)
    ? {
        type: data.specSkylightType,
        lm: parseFloat(data.specSkylightLm),
        qty: parseInt(data.specSkylightQty, 10),
        finish: data.specSkylightFinish || "Clear",
      }
    : undefined;

  const diagramOptions: RoofDiagramOptions = {
    roofType,
    width,
    length,
    height,
    roofColour: data.specRoofTopColour || "Monument",
    wallColour: data.specBeamColour || "Surfmist",
    postColour: data.specPostsColour || "Monument",
    label: `${data.clientName} — ${data.siteAddress || ""}`,
    showDimensions: true,
    roofSheetType: data.specRoofType || undefined,
    skylight: skylightInfo,
  };

  const diagramUrl = renderRoofDiagram(diagramOptions);
  // The renderRoofDiagram returns a data URL from a canvas
  const roofImgW = contentWidth;
  const roofImgH = roofImgW * 0.6;
  doc.addImage(diagramUrl, "PNG", margin, 65, roofImgW, roofImgH);

  // ─── Page 3: Cross-Section Diagram ──────────────────────────────────────────
  doc.addPage();
  drawHeader(doc, logoData, company, data.quoteNumber, data.clientName, logoW, logoH);
  drawPageTitle(doc, "Cross-Section (Side Elevation Detail)", `Roof Pitch: ${data.specFall || "—"}°  |  Wall Type: ${data.specHouseWallType || "—"}`);
  renderCrossSectionToPdf(doc, data, margin, 65, contentWidth, contentHeight - 20);

  // ─── Page 4: Front Elevation Detail ─────────────────────────────────────────
  doc.addPage();
  drawHeader(doc, logoData, company, data.quoteNumber, data.clientName, logoW, logoH);
  drawPageTitle(doc, "Front Elevation Detail", `Width: ${data.specWidth || "—"}m  |  Posts: ${data.specPostsNumber || "—"}  |  Beam: ${data.specBeamSize || "—"}`);
  renderFrontElevationToPdf(doc, data, margin, 65, contentWidth, contentHeight - 20);

  // ─── Page 5: Side Elevation Detail ─────────────────────────────────────────
  doc.addPage();
  drawHeader(doc, logoData, company, data.quoteNumber, data.clientName, logoW, logoH);
  drawPageTitle(doc, "Side Elevation Detail", `Projection: ${data.specLength || "—"}m  |  Pitch: ${data.specFall || "—"}°  |  Roof: ${data.specRoofType || "—"}`);
  renderSideElevationToPdf(doc, data, margin, 65, contentWidth, contentHeight - 20);

  // ─── Page 6: Plan View ──────────────────────────────────────────────────────
  doc.addPage();
  drawHeader(doc, logoData, company, data.quoteNumber, data.clientName, logoW, logoH);
  drawPageTitle(doc, "Plan View (Top-Down)", `${data.specWidth || "—"}m × ${data.specLength || "—"}m  |  Posts: ${data.postPositions?.length || 0}`);
  renderPlanViewToPdf(doc, data, margin, 65, contentWidth, contentHeight - 20);

  // ─── Connection Detail Page ────────────────────────────────────────────────
  if (data.connectionType && data.connectionType !== "None") {
    doc.addPage();
    drawHeader(doc, logoData, company, data.quoteNumber, data.clientName, logoW, logoH);
    // Use the code for lookup, display the human-readable connectionType as title
    const connCode = data.connectionCode || data.connectionType;
    drawPageTitle(doc, "Connection Detail", `Type: ${data.connectionType}${data.connectionCode ? ` (${data.connectionCode})` : ""}`);

    // Connection type descriptions keyed by short code
    const connectionDescriptions: Record<string, string[]> = {
      BCH: ["Fascia Bracket Connection", "Brackets fixed to existing fascia board.", "Beam sits on top of brackets.", "Existing gutter removed and flashed."],
      GBL: ["Gable Bracket Connection", "Brackets fixed to existing gable end wall.", "Beam connects at gable end.", "Suitable for side-of-house connections."],
      POP: ["Pop-Up Bracket Connection", "Pop-up brackets extend above existing roof line.", "New beam connects at elevated position.", "Used when roof needs to clear existing structure."],
      FLY: ["Fly-Over (Extenda) Bracket Connection", "Extenda brackets fly over existing roof.", "New roof sits above existing roof level.", "Maintains clearance over existing roofline."],
      WFX: ["Wall Fix Connection", "Direct wall fixing with beam or bracket.", "Bolted into masonry or timber frame.", "Requires appropriate wall anchors for wall type."],
      FSS: ["Free Standing Structure", "No connection to existing house.", "Independent post-supported structure.", "All loads carried by posts to footings."],
    };

    let imgRendered = false;
    if (data.connectionImageUrl) {
      const connImg = await loadImage(data.connectionImageUrl);
      if (connImg) {
        // Draw connection image centred, large format
        const imgMaxW = contentWidth * 0.7;
        const imgMaxH = contentHeight * 0.5;
        const imgAspect = connImg.width / connImg.height;
        let imgW = imgMaxW;
        let imgH = imgW / imgAspect;
        if (imgH > imgMaxH) {
          imgH = imgMaxH;
          imgW = imgH * imgAspect;
        }
        const imgX = margin + (contentWidth - imgW) / 2;
        const imgY = 80;

        // Border around image
        doc.setDrawColor(200, 200, 200);
        doc.setLineWidth(0.5);
        doc.rect(imgX - 2, imgY - 2, imgW + 4, imgH + 4);

        const canvas = document.createElement("canvas");
        canvas.width = connImg.width;
        canvas.height = connImg.height;
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(connImg, 0, 0);
        const imgData = canvas.toDataURL("image/jpeg", 0.9);
        doc.addImage(imgData, "JPEG", imgX, imgY, imgW, imgH);

        // Label below image
        doc.setFontSize(11);
        doc.setTextColor(60, 60, 60);
        doc.text(`Connection: ${data.connectionType}`, margin + contentWidth / 2, imgY + imgH + 12, { align: "center" });
        doc.setFontSize(9);
        doc.setTextColor(120, 120, 120);
        doc.text("Refer to this detail for installation method at the house connection point.", margin + contentWidth / 2, imgY + imgH + 20, { align: "center" });
        imgRendered = true;
      }
    }

    // Fallback: render text-based connection detail if image failed or wasn't available
    if (!imgRendered) {
      const connY = 90;
      // Look up by code first, then by raw connectionType, then generic fallback
      const desc = connectionDescriptions[connCode] || connectionDescriptions[data.connectionType] || [`Connection Type: ${data.connectionType}`, "Refer to installation manual for details."];

      // Draw a bordered info box
      const boxX = margin + 20;
      const boxW = contentWidth - 40;
      const boxH = 80;
      doc.setDrawColor(180, 180, 180);
      doc.setFillColor(248, 250, 252);
      doc.setLineWidth(0.5);
      doc.roundedRect(boxX, connY, boxW, boxH, 3, 3, "FD");

      // Title inside box
      doc.setFontSize(14);
      doc.setTextColor(30, 30, 30);
      doc.text(desc[0] || data.connectionType, boxX + boxW / 2, connY + 18, { align: "center" });

      // Description lines
      doc.setFontSize(10);
      doc.setTextColor(80, 80, 80);
      desc.slice(1).forEach((line, i) => {
        doc.text(`\u2022 ${line}`, boxX + 15, connY + 34 + i * 14);
      });

      // Note at bottom
      doc.setFontSize(9);
      doc.setTextColor(120, 120, 120);
      doc.text("Refer to this detail for installation method at the house connection point.", margin + contentWidth / 2, connY + boxH + 20, { align: "center" });
    }
  }

  // ─── Footer on all pages ───────────────────────────────────────────────────
  drawFooter(doc, data.quoteNumber);

  // Output
  if (mode === "preview") {
    const blob = doc.output("blob");
    return URL.createObjectURL(blob);
  } else {
    const filename = `${data.quoteNumber || "Quote"}_Diagrams.pdf`;
    const dataUri = doc.output("dataurlstring", { filename });
    const a = document.createElement("a");
    a.href = dataUri;
    a.download = filename;
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    setTimeout(() => document.body.removeChild(a), 1000);
    logClientDownload({
      filename,
      source: "batch_diagram_pdf",
      entityType: "quote",
      entityId: data.quoteNumber,
      mimeType: "application/pdf",
      metadata: { clientName: data.clientName },
    });
    return null;
  }
}
