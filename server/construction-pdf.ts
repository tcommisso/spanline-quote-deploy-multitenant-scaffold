/**
 * Construction Document PDF Generation
 * Generates PDFs for Notice of Practical Completion and Contract Variations
 * using pdf-lib (already installed)
 */
import { PDFDocument, StandardFonts, rgb, PDFFont, PDFPage } from "pdf-lib";

// ─── Shared Constants ──────────────────────────────────────────────────────
const A4_WIDTH = 595.28;
const A4_HEIGHT = 841.89;
const MARGIN_LEFT = 50;
const MARGIN_RIGHT = 50;
const MARGIN_TOP = 50;
const MARGIN_BOTTOM = 50;
const CONTENT_WIDTH = A4_WIDTH - MARGIN_LEFT - MARGIN_RIGHT;

interface BuilderDetails {
  companyName?: string;
  tradingAs?: string;
  address?: string;
  abn?: string;
  licenceAct?: string;
  licenceNsw?: string;
  licence?: string; // combined licence string
  phone?: string;
  accountsEmail?: string;
  email?: string;
}

// ─── Helper: draw wrapped text ─────────────────────────────────────────────
function drawWrappedText(
  page: PDFPage,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  font: PDFFont,
  fontSize: number,
  lineHeight: number,
  color = rgb(0, 0, 0),
): number {
  const words = text.split(" ");
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

// ─── Helper: draw a label-value row ────────────────────────────────────────
function drawLabelValue(
  page: PDFPage,
  label: string,
  value: string,
  x: number,
  y: number,
  boldFont: PDFFont,
  regularFont: PDFFont,
  fontSize: number,
): number {
  page.drawText(label, { x, y, size: fontSize, font: boldFont, color: rgb(0, 0, 0) });
  const labelWidth = boldFont.widthOfTextAtSize(label, fontSize);
  page.drawText(value || "", { x: x + labelWidth + 8, y, size: fontSize, font: regularFont, color: rgb(0, 0, 0) });
  return y - (fontSize + 6);
}

// ═══════════════════════════════════════════════════════════════════════════
// NOTICE OF PRACTICAL COMPLETION PDF
// ═══════════════════════════════════════════════════════════════════════════
export interface NpcPdfData {
  date: string;
  jobNumber?: string;
  ownerName: string;
  ownerAddress?: string;
  builder: BuilderDetails;
  defects: { description: string; id: string }[];
  signatoryName: string;
  signatoryTitle?: string;
}

export async function generateNpcPdf(data: NpcPdfData): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const regular = await doc.embedFont(StandardFonts.Helvetica);

  let page = doc.addPage([A4_WIDTH, A4_HEIGHT]);
  let y = A4_HEIGHT - MARGIN_TOP;

  // ─── Date & Job No ───────────────────────────────────────────────────
  page.drawText(`Date: ${data.date}`, { x: MARGIN_LEFT, y, size: 10, font: regular });
  if (data.jobNumber) {
    const jnText = `Job No. ${data.jobNumber}`;
    const jnWidth = regular.widthOfTextAtSize(jnText, 10);
    page.drawText(jnText, { x: A4_WIDTH - MARGIN_RIGHT - jnWidth, y, size: 10, font: regular });
  }
  y -= 24;

  // ─── To the Owner(s) ────────────────────────────────────────────────
  page.drawText("To the Owner(s)", { x: MARGIN_LEFT, y, size: 11, font: bold });
  y -= 16;
  page.drawText(data.ownerName, { x: MARGIN_LEFT, y, size: 10, font: regular });
  y -= 14;
  if (data.ownerAddress) {
    y = drawWrappedText(page, data.ownerAddress, MARGIN_LEFT, y, CONTENT_WIDTH, regular, 10, 14);
  }
  y -= 10;

  // ─── From the Builder ───────────────────────────────────────────────
  page.drawText("From the Builder", { x: MARGIN_LEFT, y, size: 11, font: bold });
  y -= 16;

  const b = data.builder;
  const companyLine = b.tradingAs
    ? `${b.companyName} t/as ${b.tradingAs}`
    : b.companyName || "Commisso Group Pty Limited";
  page.drawText(companyLine, { x: MARGIN_LEFT + 10, y, size: 10, font: regular });
  y -= 14;

  if (b.address) { y = drawLabelValue(page, "Address:", b.address, MARGIN_LEFT, y, bold, regular, 9); }
  if (b.abn) { y = drawLabelValue(page, "ABN:", b.abn, MARGIN_LEFT, y, bold, regular, 9); }

  // Licence
  const licenceStr = b.licence || [
    b.licenceAct ? `ACT BLN: ${b.licenceAct}` : "",
    b.licenceNsw ? `NSW BLN: ${b.licenceNsw}` : "",
  ].filter(Boolean).join("   ");
  if (licenceStr) { y = drawLabelValue(page, "Builder's Licence No.:", licenceStr, MARGIN_LEFT, y, bold, regular, 9); }
  if (b.phone) { y = drawLabelValue(page, "Phone:", b.phone, MARGIN_LEFT, y, bold, regular, 9); }
  if (b.accountsEmail) { y = drawLabelValue(page, "Accounts Email:", b.accountsEmail, MARGIN_LEFT, y, bold, regular, 9); }
  if (b.email) { y = drawLabelValue(page, "Email:", b.email, MARGIN_LEFT, y, bold, regular, 9); }
  y -= 16;

  // ─── Title ──────────────────────────────────────────────────────────
  const title = "NOTICE OF PRACTICAL COMPLETION DETAILS";
  const titleWidth = bold.widthOfTextAtSize(title, 12);
  page.drawText(title, { x: (A4_WIDTH - titleWidth) / 2, y, size: 12, font: bold });
  y -= 20;

  // ─── Legal paragraphs ──────────────────────────────────────────────
  const para1 = "In accordance with the contract terms, we notify that the Works have reached Practical Completion and are fit for occupation or use by the Owner, despite the minor omissions and/or minor Defects listed below (if any) which do not prevent the Works from being reasonably fit for occupation or use.";
  y = drawWrappedText(page, para1, MARGIN_LEFT, y, CONTENT_WIDTH, regular, 9, 13);
  y -= 10;

  const para2 = "Within five (5) Business Days of receiving this Notice you must serve a written notice on the Builder identifying those things (if any) that you consider are required by this Contract to be done to reach Practical Completion. Note that if you do not serve the written notice within five (5) Business Days of receiving this Notice, the Works will be deemed to have reached Practical Completion.";
  y = drawWrappedText(page, para2, MARGIN_LEFT, y, CONTENT_WIDTH, regular, 9, 13);
  y -= 10;

  const para3 = "The Builder will within fourteen (14) Business Days of service of any such notice do all those things necessary to reach Practical Completion and serve on the Owner notice in writing upon completing them.";
  y = drawWrappedText(page, para3, MARGIN_LEFT, y, CONTENT_WIDTH, regular, 9, 13);
  y -= 10;

  const para4 = "In accordance with clause 23, the following minor omissions and/or minor Defects will be rectified by the Builder.";
  y = drawWrappedText(page, para4, MARGIN_LEFT, y, CONTENT_WIDTH, regular, 9, 13);
  y -= 16;

  // ─── Defects list ──────────────────────────────────────────────────
  page.drawText("List of minor omissions and/or minor defects", { x: MARGIN_LEFT, y, size: 10, font: bold });
  y -= 16;

  if (data.defects.length === 0) {
    page.drawText("Nil", { x: MARGIN_LEFT + 10, y, size: 9, font: regular, color: rgb(0.4, 0.4, 0.4) });
    y -= 14;
  } else {
    for (let i = 0; i < data.defects.length; i++) {
      if (y < MARGIN_BOTTOM + 80) {
        page = doc.addPage([A4_WIDTH, A4_HEIGHT]);
        y = A4_HEIGHT - MARGIN_TOP;
      }
      const bullet = `${i + 1}. ${data.defects[i].description}`;
      y = drawWrappedText(page, bullet, MARGIN_LEFT + 10, y, CONTENT_WIDTH - 20, regular, 9, 13);
      y -= 4;
    }
  }

  // ─── Signatory ─────────────────────────────────────────────────────
  if (y < MARGIN_BOTTOM + 80) {
    page = doc.addPage([A4_WIDTH, A4_HEIGHT]);
    y = A4_HEIGHT - MARGIN_TOP;
  }
  y -= 30;
  page.drawText("For and on behalf of the Builder", { x: MARGIN_LEFT, y, size: 10, font: bold });
  y -= 30;
  // Signature line
  page.drawLine({
    start: { x: MARGIN_LEFT, y },
    end: { x: MARGIN_LEFT + 200, y },
    thickness: 0.5,
    color: rgb(0, 0, 0),
  });
  y -= 16;
  page.drawText(data.signatoryName, { x: MARGIN_LEFT, y, size: 10, font: regular });
  y -= 14;
  if (data.signatoryTitle) {
    page.drawText(data.signatoryTitle, { x: MARGIN_LEFT, y, size: 9, font: regular, color: rgb(0.3, 0.3, 0.3) });
  }

  const pdfBytes = await doc.save();
  return Buffer.from(pdfBytes);
}

