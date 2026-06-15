import { useRef, useEffect, forwardRef, useImperativeHandle } from "react";
import type { RakedRoofData } from "../../../../shared/eclipseCalculations";

interface RakedElevationDiagramProps {
  rakedData: RakedRoofData;
  bladeWidth: number; // mm - width of the unit (blade span direction)
  height: number; // mm - post height
  bladeDirection?: string;
  className?: string;
}

export interface RakedElevationDiagramHandle {
  getCanvasDataUrl: () => string | null;
}

/**
 * Renders a side elevation diagram of a raked Eclipse roof showing:
 * - Motor side beam (straight, full height)
 * - Free-end beam (angled)
 * - Offset block positions with incremental heights
 * - Blade attachment points
 * - Key dimension labels
 */
export const RakedElevationDiagram = forwardRef<RakedElevationDiagramHandle, RakedElevationDiagramProps>(
  function RakedElevationDiagram({
    rakedData,
    bladeWidth,
    height,
    bladeDirection = "along_width",
    className = "",
  }, ref) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useImperativeHandle(ref, () => ({
    getCanvasDataUrl: () => canvasRef.current?.toDataURL("image/png") ?? null,
  }));

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;
    const dpr = window.devicePixelRatio || 1;

    // Set canvas for high DPI
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width = `${W}px`;
    canvas.style.height = `${H}px`;
    ctx.scale(dpr, dpr);

    // Clear
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, W, H);

    // Margins
    const margin = { top: 50, right: 60, bottom: 60, left: 70 };
    const drawW = W - margin.left - margin.right;
    const drawH = H - margin.top - margin.bottom;

    // Title
    ctx.font = "bold 13px Arial, sans-serif";
    ctx.fillStyle = "#1a1a1a";
    ctx.textAlign = "center";
    ctx.fillText("Raked Roof Side Elevation — Installer Reference", W / 2, 22);

    ctx.font = "10px Arial, sans-serif";
    ctx.fillStyle = "#6b7280";
    ctx.fillText(
      `Motor Side: ${rakedData.longSideLengthMM}mm | Free End: ${rakedData.shortSideLengthMM}mm | Rake Angle: ${rakedData.rakeAngleDeg.toFixed(1)}°`,
      W / 2,
      38
    );

    // Scale: the diagram shows a front-on view looking at the angled beam
    // X-axis = blade width (across the unit), Y-axis = height
    const heightDiff = rakedData.maxOffsetHeightMM;
    const diagramHeight = Math.max(height, height + heightDiff);
    const scaleX = drawW / bladeWidth;
    const scaleY = drawH / diagramHeight;
    const scale = Math.min(scaleX, scaleY) * 0.85;

    const originX = margin.left + (drawW - bladeWidth * scale) / 2;
    const originY = margin.top + drawH - 20; // ground line

    // Helper: convert mm to screen coords (origin at bottom-left)
    const toScreen = (xMM: number, yMM: number) => ({
      sx: originX + xMM * scale,
      sy: originY - yMM * scale,
    });

    // ─── Ground line ───
    ctx.strokeStyle = "#9ca3af";
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.moveTo(originX - 20, originY + 5);
    ctx.lineTo(originX + bladeWidth * scale + 20, originY + 5);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.font = "9px Arial, sans-serif";
    ctx.fillStyle = "#9ca3af";
    ctx.textAlign = "left";
    ctx.fillText("Ground Level", originX - 15, originY + 18);

    // ─── Posts ───
    const postWidth = 6;
    ctx.fillStyle = "#3a3f47";

    // Motor side post (left) - full height
    const motorPost = toScreen(0, height);
    ctx.fillRect(motorPost.sx - postWidth / 2, motorPost.sy, postWidth, height * scale);

    // Free-end post (right) - same post height
    const freeEndPost = toScreen(bladeWidth, height);
    ctx.fillRect(freeEndPost.sx - postWidth / 2, freeEndPost.sy, postWidth, height * scale);

    // ─── Motor side beam (straight, horizontal at top) ───
    const beamThickness = 8;
    const motorBeamTop = toScreen(0, height);
    ctx.fillStyle = "#374151";
    ctx.fillRect(motorBeamTop.sx - 10, motorBeamTop.sy - beamThickness / 2, 20, beamThickness);

    // ─── Free-end beam (angled) ───
    // The free-end beam sits lower by heightDiff on the free-end side
    const freeEndBeamHeight = height - heightDiff;
    const freeEndBeamTop = toScreen(bladeWidth, freeEndBeamHeight);

    // Draw the angled beam line from motor side top to free-end lower position
    ctx.strokeStyle = "#dc2626";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(motorBeamTop.sx, motorBeamTop.sy);
    ctx.lineTo(freeEndBeamTop.sx, freeEndBeamTop.sy);
    ctx.stroke();

    // Label the angled beam
    const midBeamX = (motorBeamTop.sx + freeEndBeamTop.sx) / 2;
    const midBeamY = (motorBeamTop.sy + freeEndBeamTop.sy) / 2;
    ctx.font = "bold 9px Arial, sans-serif";
    ctx.fillStyle = "#dc2626";
    ctx.textAlign = "center";
    ctx.fillText("FREE-END BEAM (ANGLED)", midBeamX, midBeamY - 12);

    // ─── Motor side beam label ───
    ctx.fillStyle = "#1e40af";
    ctx.fillText("MOTOR SIDE BEAM", motorBeamTop.sx + 40, motorBeamTop.sy - 14);

    // ─── Offset blocks and blade attachment points ───
    const blades = rakedData.blades;
    const numBlades = blades.length;

    if (numBlades > 0) {
      const bladeSpacing = bladeWidth / (numBlades + 1);

      for (let i = 0; i < numBlades; i++) {
        const blade = blades[i];
        const xPos = bladeSpacing * (i + 1);
        const { sx, sy: _sy } = toScreen(xPos, 0);

        // Calculate where this blade attaches on the angled beam
        const t = (i + 1) / (numBlades + 1); // position ratio from motor to free-end
        const attachHeight = height - heightDiff * t;
        const attachPoint = toScreen(xPos, attachHeight);

        // Draw blade line (vertical from beam down)
        ctx.strokeStyle = "#5a6577";
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(attachPoint.sx, attachPoint.sy);
        ctx.lineTo(sx, originY);
        ctx.stroke();

        // Draw offset block (if height > 0)
        if (blade.offsetBlockHeightMM > 0) {
          const blockHeight = blade.offsetBlockHeightMM * scale;
          const blockWidth = 10;
          const blockY = attachPoint.sy;

          // Offset block rectangle
          ctx.fillStyle = "#f59e0b";
          ctx.globalAlpha = 0.7;
          ctx.fillRect(sx - blockWidth / 2, blockY - blockHeight, blockWidth, blockHeight);
          ctx.globalAlpha = 1.0;

          // Block outline
          ctx.strokeStyle = "#d97706";
          ctx.lineWidth = 0.8;
          ctx.strokeRect(sx - blockWidth / 2, blockY - blockHeight, blockWidth, blockHeight);

          // Height label (only every 3rd blade to avoid clutter, or first and last)
          if (i === 0 || i === numBlades - 1 || i % Math.max(1, Math.floor(numBlades / 5)) === 0) {
            ctx.font = "8px Arial, sans-serif";
            ctx.fillStyle = "#d97706";
            ctx.textAlign = "center";
            ctx.fillText(`${blade.offsetBlockHeightMM}mm`, sx, blockY - blockHeight - 4);
          }
        }

        // Blade attachment point marker
        ctx.fillStyle = "#1e40af";
        ctx.beginPath();
        ctx.arc(attachPoint.sx, attachPoint.sy, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // ─── Dimension lines ───
    ctx.strokeStyle = "#6b7280";
    ctx.fillStyle = "#374151";
    ctx.lineWidth = 0.8;
    ctx.font = "9px Arial, sans-serif";

    // Width dimension (bottom)
    const dimY = originY + 30;
    const leftEdge = toScreen(0, 0);
    const rightEdge = toScreen(bladeWidth, 0);
    ctx.beginPath();
    ctx.moveTo(leftEdge.sx, dimY);
    ctx.lineTo(rightEdge.sx, dimY);
    ctx.stroke();
    drawDimArrows(ctx, leftEdge.sx, dimY, rightEdge.sx, dimY);
    ctx.textAlign = "center";
    ctx.fillText(`${bladeWidth}mm (Blade Width)`, (leftEdge.sx + rightEdge.sx) / 2, dimY + 13);

    // Motor side height dimension (left)
    const dimX = originX - 30;
    const topMotor = toScreen(0, height);
    const bottomMotor = toScreen(0, 0);
    ctx.beginPath();
    ctx.moveTo(dimX, topMotor.sy);
    ctx.lineTo(dimX, bottomMotor.sy);
    ctx.stroke();
    drawDimArrows(ctx, dimX, topMotor.sy, dimX, bottomMotor.sy);
    ctx.save();
    ctx.translate(dimX - 12, (topMotor.sy + bottomMotor.sy) / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = "center";
    ctx.fillText(`${height}mm (Post Height)`, 0, 0);
    ctx.restore();

    // Height difference annotation (right side)
    if (heightDiff > 0) {
      const topRight = toScreen(bladeWidth, height);
      const freeEndTop = toScreen(bladeWidth, height - heightDiff);
      const annX = rightEdge.sx + 25;

      ctx.strokeStyle = "#dc2626";
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(annX, topRight.sy);
      ctx.lineTo(annX, freeEndTop.sy);
      ctx.stroke();
      drawDimArrows(ctx, annX, topRight.sy, annX, freeEndTop.sy);

      ctx.fillStyle = "#dc2626";
      ctx.font = "bold 9px Arial, sans-serif";
      ctx.save();
      ctx.translate(annX + 12, (topRight.sy + freeEndTop.sy) / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.textAlign = "center";
      ctx.fillText(`${heightDiff.toFixed(0)}mm drop`, 0, 0);
      ctx.restore();
    }

    // Rake angle annotation
    if (rakedData.rakeAngleDeg > 0) {
      ctx.font = "bold 10px Arial, sans-serif";
      ctx.fillStyle = "#dc2626";
      ctx.textAlign = "left";
      const angleLabel = `Rake: ${rakedData.rakeAngleDeg.toFixed(1)}°`;
      ctx.fillText(angleLabel, freeEndBeamTop.sx - 60, freeEndBeamTop.sy + 18);
    }

    // ─── Legend ───
    const legendY = H - 18;
    ctx.font = "9px Arial, sans-serif";
    ctx.textAlign = "left";
    ctx.fillStyle = "#6b7280";
    ctx.fillText("Legend:", 10, legendY);

    // Offset block
    ctx.fillStyle = "#f59e0b";
    ctx.globalAlpha = 0.7;
    ctx.fillRect(55, legendY - 8, 10, 8);
    ctx.globalAlpha = 1.0;
    ctx.fillStyle = "#4b5563";
    ctx.fillText("Offset Block", 70, legendY);

    // Blade attachment
    ctx.fillStyle = "#1e40af";
    ctx.beginPath();
    ctx.arc(140, legendY - 4, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#4b5563";
    ctx.fillText("Blade Attach", 148, legendY);

    // Angled beam
    ctx.strokeStyle = "#dc2626";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(218, legendY - 4);
    ctx.lineTo(238, legendY - 4);
    ctx.stroke();
    ctx.fillStyle = "#4b5563";
    ctx.fillText("Angled Beam", 243, legendY);

    // Blade line
    ctx.strokeStyle = "#5a6577";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(318, legendY - 8);
    ctx.lineTo(318, legendY + 2);
    ctx.stroke();
    ctx.fillStyle = "#4b5563";
    ctx.fillText("Blade", 324, legendY);
  }, [rakedData, bladeWidth, height, bladeDirection]);

  return (
    <div className={`bg-white border border-border rounded-lg p-3 ${className}`}>
      <canvas
        ref={canvasRef}
        width={560}
        height={340}
        className="w-full max-w-[560px] mx-auto"
        style={{ imageRendering: "crisp-edges" }}
      />
    </div>
  );
});

// Helper: draw dimension arrows at both ends of a line
function drawDimArrows(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number
) {
  const headLen = 4;
  const angle = Math.atan2(y2 - y1, x2 - x1);

  // Arrow at start pointing toward end
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x1 + headLen * Math.cos(angle - Math.PI / 6), y1 + headLen * Math.sin(angle - Math.PI / 6));
  ctx.moveTo(x1, y1);
  ctx.lineTo(x1 + headLen * Math.cos(angle + Math.PI / 6), y1 + headLen * Math.sin(angle + Math.PI / 6));
  ctx.stroke();

  // Arrow at end pointing toward start
  const revAngle = angle + Math.PI;
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 + headLen * Math.cos(revAngle - Math.PI / 6), y2 + headLen * Math.sin(revAngle - Math.PI / 6));
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 + headLen * Math.cos(revAngle + Math.PI / 6), y2 + headLen * Math.sin(revAngle + Math.PI / 6));
  ctx.stroke();
}

export default RakedElevationDiagram;
export type { RakedElevationDiagramProps };
