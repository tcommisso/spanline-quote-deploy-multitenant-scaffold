/**
 * Component Order PDF Generation
 * Generates a printable A4 PDF for a submitted component order
 * with Altaspan branding, job details header, line items table, and totals.
 * Uses pdf-lib (already installed).
 */
import { PDFDocument, StandardFonts, rgb, PDFFont, PDFPage } from "pdf-lib";

// ─── Layout Constants ───────────────────────────────────────────────────────
const A4_WIDTH = 595.28;
const A4_HEIGHT = 841.89;
const MARGIN_LEFT = 40;
const MARGIN_RIGHT = 40;
const MARGIN_TOP = 40;
const MARGIN_BOTTOM = 50;
const CONTENT_WIDTH = A4_WIDTH - MARGIN_LEFT - MARGIN_RIGHT;

// Brand colours (Altaspan brand tones)
const BRAND_PRIMARY = rgb(0.12, 0.25, 0.45); // dark navy
const BRAND_ACCENT = rgb(0.18, 0.42, 0.68); // medium blue
const LIGHT_GREY = rgb(0.92, 0.92, 0.92);
const MID_GREY = rgb(0.6, 0.6, 0.6);
const DARK_TEXT = rgb(0.1, 0.1, 0.1);
const WHITE = rgb(1, 1, 1);

// ─── Data Types ─────────────────────────────────────────────────────────────

export interface OrderLine {
  category: string;
  spaCode: string;
  description: string;
  colour: string;
  requiredColour: string;
  uom: string;
  packQtySizes: string;
  unitPrice: number;
  quantity: number;
  lineNotes: string;
}

export interface OrderHeader {
  id: string;
  orderNumber: number | null;
  orderDate: string | null;
  requestedBy: string;
  email: string;
  locationRequired: string;
  jobNumber: string;
  dateRequired: string | null;
  status: string;
  notes: string;
}

export interface ComponentOrderPdfData {
  order: OrderHeader;
  lines: OrderLine[];
}

// ─── Helper: draw wrapped text ──────────────────────────────────────────────

function drawWrappedText(
  page: PDFPage,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  font: PDFFont,
  fontSize: number,
  lineHeight: number,
  color = DARK_TEXT,
): number {
  if (!text) return y;
  const safeText = sanitize(text);
  const words = safeText.split(" ");
  let line = "";
  let currentY = y;
  for (const word of words) {
    const testLine = line ? `${line} ${word}` : word;
    const testWidth = font.widthOfTextAtSize(testLine, fontSize);
    if (testWidth > maxWidth && line) {
      page.drawText(line, { x, y: currentY, size: fontSize, font, color });
      currentY -= lineHeight;
      line = word;
    } else {
      line = testLine;
    }
  }
  if (line) {
    page.drawText(line, { x, y: currentY, size: fontSize, font, color });
    currentY -= lineHeight;
  }
  return currentY;
}

// ─── Helper: truncate text to fit width ─────────────────────────────────────

// Sanitize text to only contain WinAnsi-encodable characters
function sanitize(text: string): string {
  if (!text) return "";
  return text
    .replace(/\u2014/g, "--")   // em dash
    .replace(/\u2013/g, "-")    // en dash
    .replace(/\u2018/g, "'")    // left single quote
    .replace(/\u2019/g, "'")    // right single quote
    .replace(/\u201c/g, '"')    // left double quote
    .replace(/\u201d/g, '"')    // right double quote
    .replace(/\u2026/g, "...")  // ellipsis
    .replace(/\u00d7/g, "x")    // multiplication sign
    .replace(/\u21b3/g, ">")    // ↳ arrow
    .replace(/[^\x00-\xff]/g, "?"); // replace any remaining non-WinAnsi chars
}

function truncateText(text: string, font: PDFFont, fontSize: number, maxWidth: number): string {
  if (!text) return "";
  const safe = sanitize(text);
  if (font.widthOfTextAtSize(safe, fontSize) <= maxWidth) return safe;
  let truncated = safe;
  while (truncated.length > 0 && font.widthOfTextAtSize(truncated + "...", fontSize) > maxWidth) {
    truncated = truncated.slice(0, -1);
  }
  return truncated + "...";
}

// ─── Helper: format currency ────────────────────────────────────────────────