// ═══════════════════════════════════════════════════════════════════════════
// CONTRACT VARIATION PDF
// ═══════════════════════════════════════════════════════════════════════════
export interface VariationPdfData {
  ownerName: string;
  ownerAddress?: string;
  contractNumber?: string;
  builder: BuilderDetails;
  variationTitle: string;
  variationDescription?: string;
  variationDetails?: string;
  lineItems?: Array<{ description: string; cost: number }>;
  costImpact?: string;
}

export async function generateVariationPdf(data: VariationPdfData): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const regular = await doc.embedFont(StandardFonts.Helvetica);

  let page = doc.addPage([A4_WIDTH, A4_HEIGHT]);
  let y = A4_HEIGHT - MARGIN_TOP;

  // ─── PARTIES header ─────────────────────────────────────────────────
  const partiesTitle = "PARTIES";
  const ptWidth = bold.widthOfTextAtSize(partiesTitle, 14);
  page.drawText(partiesTitle, { x: (A4_WIDTH - ptWidth) / 2, y, size: 14, font: bold });
  y -= 24;

  // ─── To the Owner(s) ────────────────────────────────────────────────
  page.drawText("To the Owner(s)", { x: MARGIN_LEFT, y, size: 11, font: bold });
  y -= 16;
  page.drawText(data.ownerName || "", { x: MARGIN_LEFT, y, size: 10, font: regular });
  y -= 16;

  if (data.contractNumber) {
    y = drawLabelValue(page, "Contract Number:", data.contractNumber, MARGIN_LEFT, y, bold, regular, 10);
  }

  if (data.ownerAddress) {
    y = drawLabelValue(page, "Address:", data.ownerAddress, MARGIN_LEFT, y, bold, regular, 10);
  }
  y -= 10;

  // ─── From the Builder ───────────────────────────────────────────────
  page.drawText("From the Builder", { x: MARGIN_LEFT, y, size: 11, font: bold });
  y -= 16;

  const b = data.builder;
  const companyLine = b.companyName || "Commisso Group Pty Limited";
  page.drawText(companyLine, { x: MARGIN_LEFT + 10, y, size: 10, font: regular });
  y -= 14;

  if (b.address) { y = drawLabelValue(page, "Address:", b.address, MARGIN_LEFT, y, bold, regular, 9); }
  if (b.abn) { y = drawLabelValue(page, "ABN:", b.abn, MARGIN_LEFT, y, bold, regular, 9); }

  const licenceStr = b.licence || [
    b.licenceNsw ? `NSW ${b.licenceNsw}` : "",
    b.licenceAct ? `ACT ${b.licenceAct}` : "",
  ].filter(Boolean).join(" & ");
  if (licenceStr) { y = drawLabelValue(page, "Builder's Licence No.:", licenceStr, MARGIN_LEFT, y, bold, regular, 9); }
  if (b.phone) { y = drawLabelValue(page, "Phone:", b.phone, MARGIN_LEFT, y, bold, regular, 9); }
  if (b.accountsEmail) { y = drawLabelValue(page, "Accounts Email:", b.accountsEmail, MARGIN_LEFT, y, bold, regular, 9); }
  if (b.email) { y = drawLabelValue(page, "Email:", b.email, MARGIN_LEFT, y, bold, regular, 9); }
  y -= 20;

  // ─── Variation clause ───────────────────────────────────────────────
  page.drawText("In accordance with clause 21 we submit a variation.", { x: MARGIN_LEFT, y, size: 10, font: regular });
  y -= 24;

  // ─── Variation Title ────────────────────────────────────────────────
  if (data.variationTitle) {
    page.drawText("Variation:", { x: MARGIN_LEFT, y, size: 11, font: bold });
    y -= 16;
    y = drawWrappedText(page, data.variationTitle, MARGIN_LEFT + 10, y, CONTENT_WIDTH - 20, bold, 10, 14);
    y -= 10;
  }

  // ─── Description ────────────────────────────────────────────────────
  if (data.variationDescription) {
    page.drawText("Description:", { x: MARGIN_LEFT, y, size: 10, font: bold });
    y -= 14;
    y = drawWrappedText(page, data.variationDescription, MARGIN_LEFT + 10, y, CONTENT_WIDTH - 20, regular, 9, 13);
    y -= 10;
  }

  // ─── Variation Details ──────────────────────────────────────────────
  if (data.variationDetails) {
    page.drawText("Details:", { x: MARGIN_LEFT, y, size: 10, font: bold });
    y -= 14;
    // Split by newlines for multi-line details
    const lines = data.variationDetails.split("\n");
    for (const line of lines) {
      if (y < MARGIN_BOTTOM + 80) {
        page = doc.addPage([A4_WIDTH, A4_HEIGHT]);
        y = A4_HEIGHT - MARGIN_TOP;
      }
      if (line.trim()) {
        y = drawWrappedText(page, line, MARGIN_LEFT + 10, y, CONTENT_WIDTH - 20, regular, 9, 13);
      } else {
        y -= 8;
      }
    }
    y -= 10;
  }

  // ─── Line Items Table ───────────────────────────────────────────────
  if (data.lineItems && data.lineItems.length > 0) {
    y -= 6;
    page.drawText("Variation Items", { x: MARGIN_LEFT, y, size: 11, font: bold });
    y -= 18;

    // Table header
    const colDescX = MARGIN_LEFT;
    const colCostX = MARGIN_LEFT + CONTENT_WIDTH - 80;
    const colNumX = MARGIN_LEFT;
    const numWidth = 25;

    // Header row
    page.drawText("#", { x: colNumX, y, size: 9, font: bold, color: rgb(0.3, 0.3, 0.3) });
    page.drawText("Description", { x: colNumX + numWidth, y, size: 9, font: bold, color: rgb(0.3, 0.3, 0.3) });
    page.drawText("Cost ($)", { x: colCostX, y, size: 9, font: bold, color: rgb(0.3, 0.3, 0.3) });
    y -= 4;
    page.drawLine({ start: { x: MARGIN_LEFT, y }, end: { x: MARGIN_LEFT + CONTENT_WIDTH, y }, thickness: 0.5, color: rgb(0.6, 0.6, 0.6) });
    y -= 12;

    // Item rows
    for (let i = 0; i < data.lineItems.length; i++) {
      if (y < MARGIN_BOTTOM + 100) {
        page = doc.addPage([A4_WIDTH, A4_HEIGHT]);
        y = A4_HEIGHT - MARGIN_TOP;
      }
      const item = data.lineItems[i];
      page.drawText(`${i + 1}.`, { x: colNumX, y, size: 9, font: regular });
      // Wrap description if needed
      const descMaxW = colCostX - colNumX - numWidth - 10;
      const descWords = item.description.split(" ");
      let descLine = "";
      let descY = y;
      for (const word of descWords) {
        const test = descLine ? `${descLine} ${word}` : word;
        if (regular.widthOfTextAtSize(test, 9) > descMaxW && descLine) {
          page.drawText(descLine, { x: colNumX + numWidth, y: descY, size: 9, font: regular });
          descY -= 12;
          descLine = word;
        } else {
          descLine = test;
        }
      }
      if (descLine) {
        page.drawText(descLine, { x: colNumX + numWidth, y: descY, size: 9, font: regular });
      }
      // Cost aligned right
      const costStr = `$${(item.cost || 0).toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      const costW = regular.widthOfTextAtSize(costStr, 9);
      page.drawText(costStr, { x: MARGIN_LEFT + CONTENT_WIDTH - costW, y, size: 9, font: regular });
      y = Math.min(y, descY) - 12;
    }

    // Total row
    page.drawLine({ start: { x: colCostX - 10, y: y + 6 }, end: { x: MARGIN_LEFT + CONTENT_WIDTH, y: y + 6 }, thickness: 0.5, color: rgb(0.4, 0.4, 0.4) });
    const total = data.lineItems.reduce((s, i) => s + (i.cost || 0), 0);
    const totalStr = `$${total.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    page.drawText("Total:", { x: colCostX - 40, y, size: 10, font: bold });
    const totalW = bold.widthOfTextAtSize(totalStr, 10);
    page.drawText(totalStr, { x: MARGIN_LEFT + CONTENT_WIDTH - totalW, y, size: 10, font: bold });
    y -= 20;
  } else if (data.costImpact && data.costImpact !== "0") {
    // Fallback: single cost impact for legacy variations
    y -= 6;
    page.drawText(`Cost Impact: $${data.costImpact}`, { x: MARGIN_LEFT, y, size: 11, font: bold });
    y -= 20;
  }

  // ─── Signature area (left blank for SignWell) ───────────────────────
  if (y < MARGIN_BOTTOM + 120) {
    page = doc.addPage([A4_WIDTH, A4_HEIGHT]);
    y = A4_HEIGHT - MARGIN_TOP;
  }
  y -= 30;

  // Owner signature block
  page.drawText("Owner Signature:", { x: MARGIN_LEFT, y, size: 10, font: bold });
  y -= 30;
  page.drawLine({
    start: { x: MARGIN_LEFT, y },
    end: { x: MARGIN_LEFT + 200, y },
    thickness: 0.5,
    color: rgb(0, 0, 0),
  });
  y -= 14;
  page.drawText("Signature", { x: MARGIN_LEFT, y, size: 8, font: regular, color: rgb(0.5, 0.5, 0.5) });

  // Date line next to signature
  page.drawLine({
    start: { x: MARGIN_LEFT + 280, y: y + 14 },
    end: { x: MARGIN_LEFT + 420, y: y + 14 },
    thickness: 0.5,
    color: rgb(0, 0, 0),
  });
  page.drawText("Date", { x: MARGIN_LEFT + 280, y, size: 8, font: regular, color: rgb(0.5, 0.5, 0.5) });

  y -= 30;

  // Builder signature block
  page.drawText("Builder Signature:", { x: MARGIN_LEFT, y, size: 10, font: bold });
  y -= 30;
  page.drawLine({
    start: { x: MARGIN_LEFT, y },
    end: { x: MARGIN_LEFT + 200, y },
    thickness: 0.5,
    color: rgb(0, 0, 0),
  });
  y -= 14;
  page.drawText("Signature", { x: MARGIN_LEFT, y, size: 8, font: regular, color: rgb(0.5, 0.5, 0.5) });

  page.drawLine({
    start: { x: MARGIN_LEFT + 280, y: y + 14 },
    end: { x: MARGIN_LEFT + 420, y: y + 14 },
    thickness: 0.5,
    color: rgb(0, 0, 0),
  });
  page.drawText("Date", { x: MARGIN_LEFT + 280, y, size: 8, font: regular, color: rgb(0.5, 0.5, 0.5) });

  const pdfBytes = await doc.save();
  return Buffer.from(pdfBytes);
}


// ═══════════════════════════════════════════════════════════════════════════
// WORK ORDER PDF
// ═══════════════════════════════════════════════════════════════════════════
export interface WorkOrderPdfData {
  orderNumber: string;
  tradeType: string;
  description?: string;
  scope?: string;
  assignedTo?: string;
  assignedPhone?: string;
  assignedEmail?: string;
  priority: string;
  status: string;
  scheduledDate?: string;
  estimatedCost?: string;
  lineItems?: Array<{ task: string; details?: string }>;
  notes?: string;
  builder: BuilderDetails;
  jobNumber?: string;
  clientName?: string;
  siteAddress?: string;
  createdByName?: string;
  createdAt?: string;
}

export async function generateWorkOrderPdf(data: WorkOrderPdfData): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const regular = await doc.embedFont(StandardFonts.Helvetica);

  let page = doc.addPage([A4_WIDTH, A4_HEIGHT]);
  let y = A4_HEIGHT - MARGIN_TOP;

  // ─── Company Header ─────────────────────────────────────────────────
  const b = data.builder;
  const companyLine = b.tradingAs
    ? `${b.companyName || ""} t/as ${b.tradingAs}`
    : b.companyName || "Commisso Group Pty Limited";
  page.drawText(companyLine, { x: MARGIN_LEFT, y, size: 12, font: bold });
  y -= 14;
  if (b.address) {
    page.drawText(b.address, { x: MARGIN_LEFT, y, size: 8, font: regular, color: rgb(0.3, 0.3, 0.3) });
    y -= 11;
  }
  const contactLine = [b.phone, b.email].filter(Boolean).join("  |  ");
  if (contactLine) {
    page.drawText(contactLine, { x: MARGIN_LEFT, y, size: 8, font: regular, color: rgb(0.3, 0.3, 0.3) });
    y -= 11;
  }
  if (b.abn) {
    page.drawText(`ABN: ${b.abn}`, { x: MARGIN_LEFT, y, size: 8, font: regular, color: rgb(0.3, 0.3, 0.3) });
    y -= 11;
  }
  const licenceStr = b.licence || [
    b.licenceAct ? `ACT: ${b.licenceAct}` : "",
    b.licenceNsw ? `NSW: ${b.licenceNsw}` : "",
  ].filter(Boolean).join("  ");
  if (licenceStr) {
    page.drawText(`Licence: ${licenceStr}`, { x: MARGIN_LEFT, y, size: 8, font: regular, color: rgb(0.3, 0.3, 0.3) });
    y -= 11;
  }

  // Separator line
  y -= 6;
  page.drawLine({ start: { x: MARGIN_LEFT, y }, end: { x: A4_WIDTH - MARGIN_RIGHT, y }, thickness: 1, color: rgb(0.2, 0.2, 0.2) });
  y -= 20;

  // ─── Title ──────────────────────────────────────────────────────────
  const title = "WORK ORDER";
  const titleWidth = bold.widthOfTextAtSize(title, 16);
  page.drawText(title, { x: (A4_WIDTH - titleWidth) / 2, y, size: 16, font: bold });
  y -= 28;

  // ─── Work Order Details ─────────────────────────────────────────────
  y = drawLabelValue(page, "Order No:", data.orderNumber, MARGIN_LEFT, y, bold, regular, 10);
  y = drawLabelValue(page, "Trade Type:", data.tradeType, MARGIN_LEFT, y, bold, regular, 10);
  y = drawLabelValue(page, "Priority:", data.priority.charAt(0).toUpperCase() + data.priority.slice(1), MARGIN_LEFT, y, bold, regular, 10);
  y = drawLabelValue(page, "Status:", data.status.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()), MARGIN_LEFT, y, bold, regular, 10);
  if (data.scheduledDate) {
    y = drawLabelValue(page, "Scheduled Date:", data.scheduledDate, MARGIN_LEFT, y, bold, regular, 10);
  }
  if (data.estimatedCost) {
    y = drawLabelValue(page, "Estimated Cost:", `$${parseFloat(data.estimatedCost).toLocaleString("en-AU", { minimumFractionDigits: 2 })}`, MARGIN_LEFT, y, bold, regular, 10);
  }
  y -= 10;

  // ─── Job Details ────────────────────────────────────────────────────
  if (data.jobNumber || data.clientName || data.siteAddress) {
    page.drawText("Job Details", { x: MARGIN_LEFT, y, size: 11, font: bold });
    y -= 16;
    if (data.jobNumber) y = drawLabelValue(page, "Job No:", data.jobNumber, MARGIN_LEFT, y, bold, regular, 10);
    if (data.clientName) y = drawLabelValue(page, "Client:", data.clientName, MARGIN_LEFT, y, bold, regular, 10);
    if (data.siteAddress) {
      page.drawText("Site Address:", { x: MARGIN_LEFT, y, size: 10, font: bold });
      y -= 14;
      y = drawWrappedText(page, data.siteAddress, MARGIN_LEFT + 10, y, CONTENT_WIDTH - 20, regular, 9, 13);
    }
    y -= 10;
  }

  // ─── Assigned Trade ─────────────────────────────────────────────────
  if (data.assignedTo) {
    page.drawText("Assigned To", { x: MARGIN_LEFT, y, size: 11, font: bold });
    y -= 16;
    y = drawLabelValue(page, "Name:", data.assignedTo, MARGIN_LEFT, y, bold, regular, 10);
    if (data.assignedPhone) y = drawLabelValue(page, "Phone:", data.assignedPhone, MARGIN_LEFT, y, bold, regular, 10);
    if (data.assignedEmail) y = drawLabelValue(page, "Email:", data.assignedEmail, MARGIN_LEFT, y, bold, regular, 10);
    y -= 10;
  }

  // ─── Scope of Works ─────────────────────────────────────────────────
  if (data.scope) {
    page.drawText("Scope of Works", { x: MARGIN_LEFT, y, size: 11, font: bold });
    y -= 16;
    const scopeLines = data.scope.split("\n");
    for (const line of scopeLines) {
      if (y < MARGIN_BOTTOM + 80) {
        page = doc.addPage([A4_WIDTH, A4_HEIGHT]);
        y = A4_HEIGHT - MARGIN_TOP;
      }
      if (line.trim()) {
        y = drawWrappedText(page, line, MARGIN_LEFT + 10, y, CONTENT_WIDTH - 20, regular, 9, 13);
      } else {
        y -= 8;
      }
    }
    y -= 10;
  }

  // ─── Description ────────────────────────────────────────────────────
  if (data.description) {
    page.drawText("Description", { x: MARGIN_LEFT, y, size: 11, font: bold });
    y -= 16;
    y = drawWrappedText(page, data.description, MARGIN_LEFT + 10, y, CONTENT_WIDTH - 20, regular, 9, 13);
    y -= 10;
  }

  // ─── Line Items Table ───────────────────────────────────────────────
  if (data.lineItems && data.lineItems.length > 0) {
    if (y < MARGIN_BOTTOM + 100) {
      page = doc.addPage([A4_WIDTH, A4_HEIGHT]);
      y = A4_HEIGHT - MARGIN_TOP;
    }
    page.drawText("Tasks / Line Items", { x: MARGIN_LEFT, y, size: 11, font: bold });
    y -= 18;

    // Table header
    const colNumX = MARGIN_LEFT;
    const numWidth = 25;
    const colTaskX = colNumX + numWidth;
    const colDetailsX = MARGIN_LEFT + 200;

    page.drawText("#", { x: colNumX, y, size: 9, font: bold, color: rgb(0.3, 0.3, 0.3) });
    page.drawText("Task", { x: colTaskX, y, size: 9, font: bold, color: rgb(0.3, 0.3, 0.3) });
    page.drawText("Details", { x: colDetailsX, y, size: 9, font: bold, color: rgb(0.3, 0.3, 0.3) });
    y -= 4;
    page.drawLine({ start: { x: MARGIN_LEFT, y }, end: { x: A4_WIDTH - MARGIN_RIGHT, y }, thickness: 0.5, color: rgb(0.6, 0.6, 0.6) });
    y -= 12;

    for (let i = 0; i < data.lineItems.length; i++) {
      if (y < MARGIN_BOTTOM + 60) {
        page = doc.addPage([A4_WIDTH, A4_HEIGHT]);
        y = A4_HEIGHT - MARGIN_TOP;
      }
      const item = data.lineItems[i];
      page.drawText(`${i + 1}.`, { x: colNumX, y, size: 9, font: regular });

      // Task name (bold)
      const taskMaxW = colDetailsX - colTaskX - 10;
      const taskY = drawWrappedText(page, item.task || "", colTaskX, y, taskMaxW, bold, 9, 12);

      // Details
      let detailsY = y;
      if (item.details) {
        const detailsMaxW = A4_WIDTH - MARGIN_RIGHT - colDetailsX;
        detailsY = drawWrappedText(page, item.details, colDetailsX, y, detailsMaxW, regular, 9, 12);
      }

      y = Math.min(taskY, detailsY) - 8;
    }
    y -= 10;
  }

  // ─── Notes ──────────────────────────────────────────────────────────
  if (data.notes) {
    if (y < MARGIN_BOTTOM + 80) {
      page = doc.addPage([A4_WIDTH, A4_HEIGHT]);
      y = A4_HEIGHT - MARGIN_TOP;
    }
    page.drawText("Notes", { x: MARGIN_LEFT, y, size: 11, font: bold });
    y -= 16;
    y = drawWrappedText(page, data.notes, MARGIN_LEFT + 10, y, CONTENT_WIDTH - 20, regular, 9, 13);
    y -= 10;
  }

  // ─── Signature Block ────────────────────────────────────────────────
  if (y < MARGIN_BOTTOM + 120) {
    page = doc.addPage([A4_WIDTH, A4_HEIGHT]);
    y = A4_HEIGHT - MARGIN_TOP;
  }
  y -= 30;

  // Issued By
  page.drawText("Issued By:", { x: MARGIN_LEFT, y, size: 10, font: bold });
  y -= 16;
  page.drawText(data.createdByName || "Authorised Representative", { x: MARGIN_LEFT, y, size: 10, font: regular });
  if (data.createdAt) {
    y -= 14;
    page.drawText(`Date: ${data.createdAt}`, { x: MARGIN_LEFT, y, size: 9, font: regular, color: rgb(0.4, 0.4, 0.4) });
  }
  y -= 30;

  // Trade Acknowledgment
  page.drawText("Trade Acknowledgment:", { x: MARGIN_LEFT, y, size: 10, font: bold });
  y -= 30;
  page.drawLine({ start: { x: MARGIN_LEFT, y }, end: { x: MARGIN_LEFT + 200, y }, thickness: 0.5, color: rgb(0, 0, 0) });
  y -= 14;
  page.drawText("Signature", { x: MARGIN_LEFT, y, size: 8, font: regular, color: rgb(0.5, 0.5, 0.5) });

  page.drawLine({ start: { x: MARGIN_LEFT + 280, y: y + 14 }, end: { x: MARGIN_LEFT + 420, y: y + 14 }, thickness: 0.5, color: rgb(0, 0, 0) });
  page.drawText("Date", { x: MARGIN_LEFT + 280, y, size: 8, font: regular, color: rgb(0.5, 0.5, 0.5) });

  // ─── Footer ─────────────────────────────────────────────────────────
  const footerY = MARGIN_BOTTOM - 10;
  const footerText = `${companyLine} — Work Order ${data.orderNumber}`;
  const footerWidth = regular.widthOfTextAtSize(footerText, 7);
  page.drawText(footerText, { x: (A4_WIDTH - footerWidth) / 2, y: footerY, size: 7, font: regular, color: rgb(0.5, 0.5, 0.5) });

  const pdfBytes = await doc.save();
  return Buffer.from(pdfBytes);
}


