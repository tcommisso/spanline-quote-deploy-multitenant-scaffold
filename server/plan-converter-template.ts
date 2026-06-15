/**
 * Printable A4 Drawing Template Generator
 * Generates a structured A4 template that construction teams print and draw over.
 * Includes: 5mm grid dots, scale calibration bar, colour legend, element numbering guide,
 * drawing area border, and metadata fields.
 */
import { PDFDocument, StandardFonts, rgb, PDFPage, PDFFont } from "pdf-lib";
import { getCompanyDisplayName } from "./company-name";

// Page dimensions in points (1pt = 1/72 inch)
const A4_WIDTH = 595.28; // 210mm
const A4_HEIGHT = 841.89; // 297mm
const A3_WIDTH = 1190.55; // 420mm (landscape)
const A3_HEIGHT = 841.89; // 297mm (landscape)
const MARGIN = 30;
const MM_TO_PT = 2.835; // 1mm = 2.835pt

interface TemplateOptions {
  diagramType?: "floor_plan" | "elevation_front" | "elevation_side" | "elevation_rear";
  scale?: string;
  includeGrid?: boolean;
  pageSize?: "A4" | "A3";
}

export async function generateDrawingTemplate(options: TemplateOptions = {}): Promise<Buffer> {
  const { diagramType = "floor_plan", scale = "1:100", includeGrid = true, pageSize = "A4" } = options;
  const companyName = await getCompanyDisplayName();

  const doc = await PDFDocument.create();
  const PAGE_WIDTH = pageSize === "A3" ? A3_WIDTH : A4_WIDTH;
  const PAGE_HEIGHT = pageSize === "A3" ? A3_HEIGHT : A4_HEIGHT;
  const page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);

  const fontRegular = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const fontItalic = await doc.embedFont(StandardFonts.HelveticaOblique);

  // ─── Page Header ──────────────────────────────────────────────────────────
  const headerY = PAGE_HEIGHT - MARGIN;

  // Company name
  page.drawText(companyName.toUpperCase(), {
    x: MARGIN,
    y: headerY - 14,
    size: 14,
    font: fontBold,
    color: rgb(0.04, 0.075, 0.125),
  });

  // Template title
  page.drawText("HAND-DRAWN PLAN TEMPLATE", {
    x: MARGIN,
    y: headerY - 28,
    size: 9,
    font: fontRegular,
    color: rgb(0.3, 0.3, 0.3),
  });

  // Diagram type indicator
  const typeLabels: Record<string, string> = {
    floor_plan: "FLOOR PLAN",
    elevation_front: "FRONT ELEVATION",
    elevation_side: "SIDE ELEVATION",
    elevation_rear: "REAR ELEVATION",
  };
  const typeLabel = typeLabels[diagramType] || "FLOOR PLAN";
  page.drawText(`Type: ${typeLabel}`, {
    x: PAGE_WIDTH - MARGIN - 140,
    y: headerY - 14,
    size: 9,
    font: fontBold,
    color: rgb(0.1, 0.1, 0.1),
  });
  page.drawText(`Scale: ${scale}  |  ${pageSize}`, {
    x: PAGE_WIDTH - MARGIN - 140,
    y: headerY - 26,
    size: 8,
    font: fontRegular,
    color: rgb(0.3, 0.3, 0.3),
  });

  // Divider line
  page.drawLine({
    start: { x: MARGIN, y: headerY - 35 },
    end: { x: PAGE_WIDTH - MARGIN, y: headerY - 35 },
    thickness: 1,
    color: rgb(0.1, 0.1, 0.1),
  });

  // ─── Metadata Fields ──────────────────────────────────────────────────────
  const metaY = headerY - 55;
  const fieldHeight = 16;
  const fields = [
    { label: "Project:", x: MARGIN, width: 160 },
    { label: "Client:", x: MARGIN + 170, width: 160 },
    { label: "Date:", x: MARGIN + 340, width: 100 },
  ];

  for (const field of fields) {
    page.drawText(field.label, {
      x: field.x,
      y: metaY,
      size: 7,
      font: fontBold,
      color: rgb(0.2, 0.2, 0.2),
    });
    // Underline for writing
    page.drawLine({
      start: { x: field.x + 40, y: metaY - 2 },
      end: { x: field.x + field.width, y: metaY - 2 },
      thickness: 0.5,
      color: rgb(0.6, 0.6, 0.6),
    });
  }

  const fields2 = [
    { label: "Site Address:", x: MARGIN, width: 250 },
    { label: "Drawn By:", x: MARGIN + 260, width: 100 },
    { label: "Sheet:", x: MARGIN + 370, width: 70 },
  ];

  for (const field of fields2) {
    page.drawText(field.label, {
      x: field.x,
      y: metaY - fieldHeight,
      size: 7,
      font: fontBold,
      color: rgb(0.2, 0.2, 0.2),
    });
    page.drawLine({
      start: { x: field.x + 55, y: metaY - fieldHeight - 2 },
      end: { x: field.x + field.width, y: metaY - fieldHeight - 2 },
      thickness: 0.5,
      color: rgb(0.6, 0.6, 0.6),
    });
  }

  // ─── Drawing Area ─────────────────────────────────────────────────────────
  const drawAreaTop = metaY - 45;
  const drawAreaBottom = MARGIN + 165;
  const drawAreaLeft = MARGIN + 5;
  const drawAreaRight = PAGE_WIDTH - MARGIN - 5;
  const drawAreaWidth = drawAreaRight - drawAreaLeft;
  const drawAreaHeight = drawAreaTop - drawAreaBottom;

  // Drawing area border (thick)
  page.drawRectangle({
    x: drawAreaLeft,
    y: drawAreaBottom,
    width: drawAreaWidth,
    height: drawAreaHeight,
    borderColor: rgb(0.1, 0.1, 0.1),
    borderWidth: 1.5,
  });

  // ─── 5mm Grid Dots ────────────────────────────────────────────────────────
  if (includeGrid) {
    const gridSpacing = 5 * MM_TO_PT; // 5mm in points
    const dotSize = 0.6;

    for (let x = drawAreaLeft + gridSpacing; x < drawAreaRight - 2; x += gridSpacing) {
      for (let y = drawAreaBottom + gridSpacing; y < drawAreaTop - 2; y += gridSpacing) {
        page.drawCircle({
          x,
          y,
          size: dotSize,
          color: rgb(0.78, 0.78, 0.78),
        });
      }
    }
  }

  // ─── Scale Calibration Bar ────────────────────────────────────────────────
  // Draw a 100mm calibration bar at the bottom of the drawing area
  const calBarY = drawAreaBottom + 8;
  const calBarX = drawAreaLeft + 10;
  const calBarLength = 100 * MM_TO_PT; // 100mm printed = 100mm real

  page.drawText("SCALE CALIBRATION: Draw over this bar to set your scale", {
    x: calBarX,
    y: calBarY + 12,
    size: 6,
    font: fontItalic,
    color: rgb(0.4, 0.4, 0.4),
  });

  // Main bar
  page.drawLine({
    start: { x: calBarX, y: calBarY },
    end: { x: calBarX + calBarLength, y: calBarY },
    thickness: 1.5,
    color: rgb(0.2, 0.2, 0.2),
  });
  // End ticks
  page.drawLine({
    start: { x: calBarX, y: calBarY - 4 },
    end: { x: calBarX, y: calBarY + 4 },
    thickness: 1,
    color: rgb(0.2, 0.2, 0.2),
  });
  page.drawLine({
    start: { x: calBarX + calBarLength, y: calBarY - 4 },
    end: { x: calBarX + calBarLength, y: calBarY + 4 },
    thickness: 1,
    color: rgb(0.2, 0.2, 0.2),
  });
  // 10mm sub-divisions
  for (let i = 1; i < 10; i++) {
    const tickX = calBarX + (i * 10 * MM_TO_PT);
    const tickH = i === 5 ? 3 : 2;
    page.drawLine({
      start: { x: tickX, y: calBarY - tickH },
      end: { x: tickX, y: calBarY + tickH },
      thickness: 0.5,
      color: rgb(0.3, 0.3, 0.3),
    });
  }
  page.drawText("0", { x: calBarX - 3, y: calBarY - 12, size: 6, font: fontRegular, color: rgb(0.2, 0.2, 0.2) });
  page.drawText("50", { x: calBarX + 5 * 10 * MM_TO_PT - 5, y: calBarY - 12, size: 6, font: fontRegular, color: rgb(0.2, 0.2, 0.2) });
  page.drawText("100mm", { x: calBarX + calBarLength - 12, y: calBarY - 12, size: 6, font: fontRegular, color: rgb(0.2, 0.2, 0.2) });

  // ─── Colour Convention Legend ──────────────────────────────────────────────
  const legendY = MARGIN + 155;
  const legendX = MARGIN;

  page.drawText("COLOUR CONVENTIONS", {
    x: legendX,
    y: legendY,
    size: 8,
    font: fontBold,
    color: rgb(0.1, 0.1, 0.1),
  });
  page.drawLine({
    start: { x: legendX, y: legendY - 3 },
    end: { x: legendX + 200, y: legendY - 3 },
    thickness: 1,
    color: rgb(0.1, 0.1, 0.1),
  });

  const legendItems = [
    { colour: rgb(0.8, 0.1, 0.1), label: "RED — Existing walls / structure" },
    { colour: rgb(0.05, 0.05, 0.05), label: "BLACK — New structure (posts, beams, roof)" },
    { colour: rgb(0.1, 0.3, 0.8), label: "BLUE — Dimensions (mm)" },
    { colour: rgb(0.1, 0.6, 0.1), label: "GREEN — Notes / annotations (optional)" },
  ];

  let ly = legendY - 16;
  for (const item of legendItems) {
    // Colour swatch line
    page.drawLine({
      start: { x: legendX + 2, y: ly + 3 },
      end: { x: legendX + 22, y: ly + 3 },
      thickness: 2.5,
      color: item.colour,
    });
    page.drawText(item.label, {
      x: legendX + 28,
      y: ly,
      size: 7,
      font: fontRegular,
      color: rgb(0.2, 0.2, 0.2),
    });
    ly -= 12;
  }

  // ─── Element Numbering Guide ──────────────────────────────────────────────
  const numGuideX = MARGIN + 240;
  const numGuideY = MARGIN + 155;

  page.drawText("ELEMENT NUMBERING", {
    x: numGuideX,
    y: numGuideY,
    size: 8,
    font: fontBold,
    color: rgb(0.1, 0.1, 0.1),
  });
  page.drawLine({
    start: { x: numGuideX, y: numGuideY - 3 },
    end: { x: numGuideX + 200, y: numGuideY - 3 },
    thickness: 1,
    color: rgb(0.1, 0.1, 0.1),
  });

  const numItems = [
    "P1, P2, P3... = Posts (draw as filled squares)",
    "B1, B2, B3... = Beams (draw as lines between posts)",
    "W1, W2... = Existing walls (draw in RED)",
    "D1, D2... = Doors / Openings",
    "Write dimensions in BLUE with arrows",
    "Circle important notes for clarity",
  ];

  let ny = numGuideY - 15;
  for (const item of numItems) {
    page.drawText(`• ${item}`, {
      x: numGuideX,
      y: ny,
      size: 7,
      font: fontRegular,
      color: rgb(0.1, 0.1, 0.1),
    });
    ny -= 13;
  }

  // ─── Quick Tips Box ───────────────────────────────────────────────────────
  const tipsX = MARGIN;
  const tipsY = MARGIN + 30;
  const tipsWidth = PAGE_WIDTH - MARGIN * 2;
  const tipsHeight = 28;

  page.drawRectangle({
    x: tipsX,
    y: tipsY,
    width: tipsWidth,
    height: tipsHeight,
    color: rgb(0.96, 0.96, 0.96),
    borderColor: rgb(0.7, 0.7, 0.7),
    borderWidth: 0.5,
  });

  page.drawText("TIPS:", {
    x: tipsX + 5,
    y: tipsY + 16,
    size: 6,
    font: fontBold,
    color: rgb(0.2, 0.2, 0.2),
  });
  page.drawText("One diagram per page  •  Write clearly  •  Include ALL dimensions in mm  •  Number every post and beam  •  Mark scale clearly", {
    x: tipsX + 30,
    y: tipsY + 16,
    size: 6,
    font: fontRegular,
    color: rgb(0.3, 0.3, 0.3),
  });
  page.drawText("After drawing: photograph with good lighting, avoid shadows, keep camera parallel to page, include all edges of the drawing area.", {
    x: tipsX + 5,
    y: tipsY + 4,
    size: 6,
    font: fontRegular,
    color: rgb(0.3, 0.3, 0.3),
  });

  // ─── Footer ───────────────────────────────────────────────────────────────
  page.drawText(`${companyName} — Plan Converter Drawing Template`, {
    x: MARGIN,
    y: MARGIN + 5,
    size: 6,
    font: fontItalic,
    color: rgb(0.5, 0.5, 0.5),
  });
  page.drawText("Upload photo to Plan Converter for AI extraction and architectural PDF generation", {
    x: MARGIN,
    y: MARGIN - 5,
    size: 5.5,
    font: fontItalic,
    color: rgb(0.5, 0.5, 0.5),
  });

  const pdfBytes = await doc.save();
  return Buffer.from(pdfBytes);
}