function formatAUD(amount: number): string {
  return `$${amount.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// ─── Helper: format date ────────────────────────────────────────────────────

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "--";
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-AU", { day: "2-digit", month: "short", year: "numeric" });
  } catch {
    return dateStr;
  }
}

// ─── New Page Helper ────────────────────────────────────────────────────────

function addNewPage(
  doc: PDFDocument,
  bold: PDFFont,
  regular: PDFFont,
  orderNumber: number | null,
  pageNum: number,
): { page: PDFPage; y: number } {
  const page = doc.addPage([A4_WIDTH, A4_HEIGHT]);
  let y = A4_HEIGHT - MARGIN_TOP;

  // Continuation header
  page.drawText("COMPONENT ORDER (continued)", {
    x: MARGIN_LEFT,
    y,
    size: 9,
    font: bold,
    color: MID_GREY,
  });
  if (orderNumber) {
    const refText = `Order #${orderNumber}`;
    const refWidth = regular.widthOfTextAtSize(refText, 9);
    page.drawText(refText, {
      x: A4_WIDTH - MARGIN_RIGHT - refWidth,
      y,
      size: 9,
      font: regular,
      color: MID_GREY,
    });
  }
  y -= 8;
  page.drawLine({
    start: { x: MARGIN_LEFT, y },
    end: { x: A4_WIDTH - MARGIN_RIGHT, y },
    thickness: 0.5,
    color: LIGHT_GREY,
  });
  y -= 16;

  return { page, y };
}

// ─── Main PDF Generator ─────────────────────────────────────────────────────