// ═══════════════════════════════════════════════════════════════════════════
// EXTENSION OF TIME (EOT) SUMMARY REPORT PDF
// ═══════════════════════════════════════════════════════════════════════════

export interface EotSummaryPdfData {
  job: {
    id: number;
    clientName: string;
    siteAddress: string;
    quoteNumber?: string;
  };
  eotRecords: Array<{
    daysClaimed: number;
    cumulativeDays: number;
    reason: string;
    date: string;
    rainDayDate: string | null;
  }>;
  totalDays: number;
  generatedBy: string;
  generatedDate: string;
}

export async function generateEotSummaryPdf(data: EotSummaryPdfData): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const regular = await doc.embedFont(StandardFonts.Helvetica);

  let page = doc.addPage([A4_WIDTH, A4_HEIGHT]);
  let y = A4_HEIGHT - MARGIN_TOP;

  // ─── Header ─────────────────────────────────────────────────────────────
  const title = "EXTENSION OF TIME — SUMMARY REPORT";
  const titleWidth = bold.widthOfTextAtSize(title, 14);
  page.drawText(title, { x: (A4_WIDTH - titleWidth) / 2, y, size: 14, font: bold });
  y -= 30;

  // ─── Job Details ────────────────────────────────────────────────────────
  page.drawText("Project Details", { x: MARGIN_LEFT, y, size: 11, font: bold });
  y -= 18;

  y = drawLabelValue(page, "Client:", data.job.clientName, MARGIN_LEFT, y, bold, regular, 10);
  y = drawLabelValue(page, "Site Address:", data.job.siteAddress, MARGIN_LEFT, y, bold, regular, 10);
  if (data.job.quoteNumber) {
    y = drawLabelValue(page, "Quote/Job No.:", data.job.quoteNumber, MARGIN_LEFT, y, bold, regular, 10);
  }
  y = drawLabelValue(page, "Report Generated:", data.generatedDate, MARGIN_LEFT, y, bold, regular, 10);
  y = drawLabelValue(page, "Generated By:", data.generatedBy, MARGIN_LEFT, y, bold, regular, 10);
  y -= 20;

  // ─── Summary ────────────────────────────────────────────────────────────
  page.drawText("Summary", { x: MARGIN_LEFT, y, size: 11, font: bold });
  y -= 18;

  const summaryText = `Total Extension of Time Claimed: ${data.totalDays} business day${data.totalDays !== 1 ? "s" : ""} across ${data.eotRecords.length} record${data.eotRecords.length !== 1 ? "s" : ""}.`;
  y = drawWrappedText(page, summaryText, MARGIN_LEFT, y, CONTENT_WIDTH, regular, 10, 14);
  y -= 20;

  // ─── EOT Records Table ──────────────────────────────────────────────────
  page.drawText("Extension of Time Records", { x: MARGIN_LEFT, y, size: 11, font: bold });
  y -= 20;

  // Table header
  const colX = [MARGIN_LEFT, MARGIN_LEFT + 40, MARGIN_LEFT + 120, MARGIN_LEFT + 200, MARGIN_LEFT + 320, MARGIN_LEFT + 400];
  const headers = ["#", "Date Issued", "Rain Day", "Reason", "Days", "Cumulative"];
  const colWidths = [30, 75, 75, 115, 55, 70];

  // Draw header row
  page.drawRectangle({
    x: MARGIN_LEFT - 4,
    y: y - 4,
    width: CONTENT_WIDTH + 8,
    height: 16,
    color: rgb(0.9, 0.9, 0.9),
  });
  for (let i = 0; i < headers.length; i++) {
    page.drawText(headers[i], { x: colX[i], y, size: 8, font: bold });
  }
  y -= 18;

  // Draw data rows
  for (let i = 0; i < data.eotRecords.length; i++) {
    if (y < MARGIN_BOTTOM + 60) {
      page = doc.addPage([A4_WIDTH, A4_HEIGHT]);
      y = A4_HEIGHT - MARGIN_TOP;
      // Re-draw header on new page
      page.drawRectangle({
        x: MARGIN_LEFT - 4,
        y: y - 4,
        width: CONTENT_WIDTH + 8,
        height: 16,
        color: rgb(0.9, 0.9, 0.9),
      });
      for (let j = 0; j < headers.length; j++) {
        page.drawText(headers[j], { x: colX[j], y, size: 8, font: bold });
      }
      y -= 18;
    }

    const record = data.eotRecords[i];
    // Alternate row background
    if (i % 2 === 0) {
      page.drawRectangle({
        x: MARGIN_LEFT - 4,
        y: y - 4,
        width: CONTENT_WIDTH + 8,
        height: 14,
        color: rgb(0.97, 0.97, 0.97),
      });
    }

    page.drawText(String(i + 1), { x: colX[0], y, size: 8, font: regular });
    page.drawText(record.date || "—", { x: colX[1], y, size: 8, font: regular });
    page.drawText(record.rainDayDate || "—", { x: colX[2], y, size: 8, font: regular });

    // Truncate reason if too long
    const maxReasonWidth = colWidths[3] - 5;
    let reasonText = record.reason || "—";
    while (regular.widthOfTextAtSize(reasonText, 8) > maxReasonWidth && reasonText.length > 3) {
      reasonText = reasonText.slice(0, -4) + "...";
    }
    page.drawText(reasonText, { x: colX[3], y, size: 8, font: regular });

    page.drawText(String(record.daysClaimed), { x: colX[4], y, size: 8, font: regular });
    page.drawText(String(record.cumulativeDays), { x: colX[5], y, size: 8, font: bold });

    y -= 16;
  }

  // ─── Total row ──────────────────────────────────────────────────────────
  y -= 6;
  page.drawLine({
    start: { x: MARGIN_LEFT - 4, y: y + 10 },
    end: { x: MARGIN_LEFT + CONTENT_WIDTH + 4, y: y + 10 },
    thickness: 0.5,
    color: rgb(0, 0, 0),
  });
  page.drawText("TOTAL EXTENSION:", { x: colX[3], y, size: 9, font: bold });
  page.drawText(`${data.totalDays} day${data.totalDays !== 1 ? "s" : ""}`, { x: colX[4], y, size: 9, font: bold });
  y -= 30;

  // ─── Legal Notice ───────────────────────────────────────────────────────
  if (y < MARGIN_BOTTOM + 100) {
    page = doc.addPage([A4_WIDTH, A4_HEIGHT]);
    y = A4_HEIGHT - MARGIN_TOP;
  }

  page.drawText("Notice", { x: MARGIN_LEFT, y, size: 10, font: bold });
  y -= 16;

  const legalText = "This Extension of Time report is issued in accordance with the contract terms. Each extension claimed is due to inclement weather conditions that prevented work from proceeding safely and/or effectively on the dates specified. The cumulative extension adjusts the contractual completion date accordingly.";
  y = drawWrappedText(page, legalText, MARGIN_LEFT, y, CONTENT_WIDTH, regular, 9, 13);
  y -= 30;

  // ─── Signatory ──────────────────────────────────────────────────────────
  page.drawText("For and on behalf of the Builder", { x: MARGIN_LEFT, y, size: 10, font: bold });
  y -= 30;
  page.drawLine({
    start: { x: MARGIN_LEFT, y },
    end: { x: MARGIN_LEFT + 200, y },
    thickness: 0.5,
    color: rgb(0, 0, 0),
  });
  y -= 16;
  page.drawText(data.generatedBy, { x: MARGIN_LEFT, y, size: 10, font: regular });
  y -= 14;
  page.drawText("Construction Manager", { x: MARGIN_LEFT, y, size: 9, font: regular, color: rgb(0.3, 0.3, 0.3) });
  y -= 14;
  page.drawText(data.generatedDate, { x: MARGIN_LEFT, y, size: 9, font: regular, color: rgb(0.3, 0.3, 0.3) });

  // ─── Footer ─────────────────────────────────────────────────────────────
  const pages = doc.getPages();
  for (let i = 0; i < pages.length; i++) {
    const p = pages[i];
    const footerText = `Page ${i + 1} of ${pages.length} — EOT Summary Report — ${data.job.clientName}`;
    const footerWidth = regular.widthOfTextAtSize(footerText, 7);
    p.drawText(footerText, { x: (A4_WIDTH - footerWidth) / 2, y: 30, size: 7, font: regular, color: rgb(0.5, 0.5, 0.5) });
  }

  const pdfBytes = await doc.save();
  return Buffer.from(pdfBytes);
}
