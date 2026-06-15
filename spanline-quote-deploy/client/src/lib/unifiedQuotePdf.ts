/**
 * Unified Compiled Quote PDF Generator
 * Compiles all quote types (OPQ, Deck, Eclipse) for a single client into one branded document.
 * Features:
 *   - Branded cover page with company details and logo
 *   - OPQ section (components, adjustments, totals)
 *   - Deck section (materials, labour, totals)
 *   - Eclipse section (units, material breakdown, totals)
 *   - Site plan drawing (embedded image from canvas)
 *   - Editable form fields (via pdf-lib post-processing)
 *   - Terms, warranty, and signature section
 *
 * Eclipse-style engine: uses jsPDF + autoTable for layout, then pdf-lib for form fields.
 */

import jsPDF from "jspdf";
import { applyInternalUseWatermark } from "./pdfWatermark";
import autoTable from "jspdf-autotable";
import { PDFDocument, PDFTextField, StandardFonts, rgb } from "pdf-lib";
import {
  loadCompanyDetails,
  loadCustomLogo,
  loadProposalText,
  type CustomLogo,
  type CompanyDetails,
  type ProposalText,
} from "./proposalStore";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ClientInfo {
  name: string;
  phone?: string;
  email?: string;
  address?: string;
  company?: string;
}

export interface OPQSection {
  quoteNumber: string;
  descriptionOfWork?: string;
  components: { name: string; amount: number }[];
  adjustments: { name: string; amount: number }[];
  totalExGst: number;
  totalIncGst: number;
  gst: number;
}

export interface DeckSection {
  quoteNumber: string;
  dimensions?: string; // e.g. "6.0m × 4.0m"
  frameType?: string;
  deckingProduct?: string;
  materialCost: number;
  labourCost: number;
  totalExGst: number;
  totalIncGst: number;
  gst: number;
}

export interface EclipseSection {
  quoteNumber: string;
  units: { name: string; sqm: number; sellPrice: number }[];
  additionalCosts: { name: string; amount: number }[];
  totalSqm: number;
  totalExGst: number;
  totalIncGst: number;
  gst: number;
}

export interface UnifiedQuoteData {
  client: ClientInfo;
  opq?: OPQSection;
  deck?: DeckSection;
  eclipse?: EclipseSection;
  sitePlanImage?: string; // base64 data URL from canvas
  grandTotalExGst: number;
  grandTotalIncGst: number;
  grandTotalGst: number;
}

export type PdfOutputMode = "download" | "preview" | "base64" | "blob";

// ─── Main Export ──────────────────────────────────────────────────────────────