export async function generateComponentOrderPdf(data: ComponentOrderPdfData): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const italic = await doc.embedFont(StandardFonts.HelveticaOblique);

  let page = doc.addPage([A4_WIDTH, A4_HEIGHT]);
  let y = A4_HEIGHT - MARGIN_TOP;
  let pageCount = 1;

  // ═══════════════════════════════════════════════════════════════════════════
  // HEADER — Brand bar
  // ═══════════════════════════════════════════════════════════════════════════

  // Dark navy header bar
  page.drawRectangle({
    x: 0,
    y: A4_HEIGHT - 70,
    width: A4_WIDTH,
    height: 70,
    color: BRAND_PRIMARY,
  });

  // Company name
  page.drawText("SPANLINE", {
    x: MARGIN_LEFT,
    y: A4_HEIGHT - 32,
    size: 22,
    font: bold,
    color: WHITE,
  });
  page.drawText("Component Order", {
    x: MARGIN_LEFT,
    y: A4_HEIGHT - 50,
    size: 11,
    font: regular,
    color: rgb(0.7, 0.8, 0.9),
  });

  // Order number on the right
  if (data.order.orderNumber) {
    const orderText = `#${data.order.orderNumber}`;
    const orderWidth = bold.widthOfTextAtSize(orderText, 20);
    page.drawText(orderText, {
      x: A4_WIDTH - MARGIN_RIGHT - orderWidth,
      y: A4_HEIGHT - 38,
      size: 20,
      font: bold,
      color: WHITE,
    });
  }

  // Status badge on the right
  const statusText = (data.order.status || "Submitted").toUpperCase();
  const statusWidth = bold.widthOfTextAtSize(statusText, 8);
  const badgeX = A4_WIDTH - MARGIN_RIGHT - statusWidth - 12;
  page.drawRectangle({
    x: badgeX,
    y: A4_HEIGHT - 58,
    width: statusWidth + 12,
    height: 14,
    color: BRAND_ACCENT,
    borderColor: rgb(0.3, 0.55, 0.8),
    borderWidth: 0.5,
  });
  page.drawText(statusText, {
    x: badgeX + 6,
    y: A4_HEIGHT - 54,
    size: 8,
    font: bold,
    color: WHITE,
  });

  y = A4_HEIGHT - 86;

  // ═══════════════════════════════════════════════════════════════════════════
  // ORDER DETAILS — Two-column layout
  // ═══════════════════════════════════════════════════════════════════════════

  const colLeft = MARGIN_LEFT;
  const colRight = MARGIN_LEFT + CONTENT_WIDTH / 2 + 10;
  const labelFontSize = 8;
  const valueFontSize = 9.5;
  const rowHeight = 16;

  // Left column
  page.drawText("ORDER DETAILS", { x: colLeft, y, size: 9, font: bold, color: BRAND_PRIMARY });
  y -= 4;
  page.drawLine({
    start: { x: colLeft, y },
    end: { x: colLeft + CONTENT_WIDTH / 2 - 10, y },
    thickness: 1,
    color: BRAND_ACCENT,
  });
  y -= 14;

  const leftFields: [string, string][] = [
    ["Order Date", formatDate(data.order.orderDate)],
    ["Requested By", sanitize(data.order.requestedBy) || "--"],
    ["Email", sanitize(data.order.email) || "--"],
    ["Date Required", formatDate(data.order.dateRequired)],
  ];

  let leftY = y;
  for (const [label, value] of leftFields) {
    page.drawText(label, { x: colLeft, y: leftY, size: labelFontSize, font: bold, color: MID_GREY });
    leftY -= 11;
    page.drawText(value, { x: colLeft, y: leftY, size: valueFontSize, font: regular, color: DARK_TEXT });
    leftY -= rowHeight;
  }

  // Right column
  let rightY = y + rowHeight + 14;
  page.drawText("JOB DETAILS", { x: colRight, y: rightY, size: 9, font: bold, color: BRAND_PRIMARY });
  rightY -= 4;
  page.drawLine({
    start: { x: colRight, y: rightY },
    end: { x: A4_WIDTH - MARGIN_RIGHT, y: rightY },
    thickness: 1,
    color: BRAND_ACCENT,
  });
  rightY -= 14;

  const rightFields: [string, string][] = [
    ["Job Number", sanitize(data.order.jobNumber) || "--"],
    ["Location", sanitize(data.order.locationRequired) || "--"],
    ["Status", sanitize(data.order.status) || "Submitted"],
  ];

  for (const [label, value] of rightFields) {
    page.drawText(label, { x: colRight, y: rightY, size: labelFontSize, font: bold, color: MID_GREY });
    rightY -= 11;
    page.drawText(value, { x: colRight, y: rightY, size: valueFontSize, font: regular, color: DARK_TEXT });
    rightY -= rowHeight;
  }

  y = Math.min(leftY, rightY) - 6;

  // Notes
  if (data.order.notes) {
    page.drawText("NOTES", { x: MARGIN_LEFT, y, size: 9, font: bold, color: BRAND_PRIMARY });
    y -= 4;
    page.drawLine({
      start: { x: MARGIN_LEFT, y },
      end: { x: A4_WIDTH - MARGIN_RIGHT, y },
      thickness: 1,
      color: BRAND_ACCENT,
    });
    y -= 14;
    y = drawWrappedText(page, sanitize(data.order.notes), MARGIN_LEFT, y, CONTENT_WIDTH, italic, 9, 13, MID_GREY);
    y -= 8;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // LINE ITEMS TABLE
  // ═══════════════════════════════════════════════════════════════════════════

  y -= 4;
  page.drawText("LINE ITEMS", { x: MARGIN_LEFT, y, size: 9, font: bold, color: BRAND_PRIMARY });
  y -= 4;
  page.drawLine({
    start: { x: MARGIN_LEFT, y },
    end: { x: A4_WIDTH - MARGIN_RIGHT, y },
    thickness: 1,
    color: BRAND_ACCENT,
  });
  y -= 14;

  // Table column definitions
  const cols = {
    num:   { x: MARGIN_LEFT,       w: 22 },
    code:  { x: MARGIN_LEFT + 22,  w: 68 },
    desc:  { x: MARGIN_LEFT + 90,  w: 155 },
    col:   { x: MARGIN_LEFT + 245, w: 65 },
    qty:   { x: MARGIN_LEFT + 310, w: 35 },
    uom:   { x: MARGIN_LEFT + 345, w: 35 },
    price: { x: MARGIN_LEFT + 380, w: 55 },
    total: { x: MARGIN_LEFT + 435, w: 80 },
  };

  const headerFontSize = 7.5;
  const cellFontSize = 8;
  const tableRowHeight = 14;

  // Table header
  function drawTableHeader(p: PDFPage, startY: number): number {
    // Header background
    p.drawRectangle({
      x: MARGIN_LEFT,
      y: startY - 2,
      width: CONTENT_WIDTH,
      height: 14,
      color: BRAND_PRIMARY,
    });
    const hy = startY + 2;
    p.drawText("#",           { x: cols.num.x + 2,   y: hy, size: headerFontSize, font: bold, color: WHITE });
    p.drawText("SPA Code",    { x: cols.code.x + 2,  y: hy, size: headerFontSize, font: bold, color: WHITE });
    p.drawText("Description", { x: cols.desc.x + 2,  y: hy, size: headerFontSize, font: bold, color: WHITE });
    p.drawText("Colour",      { x: cols.col.x + 2,   y: hy, size: headerFontSize, font: bold, color: WHITE });
    p.drawText("Qty",         { x: cols.qty.x + 2,   y: hy, size: headerFontSize, font: bold, color: WHITE });
    p.drawText("UOM",         { x: cols.uom.x + 2,   y: hy, size: headerFontSize, font: bold, color: WHITE });
    p.drawText("Unit Price",  { x: cols.price.x + 2,  y: hy, size: headerFontSize, font: bold, color: WHITE });
    // Right-align "Total"
    const totalLabel = "Total";
    const totalLabelW = bold.widthOfTextAtSize(totalLabel, headerFontSize);
    p.drawText(totalLabel, {
      x: cols.total.x + cols.total.w - totalLabelW - 2,
      y: hy,
      size: headerFontSize,
      font: bold,
      color: WHITE,
    });
    return startY - 16;
  }

  y = drawTableHeader(page, y);

  // Table rows
  let grandTotal = 0;
  let totalQty = 0;

  for (let i = 0; i < data.lines.length; i++) {
    const line = data.lines[i];
    const lineTotal = line.unitPrice * line.quantity;
    grandTotal += lineTotal;
    totalQty += line.quantity;

    // Check if we need a new page
    if (y < MARGIN_BOTTOM + 60) {
      pageCount++;
      const np = addNewPage(doc, bold, regular, data.order.orderNumber, pageCount);
      page = np.page;
      y = np.y;
      y = drawTableHeader(page, y);
    }

    // Alternating row background
    if (i % 2 === 0) {
      page.drawRectangle({
        x: MARGIN_LEFT,
        y: y - 2,
        width: CONTENT_WIDTH,
        height: tableRowHeight,
        color: rgb(0.96, 0.97, 0.98),
      });
    }

    const ry = y + 2;

    // # column
    page.drawText(`${i + 1}`, {
      x: cols.num.x + 2,
      y: ry,
      size: cellFontSize,
      font: regular,
      color: MID_GREY,
    });

    // SPA Code
    page.drawText(truncateText(line.spaCode, regular, cellFontSize, cols.code.w - 4), {
      x: cols.code.x + 2,
      y: ry,
      size: cellFontSize,
      font: bold,
      color: DARK_TEXT,
    });

    // Description
    page.drawText(truncateText(line.description, regular, cellFontSize, cols.desc.w - 4), {
      x: cols.desc.x + 2,
      y: ry,
      size: cellFontSize,
      font: regular,
      color: DARK_TEXT,
    });

    // Colour
    const colourDisplay = line.requiredColour || line.colour || "";
    page.drawText(truncateText(colourDisplay, regular, cellFontSize, cols.col.w - 4), {
      x: cols.col.x + 2,
      y: ry,
      size: cellFontSize,
      font: regular,
      color: DARK_TEXT,
    });

    // Quantity
    page.drawText(`${line.quantity}`, {
      x: cols.qty.x + 2,
      y: ry,
      size: cellFontSize,
      font: regular,
      color: DARK_TEXT,
    });

    // UOM
    page.drawText(truncateText(line.uom || "ea", regular, cellFontSize, cols.uom.w - 4), {
      x: cols.uom.x + 2,
      y: ry,
      size: cellFontSize,
      font: regular,
      color: DARK_TEXT,
    });

    // Unit Price
    page.drawText(formatAUD(line.unitPrice), {
      x: cols.price.x + 2,
      y: ry,
      size: cellFontSize,
      font: regular,
      color: DARK_TEXT,
    });

    // Line Total (right-aligned)
    const totalText = formatAUD(lineTotal);
    const totalWidth = bold.widthOfTextAtSize(totalText, cellFontSize);
    page.drawText(totalText, {
      x: cols.total.x + cols.total.w - totalWidth - 2,
      y: ry,
      size: cellFontSize,
      font: bold,
      color: DARK_TEXT,
    });

    y -= tableRowHeight;

    // Line notes (if present)
    if (line.lineNotes) {
      if (y < MARGIN_BOTTOM + 40) {
        pageCount++;
        const np = addNewPage(doc, bold, regular, data.order.orderNumber, pageCount);
        page = np.page;
        y = np.y;
      }
      y = drawWrappedText(
        page,
        `> ${sanitize(line.lineNotes)}`,
        cols.code.x + 2,
        y + 2,
        CONTENT_WIDTH - cols.code.x + MARGIN_LEFT - 4,
        italic,
        7,
        10,
        MID_GREY,
      );
      y -= 2;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TOTALS
  // ═══════════════════════════════════════════════════════════════════════════

  if (y < MARGIN_BOTTOM + 80) {
    pageCount++;
    const np = addNewPage(doc, bold, regular, data.order.orderNumber, pageCount);
    page = np.page;
    y = np.y;
  }

  y -= 4;
  // Separator line
  page.drawLine({
    start: { x: cols.price.x, y },
    end: { x: A4_WIDTH - MARGIN_RIGHT, y },
    thickness: 1.5,
    color: BRAND_PRIMARY,
  });
  y -= 16;

  // Summary row: total items & total qty
  page.drawText(`${data.lines.length} line item${data.lines.length !== 1 ? "s" : ""}`, {
    x: MARGIN_LEFT,
    y,
    size: 9,
    font: regular,
    color: MID_GREY,
  });

  page.drawText(`Total Qty: ${totalQty}`, {
    x: MARGIN_LEFT + 120,
    y,
    size: 9,
    font: regular,
    color: MID_GREY,
  });

  // Grand total (right-aligned)
  const grandTotalLabel = "TOTAL (ex GST):";
  const grandTotalValue = formatAUD(grandTotal);
  const gtLabelWidth = bold.widthOfTextAtSize(grandTotalLabel, 11);
  const gtValueWidth = bold.widthOfTextAtSize(grandTotalValue, 14);

  page.drawText(grandTotalLabel, {
    x: A4_WIDTH - MARGIN_RIGHT - gtValueWidth - gtLabelWidth - 10,
    y: y + 2,
    size: 11,
    font: bold,
    color: BRAND_PRIMARY,
  });
  page.drawText(grandTotalValue, {
    x: A4_WIDTH - MARGIN_RIGHT - gtValueWidth,
    y: y + 1,
    size: 14,
    font: bold,
    color: BRAND_PRIMARY,
  });

  y -= 14;

  // GST line
  const gstAmount = grandTotal * 0.1;
  const gstText = `GST: ${formatAUD(gstAmount)}`;
  const gstWidth = regular.widthOfTextAtSize(gstText, 9);
  page.drawText(gstText, {
    x: A4_WIDTH - MARGIN_RIGHT - gstWidth,
    y,
    size: 9,
    font: regular,
    color: MID_GREY,
  });
  y -= 12;

  const inclGstText = `Total (inc GST): ${formatAUD(grandTotal + gstAmount)}`;
  const inclGstWidth = bold.widthOfTextAtSize(inclGstText, 10);
  page.drawText(inclGstText, {
    x: A4_WIDTH - MARGIN_RIGHT - inclGstWidth,
    y,
    size: 10,
    font: bold,
    color: DARK_TEXT,
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // FOOTER — on every page
  // ═══════════════════════════════════════════════════════════════════════════

  const pages = doc.getPages();
  const totalPages = pages.length;
  for (let pi = 0; pi < totalPages; pi++) {
    const p = pages[pi];
    const footerY = MARGIN_BOTTOM - 20;

    // Separator
    p.drawLine({
      start: { x: MARGIN_LEFT, y: footerY + 12 },
      end: { x: A4_WIDTH - MARGIN_RIGHT, y: footerY + 12 },
      thickness: 0.5,
      color: LIGHT_GREY,
    });

    // Left: generated timestamp
    const now = new Date();
    const genText = `Generated ${now.toLocaleDateString("en-AU", { day: "2-digit", month: "short", year: "numeric" })} ${now.toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit" })}`;
    p.drawText(genText, {
      x: MARGIN_LEFT,
      y: footerY,
      size: 7,
      font: regular,
      color: MID_GREY,
    });

    // Centre: disclaimer
    const disclaimer = "For internal use only - prices subject to confirmation";
    const disclaimerWidth = italic.widthOfTextAtSize(disclaimer, 7);
    p.drawText(disclaimer, {
      x: (A4_WIDTH - disclaimerWidth) / 2,
      y: footerY,
      size: 7,
      font: italic,
      color: MID_GREY,
    });

    // Right: page number
    const pageText = `Page ${pi + 1} of ${totalPages}`;
    const pageWidth = regular.widthOfTextAtSize(pageText, 7);
    p.drawText(pageText, {
      x: A4_WIDTH - MARGIN_RIGHT - pageWidth,
      y: footerY,
      size: 7,
      font: regular,
      color: MID_GREY,
    });
  }

  // ─── Serialize ──────────────────────────────────────────────────────────
  const pdfBytes = await doc.save();
  return Buffer.from(pdfBytes);
}