export async function generateUnifiedQuotePDF(
  data: UnifiedQuoteData,
  mode: PdfOutputMode = "download",
  options?: { internalUseOnly?: boolean }
): Promise<string | Blob | undefined> {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = 210;
  const pageHeight = 297;
  const margin = 14;
  const contentWidth = pageWidth - margin * 2;

  const company = loadCompanyDetails();
  const logo = loadCustomLogo();
  const proposalText = loadProposalText();
  const dateStr = new Date().toLocaleDateString("en-AU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  // ─── Page 1: Cover ─────────────────────────────────────────────────────────
  drawCoverPage(doc, data, company, logo, dateStr, pageWidth, pageHeight);

  // ─── Page 2: Client & Project Details ──────────────────────────────────────
  doc.addPage();
  let y = drawPageHeader(doc, logo, dateStr, pageWidth);
  y = drawClientDetails(doc, data, proposalText, y, margin, contentWidth);

  // ─── OPQ Section ───────────────────────────────────────────────────────────
  if (data.opq) {
    if (y > pageHeight - 80) { doc.addPage(); y = drawPageHeader(doc, logo, dateStr, pageWidth); }
    y = drawOPQSection(doc, data.opq, y, margin, contentWidth, pageWidth, pageHeight, logo, dateStr);
  }

  // ─── Deck Section ──────────────────────────────────────────────────────────
  if (data.deck) {
    if (y > pageHeight - 80) { doc.addPage(); y = drawPageHeader(doc, logo, dateStr, pageWidth); }
    y = drawDeckSection(doc, data.deck, y, margin, contentWidth, pageWidth, pageHeight, logo, dateStr);
  }

  // ─── Eclipse Section ───────────────────────────────────────────────────────
  if (data.eclipse) {
    if (y > pageHeight - 80) { doc.addPage(); y = drawPageHeader(doc, logo, dateStr, pageWidth); }
    y = drawEclipseSection(doc, data.eclipse, y, margin, contentWidth, pageWidth, pageHeight, logo, dateStr);
  }

  // ─── Site Plan Drawing ─────────────────────────────────────────────────────
  if (data.sitePlanImage) {
    doc.addPage();
    y = drawPageHeader(doc, logo, dateStr, pageWidth);
    y = drawSitePlanPage(doc, data.sitePlanImage, y, margin, contentWidth, pageHeight);
  }

  // ─── Grand Total Summary ───────────────────────────────────────────────────
  doc.addPage();
  y = drawPageHeader(doc, logo, dateStr, pageWidth);
  y = drawGrandTotal(doc, data, y, margin, contentWidth, pageWidth);

  // ─── Terms & Signature ─────────────────────────────────────────────────────
  if (y > pageHeight - 80) { doc.addPage(); y = drawPageHeader(doc, logo, dateStr, pageWidth); }
  y = drawTermsAndSignature(doc, data, proposalText, company, y, margin, contentWidth, pageWidth, pageHeight);

  // ─── Apply Internal Use Only watermark if requested ─────────────────────────
  if (options?.internalUseOnly) {
    applyInternalUseWatermark(doc);
  }
  // ─── Post-process with pdf-lib for editable form fields ────────────────────
  const jspdfBytes = doc.output("arraybuffer");
  const finalBytes = await addFormFields(new Uint8Array(jspdfBytes), data);

  // ─── Output ────────────────────────────────────────────────────────────────
  const filename = `Quote_${data.client.name.replace(/\s+/g, "_")}_${new Date().toISOString().slice(0, 10)}.pdf`;

  // Convert to ArrayBuffer for Blob compatibility
  const pdfBuffer = finalBytes.buffer.slice(finalBytes.byteOffset, finalBytes.byteOffset + finalBytes.byteLength) as ArrayBuffer;

  if (mode === "base64") {
    return uint8ToBase64(finalBytes);
  } else if (mode === "blob") {
    return new Blob([pdfBuffer], { type: "application/pdf" });
  } else if (mode === "preview") {
    const blob = new Blob([pdfBuffer], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank");
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    return undefined;
  } else {
    // download
    const blob = new Blob([pdfBuffer], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    return undefined;
  }
}

// ─── Cover Page ───────────────────────────────────────────────────────────────

function drawCoverPage(
  doc: jsPDF,
  data: UnifiedQuoteData,
  company: CompanyDetails,
  logo: CustomLogo | null,
  dateStr: string,
  pageWidth: number,
  pageHeight: number
) {
  // Dark background
  doc.setFillColor(30, 35, 40);
  doc.rect(0, 0, pageWidth, pageHeight, "F");

  // Accent stripe
  doc.setFillColor(200, 160, 60);
  doc.rect(0, 80, pageWidth, 3, "F");

  // Logo
  if (logo) {
    const { w, h } = logoSize(logo, 50, 25);
    doc.addImage(logo.dataUrl, "PNG", 14, 20, w, h);
  }

  // Company name
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(180, 180, 180);
  doc.text(company.companyName, pageWidth - 14, 30, { align: "right" });
  if (company.phone) doc.text(company.phone, pageWidth - 14, 36, { align: "right" });
  if (company.email) doc.text(company.email, pageWidth - 14, 42, { align: "right" });

  // Title
  doc.setFontSize(28);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(255, 255, 255);
  doc.text("Project Quote", 14, 110);

  // Client name
  doc.setFontSize(16);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(200, 160, 60);
  doc.text(data.client.name, 14, 125);

  // Address
  if (data.client.address) {
    doc.setFontSize(11);
    doc.setTextColor(180, 180, 180);
    doc.text(data.client.address, 14, 135);
  }

  // Date
  doc.setFontSize(10);
  doc.setTextColor(140, 140, 140);
  doc.text(`Date: ${dateStr}`, 14, 150);

  // Quote numbers
  const quoteNums: string[] = [];
  if (data.opq) quoteNums.push(data.opq.quoteNumber);
  if (data.deck) quoteNums.push(data.deck.quoteNumber);
  if (data.eclipse) quoteNums.push(data.eclipse.quoteNumber);
  if (quoteNums.length > 0) {
    doc.text(`Ref: ${quoteNums.join(" / ")}`, 14, 158);
  }

  // Grand total highlight
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(255, 255, 255);
  doc.text("Total Investment (inc GST)", 14, pageHeight - 50);
  doc.setFontSize(22);
  doc.setTextColor(200, 160, 60);
  doc.text(formatCurrency(data.grandTotalIncGst), 14, pageHeight - 38);

  // Footer
  doc.setFontSize(8);
  doc.setTextColor(100, 100, 100);
  doc.text("This document is confidential and prepared exclusively for the named client.", 14, pageHeight - 12);
}

// ─── Page Header ──────────────────────────────────────────────────────────────

function drawPageHeader(doc: jsPDF, logo: CustomLogo | null, dateStr: string, pageWidth: number): number {
  doc.setFillColor(245, 245, 245);
  doc.rect(0, 0, pageWidth, 28, "F");
  doc.setDrawColor(200, 160, 60);
  doc.setLineWidth(0.5);
  doc.line(0, 28, pageWidth, 28);

  if (logo) {
    const { w, h } = logoSize(logo, 30, 14);
    doc.addImage(logo.dataUrl, "PNG", 14, 7, w, h);
  }

  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(120, 120, 120);
  doc.text(dateStr, pageWidth - 14, 18, { align: "right" });

  return 36;
}

// ─── Client Details ───────────────────────────────────────────────────────────

function drawClientDetails(
  doc: jsPDF,
  data: UnifiedQuoteData,
  proposalText: ProposalText,
  startY: number,
  margin: number,
  contentWidth: number
): number {
  let y = startY;

  // Intro
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(30, 35, 40);
  doc.text(proposalText.introTitle, margin, y);
  y += 8;

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(60, 65, 70);
  const introLines = doc.splitTextToSize(proposalText.introBody, contentWidth);
  doc.text(introLines, margin, y);
  y += introLines.length * 4.5 + 10;

  // Client info box
  doc.setFillColor(248, 248, 248);
  doc.roundedRect(margin, y, contentWidth, 36, 2, 2, "F");
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(30, 35, 40);
  doc.text("Client", margin + 6, y + 8);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(60, 65, 70);
  doc.text(data.client.name, margin + 6, y + 15);
  if (data.client.phone) doc.text(`Ph: ${data.client.phone}`, margin + 6, y + 21);
  if (data.client.email) doc.text(`Email: ${data.client.email}`, margin + 6, y + 27);
  if (data.client.address) doc.text(data.client.address, margin + contentWidth / 2, y + 15);
  y += 44;

  // Scope
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(30, 35, 40);
  doc.text(proposalText.scopeTitle, margin, y);
  y += 6;
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(60, 65, 70);
  const scopeLines = doc.splitTextToSize(proposalText.scopeBody, contentWidth);
  doc.text(scopeLines, margin, y);
  y += scopeLines.length * 4.5 + 10;

  return y;
}

// ─── OPQ Section ──────────────────────────────────────────────────────────────

function drawOPQSection(
  doc: jsPDF, opq: OPQSection, startY: number, margin: number, contentWidth: number,
  pageWidth: number, pageHeight: number, logo: CustomLogo | null, dateStr: string
): number {
  let y = startY;

  // Section header
  doc.setFillColor(30, 35, 40);
  doc.roundedRect(margin, y, contentWidth, 8, 1, 1, "F");
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(255, 255, 255);
  doc.text(`Outdoor Living — ${opq.quoteNumber}`, margin + 4, y + 5.5);
  y += 14;

  if (opq.descriptionOfWork) {
    doc.setFontSize(9);
    doc.setFont("helvetica", "italic");
    doc.setTextColor(80, 85, 90);
    const descLines = doc.splitTextToSize(opq.descriptionOfWork, contentWidth);
    doc.text(descLines, margin, y);
    y += descLines.length * 4.5 + 6;
  }

  // Components table
  const tableBody = opq.components.filter(c => c.amount > 0).map(c => [c.name, formatCurrency(c.amount)]);
  if (tableBody.length > 0) {
    autoTable(doc, {
      startY: y,
      head: [["Component", "Amount (ex GST)"]],
      body: tableBody,
      theme: "striped",
      headStyles: { fillColor: [60, 65, 70], textColor: [255, 255, 255], fontSize: 8, fontStyle: "bold" },
      styles: { fontSize: 8, cellPadding: 3 },
      columnStyles: { 0: { cellWidth: contentWidth - 40 }, 1: { cellWidth: 40, halign: "right" } },
      margin: { left: margin, right: margin },
    });
    y = (doc as any).lastAutoTable.finalY + 4;
  }

  // Adjustments
  if (opq.adjustments.length > 0) {
    const adjBody = opq.adjustments.filter(a => a.amount !== 0).map(a => [a.name, formatCurrency(a.amount)]);
    if (adjBody.length > 0) {
      autoTable(doc, {
        startY: y,
        head: [["Adjustment", "Amount"]],
        body: adjBody,
        theme: "plain",
        headStyles: { fillColor: [240, 240, 240], textColor: [60, 65, 70], fontSize: 8 },
        styles: { fontSize: 8, cellPadding: 2.5 },
        columnStyles: { 0: { cellWidth: contentWidth - 40 }, 1: { cellWidth: 40, halign: "right" } },
        margin: { left: margin, right: margin },
      });
      y = (doc as any).lastAutoTable.finalY + 4;
    }
  }

  // Subtotal
  y = drawSubtotal(doc, opq.totalExGst, opq.gst, opq.totalIncGst, y, margin, contentWidth);
  return y + 8;
}

// ─── Deck Section ─────────────────────────────────────────────────────────────

function drawDeckSection(
  doc: jsPDF, deck: DeckSection, startY: number, margin: number, contentWidth: number,
  pageWidth: number, pageHeight: number, logo: CustomLogo | null, dateStr: string
): number {
  let y = startY;

  doc.setFillColor(30, 35, 40);
  doc.roundedRect(margin, y, contentWidth, 8, 1, 1, "F");
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(255, 255, 255);
  doc.text(`Timber Deck — ${deck.quoteNumber}`, margin + 4, y + 5.5);
  y += 14;

  // Specs
  const specs: string[] = [];
  if (deck.dimensions) specs.push(`Size: ${deck.dimensions}`);
  if (deck.frameType) specs.push(`Frame: ${deck.frameType}`);
  if (deck.deckingProduct) specs.push(`Decking: ${deck.deckingProduct}`);
  if (specs.length > 0) {
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(60, 65, 70);
    doc.text(specs.join("  |  "), margin, y);
    y += 8;
  }

  // Cost breakdown
  const deckBody = [
    ["Materials", formatCurrency(deck.materialCost)],
    ["Labour & Installation", formatCurrency(deck.labourCost)],
  ];
  autoTable(doc, {
    startY: y,
    head: [["Item", "Amount (ex GST)"]],
    body: deckBody,
    theme: "striped",
    headStyles: { fillColor: [60, 65, 70], textColor: [255, 255, 255], fontSize: 8, fontStyle: "bold" },
    styles: { fontSize: 8, cellPadding: 3 },
    columnStyles: { 0: { cellWidth: contentWidth - 40 }, 1: { cellWidth: 40, halign: "right" } },
    margin: { left: margin, right: margin },
  });
  y = (doc as any).lastAutoTable.finalY + 4;

  y = drawSubtotal(doc, deck.totalExGst, deck.gst, deck.totalIncGst, y, margin, contentWidth);
  return y + 8;
}

// ─── Eclipse Section ──────────────────────────────────────────────────────────

function drawEclipseSection(
  doc: jsPDF, eclipse: EclipseSection, startY: number, margin: number, contentWidth: number,
  pageWidth: number, pageHeight: number, logo: CustomLogo | null, dateStr: string
): number {
  let y = startY;

  doc.setFillColor(30, 35, 40);
  doc.roundedRect(margin, y, contentWidth, 8, 1, 1, "F");
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(255, 255, 255);
  doc.text(`Eclipse Opening Roof — ${eclipse.quoteNumber}`, margin + 4, y + 5.5);
  y += 14;

  // Units table
  const unitBody = eclipse.units.map(u => [u.name, `${u.sqm.toFixed(1)} m²`, formatCurrency(u.sellPrice)]);
  autoTable(doc, {
    startY: y,
    head: [["Unit", "Area", "Price (ex GST)"]],
    body: unitBody,
    theme: "striped",
    headStyles: { fillColor: [60, 65, 70], textColor: [255, 255, 255], fontSize: 8, fontStyle: "bold" },
    styles: { fontSize: 8, cellPadding: 3 },
    columnStyles: { 0: { cellWidth: contentWidth - 70 }, 1: { cellWidth: 30, halign: "center" }, 2: { cellWidth: 40, halign: "right" } },
    margin: { left: margin, right: margin },
  });
  y = (doc as any).lastAutoTable.finalY + 4;

  // Additional costs
  const addCosts = eclipse.additionalCosts.filter(c => c.amount > 0);
  if (addCosts.length > 0) {
    const addBody = addCosts.map(c => [c.name, formatCurrency(c.amount)]);
    autoTable(doc, {
      startY: y,
      head: [["Additional Cost", "Amount"]],
      body: addBody,
      theme: "plain",
      headStyles: { fillColor: [240, 240, 240], textColor: [60, 65, 70], fontSize: 8 },
      styles: { fontSize: 8, cellPadding: 2.5 },
      columnStyles: { 0: { cellWidth: contentWidth - 40 }, 1: { cellWidth: 40, halign: "right" } },
      margin: { left: margin, right: margin },
    });
    y = (doc as any).lastAutoTable.finalY + 4;
  }

  y = drawSubtotal(doc, eclipse.totalExGst, eclipse.gst, eclipse.totalIncGst, y, margin, contentWidth);
  return y + 8;
}

// ─── Site Plan Page ───────────────────────────────────────────────────────────

function drawSitePlanPage(
  doc: jsPDF, imageDataUrl: string, startY: number, margin: number, contentWidth: number, pageHeight: number
): number {
  let y = startY;

  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(30, 35, 40);
  doc.text("Site Plan", margin, y);
  y += 8;

  const imgW = contentWidth;
  const imgH = imgW * 0.625; // 800:500 aspect ratio

  if (y + imgH > pageHeight - 20) {
    doc.addPage();
    y = 36;
  }

  try {
    doc.addImage(imageDataUrl, "PNG", margin, y, imgW, imgH);
    y += imgH + 8;
  } catch (e) {
    doc.setFontSize(9);
    doc.setTextColor(150, 50, 50);
    doc.text("(Site plan image could not be embedded)", margin, y);
    y += 10;
  }

  return y;
}

// ─── Grand Total ──────────────────────────────────────────────────────────────

function drawGrandTotal(
  doc: jsPDF, data: UnifiedQuoteData, startY: number, margin: number, contentWidth: number, pageWidth: number
): number {
  let y = startY;

  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(30, 35, 40);
  doc.text("Project Total", margin, y);
  y += 10;

  // Summary table
  const summaryBody: string[][] = [];
  if (data.opq) summaryBody.push(["Outdoor Living", formatCurrency(data.opq.totalIncGst)]);
  if (data.deck) summaryBody.push(["Timber Deck", formatCurrency(data.deck.totalIncGst)]);
  if (data.eclipse) summaryBody.push(["Eclipse Opening Roof", formatCurrency(data.eclipse.totalIncGst)]);

  autoTable(doc, {
    startY: y,
    head: [["Section", "Total (inc GST)"]],
    body: summaryBody,
    theme: "striped",
    headStyles: { fillColor: [30, 35, 40], textColor: [255, 255, 255], fontSize: 10, fontStyle: "bold" },
    styles: { fontSize: 10, cellPadding: 5 },
    columnStyles: { 0: { cellWidth: contentWidth - 50 }, 1: { cellWidth: 50, halign: "right" } },
    margin: { left: margin, right: margin },
  });
  y = (doc as any).lastAutoTable.finalY + 6;

  // Grand total box
  doc.setFillColor(30, 35, 40);
  doc.roundedRect(margin, y, contentWidth, 18, 2, 2, "F");
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(255, 255, 255);
  doc.text("Grand Total (inc GST)", margin + 6, y + 7);
  doc.setFontSize(14);
  doc.setTextColor(200, 160, 60);
  doc.text(formatCurrency(data.grandTotalIncGst), margin + contentWidth - 6, y + 12, { align: "right" });
  y += 26;

  // GST note
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(120, 120, 120);
  doc.text(`Subtotal ex GST: ${formatCurrency(data.grandTotalExGst)}  |  GST: ${formatCurrency(data.grandTotalGst)}`, margin, y);
  y += 10;

  return y;
}

// ─── Terms & Signature ────────────────────────────────────────────────────────

function drawTermsAndSignature(
  doc: jsPDF, data: UnifiedQuoteData, proposalText: ProposalText, company: CompanyDetails,
  startY: number, margin: number, contentWidth: number, pageWidth: number, pageHeight: number
): number {
  let y = startY;

  // Warranty
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(30, 35, 40);
  doc.text(proposalText.warrantyTitle, margin, y);
  y += 6;
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(60, 65, 70);
  const warrantyLines = doc.splitTextToSize(proposalText.warrantyBody, contentWidth);
  doc.text(warrantyLines, margin, y);
  y += warrantyLines.length * 4.5 + 10;

  // Footer note
  if (proposalText.footerNote) {
    doc.setFontSize(8);
    doc.setFont("helvetica", "italic");
    doc.setTextColor(120, 125, 130);
    const footerLines = doc.splitTextToSize(proposalText.footerNote, contentWidth);
    doc.text(footerLines, margin, y);
    y += footerLines.length * 4 + 12;
  }

  // Editable notes placeholder (will become form field via pdf-lib)
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(30, 35, 40);
  doc.text("Client Notes / Site Conditions:", margin, y);
  y += 6;
  doc.setDrawColor(180, 180, 180);
  doc.setLineWidth(0.3);
  doc.rect(margin, y, contentWidth, 30);
  doc.setFontSize(8);
  doc.setFont("helvetica", "italic");
  doc.setTextColor(180, 180, 180);
  doc.text("(Editable field — type notes here in your PDF reader)", margin + 4, y + 6);
  y += 38;

  // Signature section
  if (y > pageHeight - 60) {
    doc.addPage();
    y = 36;
  }

  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(30, 35, 40);
  doc.text("Acceptance", margin, y);
  y += 8;

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(60, 65, 70);
  doc.text("I/We accept this proposal and authorise the commencement of works as described above.", margin, y);
  y += 14;

  const sigWidth = (contentWidth - 20) / 2;
  doc.setDrawColor(30, 35, 40);
  doc.setLineWidth(0.5);
  doc.line(margin, y + 20, margin + sigWidth, y + 20);
  doc.setFontSize(8);
  doc.setTextColor(100, 105, 110);
  doc.text("Client Signature", margin, y + 26);
  doc.text("Date: ___/___/______", margin, y + 32);

  const sigX2 = margin + sigWidth + 20;
  doc.line(sigX2, y + 20, sigX2 + sigWidth, y + 20);
  doc.text(company.companyName, sigX2, y + 26);
  doc.text("Date: ___/___/______", sigX2, y + 32);

  y += 40;
  return y;
}

// ─── Subtotal Helper ──────────────────────────────────────────────────────────

function drawSubtotal(
  doc: jsPDF, exGst: number, gst: number, incGst: number,
  startY: number, margin: number, contentWidth: number
): number {
  let y = startY;
  doc.setFillColor(248, 248, 248);
  doc.rect(margin, y, contentWidth, 18, "F");
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(80, 85, 90);
  doc.text(`Subtotal: ${formatCurrency(exGst)}`, margin + 4, y + 6);
  doc.text(`GST: ${formatCurrency(gst)}`, margin + 4, y + 12);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(30, 35, 40);
  doc.text(`Total (inc GST): ${formatCurrency(incGst)}`, margin + contentWidth - 4, y + 12, { align: "right" });
  return y + 22;
}

// ─── PDF Form Fields (pdf-lib post-processing) ───────────────────────────────

async function addFormFields(pdfBytes: Uint8Array, data: UnifiedQuoteData): Promise<Uint8Array> {
  try {
    const pdfDoc = await PDFDocument.load(pdfBytes.buffer as ArrayBuffer);
    const form = pdfDoc.getForm();
    const pages = pdfDoc.getPages();
    // Place form fields on the second-to-last page (terms page, before signature)
    // The terms page is where we drew the "Client Notes / Site Conditions" rectangle
    const termsPageIdx = Math.max(0, pages.length - 1);
    const termsPage = pages[termsPageIdx];
    const { width, height } = termsPage.getSize();

    // 14mm margin ≈ 40pt, field area starts after the notes label
    const fieldX = 40;
    const fieldW = width - 80;

    // 1. Client Notes — pre-populated with client address if available
    const notesField = form.createTextField("clientNotes");
    const notesDefault = data.client.address
      ? `Site: ${data.client.address}`
      : "";
    notesField.setText(notesDefault);
    notesField.setFontSize(9);
    notesField.enableMultiline();
    notesField.addToPage(termsPage, {
      x: fieldX,
      y: height - 620,
      width: fieldW,
      height: 70,
      borderWidth: 1,
      borderColor: rgb(0.75, 0.75, 0.75),
    });

    // 2. Site Conditions — editable field for access, slope, soil, etc.
    const siteField = form.createTextField("siteConditions");
    siteField.setText("Access: \nSlope: \nSoil Type: \nExisting Structures: ");
    siteField.setFontSize(9);
    siteField.enableMultiline();
    siteField.addToPage(termsPage, {
      x: fieldX,
      y: height - 710,
      width: fieldW,
      height: 70,
      borderWidth: 1,
      borderColor: rgb(0.75, 0.75, 0.75),
    });

    // 3. Special Instructions — free-form editable
    const specialField = form.createTextField("specialInstructions");
    specialField.setText("");
    specialField.setFontSize(9);
    specialField.enableMultiline();
    specialField.addToPage(termsPage, {
      x: fieldX,
      y: height - 790,
      width: fieldW,
      height: 60,
      borderWidth: 1,
      borderColor: rgb(0.75, 0.75, 0.75),
    });

    const savedBytes = await pdfDoc.save();
    return new Uint8Array(savedBytes);
  } catch (e) {
    console.warn("Failed to add form fields, returning original PDF:", e);
    return pdfBytes;
  }
}

// ─── Utility Helpers ──────────────────────────────────────────────────────────

function logoSize(logo: CustomLogo, maxW: number, maxH: number) {
  const ratio = Math.min(maxW / logo.width, maxH / logo.height);
  return { w: logo.width * ratio, h: logo.height * ratio };
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    minimumFractionDigits: 2,
  }).format(amount);
}

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}
