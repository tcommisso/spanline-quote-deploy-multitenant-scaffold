/**
 * Eclipse Opening Roof System — PDF Export
 * Two report types:
 *   1. Quote PDF — Customer-facing summary (no material breakdown)
 *   2. Management PDF — Full material details, margins, commission, net profit
 *
 * Uses the Altaspan proposal branding (company details, custom logo) from proposalStore.
 */

import jsPDF from "jspdf";
import { applyInternalUseWatermark } from "./pdfWatermark";
import autoTable from "jspdf-autotable";
import type { UnitInput, ProjectResult, AdditionalCosts, ValidationError } from "../../../shared/eclipseCalculations";
import { totalAdditionalCosts, additionalCostsToArray, validateAllUnits } from "../../../shared/eclipseCalculations";
import { loadCompanyDetails, loadCustomLogo, type CustomLogo, type CompanyDetails } from "./proposalStore";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ChecklistSelectionItem {
  itemId: number;
  label: string;
  unitPrice: number;
  qty: number;
  total: number;
  section: string;
  unit: string;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function fmt(val: number): string {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    minimumFractionDigits: 2,
  }).format(val);
}

/** Reliable PDF save via data URI (avoids blob URL issues in sandboxed environments) */
function savePdfReliably(doc: jsPDF, filename: string) {
  const dataUri = doc.output("dataurlstring", { filename });
  const a = document.createElement("a");
  a.href = dataUri;
  a.download = filename;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  setTimeout(() => document.body.removeChild(a), 1000);
}

/** Load the custom logo from proposalStore, or fall back to null */
function getLogoData(): string | null {
  const logo: CustomLogo | null = loadCustomLogo();
  return logo?.dataUrl ?? null;
}

/** Draw the branded header bar */
function drawHeader(doc: jsPDF, title: string, subtitle: string, logoData: string | null, company: CompanyDetails) {
  const pageWidth = doc.internal.pageSize.getWidth();
  // Dark header bar
  doc.setFillColor(60, 50, 45);
  doc.rect(0, 0, pageWidth, 36, "F");

  let textX = 14;
  if (logoData) {
    try {
      doc.addImage(logoData, "PNG", 10, 3, 30, 30);
      textX = 44;
    } catch {
      // Logo failed to render, continue without it
    }
  }

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(20);
  doc.setFont("helvetica", "bold");
  doc.text(title, textX, 16);
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(subtitle, textX, 24);

  // Date on right
  doc.setFontSize(8);
  const dateStr = new Date().toLocaleDateString("en-AU", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
  doc.text(`Generated: ${dateStr}`, pageWidth - 14, 16, { align: "right" });

  // Company name on right
  if (company.companyName) {
    doc.setFontSize(7);
    doc.text(company.companyName, pageWidth - 14, 22, { align: "right" });
  }
}

/** Draw page footer with page numbers */
function drawFooter(doc: jsPDF, label: string) {
  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setFontSize(7);
    doc.setTextColor(160, 150, 140);
    doc.text(
      `${label} — Page ${p} of ${totalPages}`,
      doc.internal.pageSize.getWidth() / 2,
      doc.internal.pageSize.getHeight() - 8,
      { align: "center" }
    );
  }
}

/** Draw customer details block */
function drawCustomerDetails(
  doc: jsPDF,
  quoteNumber: string,
  clientName: string,
  clientPhone: string,
  clientEmail: string,
  clientAddress: string,
  startY: number
): number {
  let y = startY;
  const hasDetails = clientName || clientAddress || quoteNumber;
  if (!hasDetails) return y;

  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(60, 50, 45);
  doc.text("Customer Details", 14, y);
  y += 6;

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(80, 75, 70);

  if (quoteNumber) {
    doc.setFont("helvetica", "bold");
    doc.text(`Quote Ref: ${quoteNumber}`, 14, y);
    doc.setFont("helvetica", "normal");
    y += 5;
  }
  if (clientName) {
    doc.text(`Client: ${clientName}`, 14, y);
    y += 5;
  }
  if (clientPhone) {
    doc.text(`Phone: ${clientPhone}`, 14, y);
    y += 5;
  }
  if (clientEmail) {
    doc.text(`Email: ${clientEmail}`, 14, y);
    y += 5;
  }
  if (clientAddress) {
    const lines = doc.splitTextToSize(`Address: ${clientAddress}`, 120);
    doc.text(lines, 14, y);
    y += lines.length * 4.5;
  }

  y += 4;
  return y;
}

/** Draw quote validity and terms at the bottom of the last page */
function drawQuoteTerms(doc: jsPDF, validityDays: number, terms: string) {
  const pageHeight = doc.internal.pageSize.getHeight();
  const pageWidth = doc.internal.pageSize.getWidth();
  const totalPages = doc.getNumberOfPages();
  doc.setPage(totalPages);

  let y = pageHeight - 38;
  doc.setDrawColor(220, 215, 210);
  doc.line(14, y, pageWidth - 14, y);
  y += 6;

  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(196, 93, 62);
  doc.text(`This quote is valid for ${validityDays} days from the date of issue.`, 14, y);
  y += 6;

  if (terms) {
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(140, 130, 120);
    const termsLines = doc.splitTextToSize(terms, pageWidth - 28);
    doc.text(termsLines, 14, y);
  }
}

// ─── Additional Costs helper ────────────────────────────────────────────────

function drawAdditionalCosts(doc: jsPDF, additionalCosts: AdditionalCosts, y: number): number {
  const addTotal = totalAdditionalCosts(additionalCosts);
  if (addTotal <= 0) return y;

  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(60, 50, 45);
  doc.text("Additional Costs", 14, y);
  y += 7;

  const addRows: string[][] = additionalCostsToArray(additionalCosts)
    .filter(item => item.amount > 0)
    .map(item => [item.name, fmt(item.amount)]);
  addRows.push(["Additional Costs Subtotal", fmt(addTotal)]);

  autoTable(doc, {
    startY: y,
    body: addRows,
    theme: "plain",
    bodyStyles: { fontSize: 10 },
    columnStyles: {
      0: { cellWidth: 80 },
      1: { cellWidth: 45, halign: "right", fontStyle: "bold" },
    },
    styles: { cellPadding: 3 },
    margin: { left: 18, right: 14 },
    didParseCell: (data: any) => {
      if (data.row.index === addRows.length - 1) {
        data.cell.styles.fontStyle = "bold";
        data.cell.styles.fillColor = [247, 245, 240];
      }
    },
  });

  return (doc as any).lastAutoTable.finalY + 8;
}

/** Draw itemized checklist pricing table */
function drawChecklistPricing(doc: jsPDF, selections: ChecklistSelectionItem[], y: number): number {
  if (!selections || selections.length === 0) return y;

  const checklistTotal = selections.reduce((sum, s) => sum + s.total, 0);
  if (checklistTotal <= 0) return y;

  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(60, 50, 45);
  doc.text("Additional Costs", 14, y);
  y += 7;

  const rows: string[][] = selections.map(s => [
    s.label,
    `${s.qty} × ${fmt(s.unitPrice)}`,
    fmt(s.total),
  ]);
  rows.push(["Additional Costs Subtotal", "", fmt(checklistTotal)]);

  autoTable(doc, {
    startY: y,
    head: [["Item", "Qty × Unit Price", "Total"]],
    body: rows,
    theme: "plain",
    headStyles: { fontSize: 9, fontStyle: "bold", textColor: [100, 90, 80], fillColor: [247, 245, 240] },
    bodyStyles: { fontSize: 10 },
    columnStyles: {
      0: { cellWidth: 80 },
      1: { cellWidth: 45, halign: "center" },
      2: { cellWidth: 40, halign: "right", fontStyle: "bold" },
    },
    styles: { cellPadding: 3 },
    margin: { left: 18, right: 14 },
    didParseCell: (data: any) => {
      if (data.section === "body" && data.row.index === rows.length - 1) {
        data.cell.styles.fontStyle = "bold";
        data.cell.styles.fillColor = [247, 245, 240];
      }
    },
  });

  return (doc as any).lastAutoTable.finalY + 8;
}

// ============================================================
// QUOTE PDF — Customer-facing, shows summary + additional costs + grand total
// ============================================================

export interface ProposalImageData {
  name: string;
  description: string;
  imageUrl: string;
}

export interface EclipseQuotePDFOptions {
  quoteNumber: string;
  clientName: string;
  clientPhone: string;
  clientEmail: string;
  clientAddress: string;
  units: UnitInput[];
  result: ProjectResult;
  additionalCosts: AdditionalCosts;
  /** Total bracket cost across all units (auto-calculated from per-unit selections × admin pricing) */
  bracketCost?: number;
  /** Total checklist pricing across all selected items */
  checklistTotal?: number;
  /** Itemized checklist selections for PDF table */
  checklistSelections?: ChecklistSelectionItem[];
  internalUseOnly?: boolean;
  quoteValidityDays?: number;
  quoteTerms?: string;
  /** Base64 data URL of the site layout canvas capture */
  siteLayoutImage?: string;
  /** Base64 data URL of the property site plan capture */
  propertySitePlanImage?: string;
  /** Eclipse proposal/technical appendix images (pre-loaded as base64 data URLs) */
  proposalImages?: ProposalImageData[];
  /** If true, returns a blob URL for preview instead of triggering download */
  previewOnly?: boolean;
}

export function generateEclipseQuotePDF(options: EclipseQuotePDFOptions) {
  const {
    quoteNumber,
    clientName,
    clientPhone,
    clientEmail,
    clientAddress,
    units,
    result,
    additionalCosts,
    quoteValidityDays = 30,
    quoteTerms = "All prices are in AUD and include GST where stated. This quote is subject to a site inspection. Pricing may vary based on site conditions, access requirements, and council approvals. Payment terms: 50% deposit on acceptance, balance on completion.",
  } = options;

  const company = loadCompanyDetails();
  const logoData = getLogoData();
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  drawHeader(doc, "Eclipse Opening Roof", "Quote", logoData, company);
  let y = 44;

  // Customer Details
  y = drawCustomerDetails(doc, quoteNumber, clientName, clientPhone, clientEmail, clientAddress, y);

  // Per-unit summary
  doc.setTextColor(60, 50, 45);
  doc.setFontSize(13);
  doc.setFont("helvetica", "bold");
  doc.text("Unit Summary", 14, y);
  y += 8;

  const unitRows = result.units.map((r, i) => {
    if (!r) return null;
    const sqm = (units[i].bladeWidth / 1000) * (units[i].length / 1000);
    const fallDir = units[i].fallDirection || "—";
    const walls = units[i].houseWalls ? units[i].houseWalls.split(",").join(", ") : "—";
    return [
      `Unit ${i + 1}`,
      `${units[i].bladeWidth}mm × ${units[i].length}mm${units[i].isRaked ? ` (Raked: ${units[i].rakedShortLength}mm short)` : ""}`,
      sqm.toFixed(2),
      units[i].bladeColour === "Powder Coated" ? units[i].colourbondBladeColour : "White",
      fallDir,
      walls,
      fmt(r.rrpIncGST),
    ];
  }).filter(Boolean) as string[][];

  autoTable(doc, {
    startY: y,
    head: [["Unit", "Dimensions", "m²", "Blade Colour", "Fall", "House Walls", "RRP inc GST"]],
    body: unitRows,
    theme: "grid",
    headStyles: { fillColor: [196, 93, 62], textColor: 255, fontStyle: "bold", fontSize: 9 },
    bodyStyles: { fontSize: 9 },
    columnStyles: {
      6: { halign: "right", fontStyle: "bold" },
    },
    styles: { cellPadding: 3 },
    margin: { left: 14, right: 14 },
  });

  y = (doc as any).lastAutoTable.finalY + 10;

  // Project Summary
  doc.setTextColor(60, 50, 45);
  doc.setFontSize(13);
  doc.setFont("helvetica", "bold");
  doc.text("Project Summary", 14, y);
  y += 8;

  autoTable(doc, {
    startY: y,
    head: [["Total m²", "Sell Price (ex GST)", "GST", "RRP inc GST", "RRP / m²"]],
    body: [[
      result.totalSqm.toFixed(2),
      fmt(result.totalSellPriceEx),
      fmt(result.totalGST),
      fmt(result.totalRRPInc),
      fmt(result.rrpPerSqm),
    ]],
    theme: "grid",
    headStyles: { fillColor: [196, 93, 62], textColor: 255, fontStyle: "bold", fontSize: 9 },
    bodyStyles: { fontSize: 10, fontStyle: "bold", halign: "center" },
    styles: { cellPadding: 4 },
    margin: { left: 14, right: 14 },
  });

  y = (doc as any).lastAutoTable.finalY + 10;

  // Additional Costs (legacy fields for backward compat with old quotes)
  y = drawAdditionalCosts(doc, additionalCosts, y);

  // Checklist Pricing (itemized)
  if (options.checklistSelections && options.checklistSelections.length > 0) {
    y = drawChecklistPricing(doc, options.checklistSelections, y);
  }

  // Bracket Costs (from per-unit attachment & bracket selections)
  const bracketCost = options.bracketCost || 0;
  if (bracketCost > 0) {
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(60, 50, 45);
    doc.text("Bracket Costs", 14, y);
    y += 7;
    // Per-unit bracket breakdown
    const bracketRows: string[][] = [];
    units.forEach((u, i) => {
      const lines: string[] = [];
      if (u.fasciaBrackets) lines.push(`Fascia Brackets: ${u.fasciaBrackets}`);
      if (u.extendaBrackets) lines.push(`Extenda Brackets: ${u.extendaBrackets}`);
      if (u.gableBracketsQty) lines.push(`Gable Brackets: ${u.gableBracketsQty}`);
      if (u.bracketCover) lines.push(`Bracket Cover: ${u.bracketCover}`);
      if (lines.length > 0) {
        bracketRows.push([`Unit ${i + 1}: ${lines.join(", ")}`, ""]);
      }
    });
    bracketRows.push(["Bracket Costs Subtotal", fmt(bracketCost)]);
    autoTable(doc, {
      startY: y,
      body: bracketRows,
      theme: "plain",
      bodyStyles: { fontSize: 10 },
      columnStyles: { 0: { cellWidth: 120 }, 1: { cellWidth: 45, halign: "right", fontStyle: "bold" } },
      styles: { cellPadding: 3 },
      margin: { left: 18, right: 14 },
      didParseCell: (data: any) => {
        if (data.row.index === bracketRows.length - 1) {
          data.cell.styles.fontStyle = "bold";
          data.cell.styles.fillColor = [247, 245, 240];
        }
      },
    });
    y = (doc as any).lastAutoTable.finalY + 8;
  }

  // Grand Total (bracket costs are now included in result.totalRRPInc via per-unit materials)
  const addTotal = totalAdditionalCosts(additionalCosts);
  const pdfChecklistTotal = options.checklistTotal || 0;
  const grandTotal = result.totalRRPInc + addTotal + pdfChecklistTotal;

  autoTable(doc, {
    startY: y,
    body: [["Grand Total (inc GST)", fmt(grandTotal)]],
    theme: "plain",
    bodyStyles: { fontSize: 14, fontStyle: "bold" },
    columnStyles: {
      0: { cellWidth: 80 },
      1: { cellWidth: 45, halign: "right" },
    },
    styles: { cellPadding: 4 },
    margin: { left: 14, right: 14 },
    didParseCell: (data: any) => {
      data.cell.styles.fillColor = [252, 240, 235];
      data.cell.styles.textColor = [196, 93, 62];
    },
  });

  // Quote Validity & Terms
  drawQuoteTerms(doc, quoteValidityDays, quoteTerms);

  // Site Layout page (combined multi-unit plan)
  if (options.siteLayoutImage) {
    doc.addPage();
    const pw = doc.internal.pageSize.getWidth();
    doc.setFontSize(13);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(60, 50, 45);
    doc.text("Site Layout — Combined Unit Plan", 14, 18);
    try {
      const imgW = pw - 28;
      const imgH = imgW * 0.7;
      doc.addImage(options.siteLayoutImage, "PNG", 14, 26, imgW, imgH);
    } catch { /* image failed */ }
  }

  // Property Site Plan page (satellite + parcel boundary)
  if (options.propertySitePlanImage) {
    doc.addPage();
    const pw = doc.internal.pageSize.getWidth();
    doc.setFontSize(13);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(60, 50, 45);
    doc.text("Property Site Plan", 14, 18);
    try {
      const imgW = pw - 28;
      const imgH = imgW * 0.75;
      doc.addImage(options.propertySitePlanImage, "PNG", 14, 26, imgW, imgH);
    } catch { /* image failed */ }
  }

  // Technical Appendix — Proposal Images
  if (options.proposalImages && options.proposalImages.length > 0) {
    drawProposalImagesAppendix(doc, options.proposalImages);
  }

  // Validation Summary Checklist page (included in all PDFs for sign-off)
  drawValidationSummaryPage(doc, units);

  drawFooter(doc, "Eclipse Opening Roof \u2014 Quote");
  if (options.internalUseOnly) { applyInternalUseWatermark(doc); }

  const filename = `Eclipse_Quote_${quoteNumber}_${new Date().toISOString().slice(0, 10)}.pdf`;
  if (options.previewOnly) {
    const blob = doc.output("blob");
    return { blob, filename };
  }
  savePdfReliably(doc, filename);
  return undefined;
}

// ============================================================
// MANAGEMENT PDF — Full details with materials, margins, commission, net profit
// ============================================================

export interface EclipseManagementPDFOptions {
  quoteNumber: string;
  clientName: string;
  clientPhone: string;
  clientEmail: string;
  clientAddress: string;
  units: UnitInput[];
  result: ProjectResult;
  commissionRate: number;
  margin: number;
  additionalCosts: AdditionalCosts;
  /** Total bracket cost across all units */
  bracketCost?: number;
  /** Total checklist pricing across all selected items */
  checklistTotal?: number;
  /** Itemized checklist selections for PDF table */
  checklistSelections?: ChecklistSelectionItem[];
  internalUseOnly?: boolean;
  /** Base64 data URL of the site layout canvas capture */
  siteLayoutImage?: string;
  /** Base64 data URL of the property site plan capture */
  propertySitePlanImage?: string;
  /** Eclipse proposal/technical appendix images (pre-loaded as base64 data URLs) */
  proposalImages?: ProposalImageData[];
  /** Base64 data URLs of raked elevation diagrams (one per raked unit) */
  rakedElevationImages?: { unitIndex: number; dataUrl: string }[];
  /** If true, returns a blob URL for preview instead of triggering download */
  previewOnly?: boolean;
}

export function generateEclipseManagementPDF(options: EclipseManagementPDFOptions) {
  const {
    quoteNumber,
    clientName,
    clientPhone,
    clientEmail,
    clientAddress,
    units,
    result,
    commissionRate,
    margin,
    additionalCosts,
  } = options;

  const company = loadCompanyDetails();
  const logoData = getLogoData();
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();

  drawHeader(doc, "Eclipse Opening Roof", "Management Report", logoData, company);
  let y = 44;

  // Customer Details
  y = drawCustomerDetails(doc, quoteNumber, clientName, clientPhone, clientEmail, clientAddress, y);

  // Project Summary
  doc.setTextColor(60, 50, 45);
  doc.setFontSize(13);
  doc.setFont("helvetica", "bold");
  doc.text("Project Summary", 14, y);
  y += 8;

  autoTable(doc, {
    startY: y,
    head: [["Total m²", "Sell Price (ex GST)", "GST", "RRP inc GST", "RRP / m²"]],
    body: [[
      result.totalSqm.toFixed(2),
      fmt(result.totalSellPriceEx),
      fmt(result.totalGST),
      fmt(result.totalRRPInc),
      fmt(result.rrpPerSqm),
    ]],
    theme: "grid",
    headStyles: { fillColor: [196, 93, 62], textColor: 255, fontStyle: "bold", fontSize: 9 },
    bodyStyles: { fontSize: 10, fontStyle: "bold", halign: "center" },
    styles: { cellPadding: 4 },
    margin: { left: 14, right: 14 },
  });

  y = (doc as any).lastAutoTable.finalY + 8;

  // Additional Costs (legacy fields for backward compat with old quotes)
  y = drawAdditionalCosts(doc, additionalCosts, y);

  // Checklist Pricing (itemized)
  if (options.checklistSelections && options.checklistSelections.length > 0) {
    y = drawChecklistPricing(doc, options.checklistSelections, y);
  }

  // Bracket costs are now included in result.totalRRPInc via per-unit materials
  const mgmtBracketCost = options.bracketCost || 0;
  if (mgmtBracketCost > 0) {
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text(`Bracket Costs: ${fmt(mgmtBracketCost)}`, 18, y);
    y += 7;
  }

  const mgmtChecklistTotal = options.checklistTotal || 0;

  const addTotal = totalAdditionalCosts(additionalCosts);
  const grandTotal = result.totalRRPInc + addTotal + mgmtChecklistTotal;

  autoTable(doc, {
    startY: y,
    body: [["Grand Total (inc GST)", fmt(grandTotal)]],
    theme: "plain",
    bodyStyles: { fontSize: 12, fontStyle: "bold" },
    columnStyles: {
      0: { cellWidth: 70 },
      1: { cellWidth: 40, halign: "right" },
    },
    styles: { cellPadding: 3 },
    margin: { left: 14, right: 14 },
    didParseCell: (data: any) => {
      data.cell.styles.fillColor = [252, 240, 235];
      data.cell.styles.textColor = [196, 93, 62];
    },
  });

  y = (doc as any).lastAutoTable.finalY + 6;

  // Settings
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(120, 110, 100);
  doc.text(`Commission Rate: ${(commissionRate * 100).toFixed(0)}%   |   Margin: ${(margin * 100).toFixed(0)}%`, 14, y);
  y += 10;

  // Per-Unit Breakdowns
  result.units.forEach((unitResult, i) => {
    if (!unitResult) return;
    const unit = units[i];

    // Check if we need a new page
    if (y > 240) {
      doc.addPage();
      y = 15;
    }

    // Unit header
    doc.setFillColor(247, 245, 240);
    doc.rect(14, y - 5, pageWidth - 28, 10, "F");
    doc.setTextColor(60, 50, 45);
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text(`Unit ${i + 1}`, 18, y + 1);

    // Unit specs
    const sqm = (unit.bladeWidth / 1000) * (unit.length / 1000);
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(120, 110, 100);
    const rakedNote = unit.isRaked ? `  |  RAKED (short: ${unit.rakedShortLength}mm)` : "";
    const specs = `${unit.bladeWidth}mm × ${unit.length}mm  |  ${sqm.toFixed(2)} m²  |  ${unit.posts} posts  |  Blade: ${unit.bladeColour === "Powder Coated" ? unit.colourbondBladeColour : "White"}  |  Structure: ${unit.structureColour === "Powder Coated" ? unit.colourbondStructureColour : "White"}${rakedNote}`;
    doc.text(specs, pageWidth - 18, y + 1, { align: "right" });
    y += 10;

    // Fall direction & house walls
    const fallInfo: string[] = [];
    if (unit.fallDirection) fallInfo.push(`Fall: ${unit.fallDirection}`);
    if (unit.houseWalls) fallInfo.push(`House Walls: ${unit.houseWalls.split(",").join(", ")}`);
    if (fallInfo.length > 0) {
      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(100, 90, 80);
      doc.text(fallInfo.join("  |  "), 18, y);
      y += 5;
    }

    // Attachment & Brackets
    const attachInfo: string[] = [];
    if (unit.attachmentMethod && unit.attachmentMethod !== "none") attachInfo.push(`Attachment: ${unit.attachmentMethod}`);
    if (unit.fasciaBrackets) attachInfo.push(`Fascia: ${unit.fasciaBrackets}`);
    if (unit.extendaBrackets) attachInfo.push(`Extenda: ${unit.extendaBrackets}`);
    if (unit.gableBracketsQty) attachInfo.push(`Gable: ${unit.gableBracketsQty}`);
    if (unit.bracketCover) attachInfo.push(`Cover: ${unit.bracketCover}`);
    if (attachInfo.length > 0) {
      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(100, 90, 80);
      doc.text(attachInfo.join("  |  "), 18, y);
      y += 5;
    }

    // Unit notes
    if (unit.notes && unit.notes.trim()) {
      doc.setFontSize(8);
      doc.setFont("helvetica", "italic");
      doc.setTextColor(100, 90, 80);
      const noteLines = doc.splitTextToSize(`Notes: ${unit.notes.trim()}`, pageWidth - 36);
      doc.text(noteLines, 18, y);
      y += noteLines.length * 4 + 3;
    }

    // Materials table
    const matRows = unitResult.materials.map((m) => [
      m.code || "\u2014",
      m.description,
      m.qty.toFixed(0),
      fmt(m.unitPrice),
      `${m.discount}%`,
      fmt(m.total),
    ]);

    autoTable(doc, {
      startY: y,
      head: [["Code", "Description", "Qty", "Unit $", "Disc %", "Total"]],
      body: matRows,
      theme: "striped",
      headStyles: { fillColor: [80, 70, 65], textColor: 255, fontSize: 7 },
      bodyStyles: { fontSize: 7 },
      columnStyles: {
        0: { cellWidth: 18 },
        1: { cellWidth: "auto" },
        2: { cellWidth: 12, halign: "right" },
        3: { cellWidth: 20, halign: "right" },
        4: { cellWidth: 14, halign: "right" },
        5: { cellWidth: 22, halign: "right", fontStyle: "bold" },
      },
      styles: { cellPadding: 1.5, overflow: "linebreak" },
      margin: { left: 14, right: 14 },
    });

    y = (doc as any).lastAutoTable.finalY + 4;

    // Raked roof data (if applicable)
    if (unitResult.rakedData) {
      const rd = unitResult.rakedData;
      doc.setFontSize(8);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(196, 50, 50);
      doc.text("RAKED ROOF DATA", 18, y);
      y += 4;
      doc.setFont("helvetica", "normal");
      doc.setTextColor(60, 60, 60);
      doc.setFontSize(7);
      doc.text(`Rake Angle: ${rd.rakeAngleDeg.toFixed(1)}°  |  Blades: ${rd.blades.length}  |  Longest: ${rd.longSideLengthMM}mm  |  Shortest: ${rd.shortSideLengthMM}mm`, 18, y);
      y += 4;
      doc.text(`Offset Blocks: ${rd.offsetBlockCount} pcs  |  Total Length: ${(rd.totalOffsetBlockLengthMM / 1000).toFixed(2)}m  |  Max Height: ${rd.maxOffsetHeightMM.toFixed(0)}mm`, 18, y);
      y += 6;
    }

    // Unit pricing summary
    const summaryRows = [
      ["Material Cost", fmt(unitResult.materialCost)],
      ["Labour", fmt(unitResult.labourCost)],
      ["Margin", fmt(unitResult.marginAmount)],
      ["Sell Price (ex GST)", fmt(unitResult.sellPriceExGST)],
      ["GST (10%)", fmt(unitResult.gst)],
      ["RRP inc GST", fmt(unitResult.rrpIncGST)],
      ["RRP per m²", fmt(unitResult.rrpPerSqm)],
      ["Commission", fmt(unitResult.commission)],
      ["Net Profit", fmt(unitResult.netProfit)],
    ];

    autoTable(doc, {
      startY: y,
      body: summaryRows,
      theme: "plain",
      bodyStyles: { fontSize: 8 },
      columnStyles: {
        0: { cellWidth: 55, fontStyle: "bold" },
        1: { cellWidth: 35, halign: "right" },
      },
      styles: { cellPadding: 1.5 },
      margin: { left: pageWidth - 110, right: 14 },
      didParseCell: (data: any) => {
        // Highlight RRP inc GST row
        if (data.row.index === 5) {
          data.cell.styles.fillColor = [252, 240, 235];
          data.cell.styles.textColor = [196, 93, 62];
          data.cell.styles.fontStyle = "bold";
        }
      },
    });

    y = (doc as any).lastAutoTable.finalY + 12;
  });

  // Site Layout page (combined multi-unit plan)
  if (options.siteLayoutImage) {
    doc.addPage();
    doc.setFontSize(13);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(60, 50, 45);
    doc.text("Site Layout — Combined Unit Plan", 14, 18);
    try {
      const imgW = pageWidth - 28;
      const imgH = imgW * 0.7;
      doc.addImage(options.siteLayoutImage, "PNG", 14, 26, imgW, imgH);
    } catch { /* image failed */ }
  }

  // Property Site Plan page (satellite + parcel boundary)
  if (options.propertySitePlanImage) {
    doc.addPage();
    doc.setFontSize(13);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(60, 50, 45);
    doc.text("Property Site Plan", 14, 18);
    try {
      const imgW = pageWidth - 28;
      const imgH = imgW * 0.75;
      doc.addImage(options.propertySitePlanImage, "PNG", 14, 26, imgW, imgH);
    } catch { /* image failed */ }
  }

  // Raked Elevation Diagrams (installer reference)
  if (options.rakedElevationImages && options.rakedElevationImages.length > 0) {
    doc.addPage();
    doc.setFontSize(13);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(60, 50, 45);
    doc.text("Raked Roof \u2014 Side Elevation Diagrams", 14, 18);
    let elevY = 28;
    const elevImgW = pageWidth - 28;
    const elevImgH = elevImgW * (340 / 560); // match canvas aspect ratio
    for (const img of options.rakedElevationImages) {
      if (elevY + elevImgH + 14 > doc.internal.pageSize.getHeight() - 20) {
        doc.addPage();
        elevY = 18;
      }
      doc.setFontSize(9);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(80, 80, 80);
      doc.text(`Unit ${img.unitIndex + 1} \u2014 Side Elevation`, 14, elevY);
      elevY += 4;
      try {
        doc.addImage(img.dataUrl, "PNG", 14, elevY, elevImgW, elevImgH);
      } catch { /* image failed */ }
      elevY += elevImgH + 10;
    }
  }

  // Technical Appendix — Proposal Images
  if (options.proposalImages && options.proposalImages.length > 0) {
    drawProposalImagesAppendix(doc, options.proposalImages);
  }

  // Validation Summary Checklist page (always included in management PDF)
  drawValidationSummaryPage(doc, units);

  drawFooter(doc, "Eclipse Opening Roof \u2014 Management Report");
  if (options.internalUseOnly) { applyInternalUseWatermark(doc); }

  const filename = `Eclipse_Management_${quoteNumber}_${new Date().toISOString().slice(0, 10)}.pdf`;
  if (options.previewOnly) {
    const blob = doc.output("blob");
    return { blob, filename };
  }
  savePdfReliably(doc, filename);
  return undefined;
}

// ─── Proposal Images Technical Appendix ─────────────────────────────────────

/**
 * Draws technical appendix pages with proposal/engineering images.
 * Each image gets its own page with title and description.
 */
function drawProposalImagesAppendix(doc: jsPDF, images: ProposalImageData[]) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  // Appendix title page
  doc.addPage();
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(60, 50, 45);
  doc.text("Technical Appendix", 14, 24);
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(120, 110, 100);
  doc.text("Eclipse Opening Roof System — Engineering & Product Details", 14, 32);

  let y = 44;
  doc.setFontSize(9);
  doc.setTextColor(80, 75, 70);
  images.forEach((img, i) => {
    doc.text(`${i + 1}. ${img.name}`, 18, y);
    y += 5;
  });

  // Individual image pages
  for (const img of images) {
    doc.addPage();

    // Title bar
    doc.setFillColor(60, 50, 45);
    doc.rect(0, 0, pageWidth, 20, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text(img.name, 14, 13);

    // Description
    let imgY = 26;
    if (img.description) {
      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(80, 75, 70);
      const descLines = doc.splitTextToSize(img.description, pageWidth - 28);
      doc.text(descLines, 14, imgY);
      imgY += descLines.length * 4.5 + 4;
    }

    // Image
    try {
      const maxImgW = pageWidth - 28;
      const maxImgH = pageHeight - imgY - 20;
      // Auto-detect format from data URL MIME type
      const imgFormat = img.imageUrl.startsWith("data:image/jpeg") ? "JPEG" : "PNG";
      doc.addImage(img.imageUrl, imgFormat, 14, imgY, maxImgW, Math.min(maxImgH, maxImgW * 0.7));
    } catch {
      // Image failed to render
      doc.setFontSize(10);
      doc.setTextColor(200, 100, 100);
      doc.text("[Image could not be loaded]", 14, imgY + 10);
    }
  }
}

// ─── Validation Summary Checklist Page ──────────────────────────────────────
/**
 * Draws a validation summary checklist page showing all validation results per unit.
 * Includes pass/fail status for each check and an overall compliance summary.
 */
function drawValidationSummaryPage(doc: jsPDF, units: UnitInput[]) {
  const validationErrors = validateAllUnits(units);
  const pageWidth = doc.internal.pageSize.getWidth();

  doc.addPage();
  let y = 18;

  // Title
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(60, 50, 45);
  doc.text("Engineering Validation Summary", 14, y);
  y += 8;

  // Overall status
  const errorCount = validationErrors.filter(e => e.severity === "error").length;
  const warningCount = validationErrors.filter(e => e.severity === "warning").length;

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  if (errorCount === 0 && warningCount === 0) {
    doc.setTextColor(34, 139, 34);
    doc.text("\u2713 All units pass engineering validation — no errors or warnings", 14, y);
  } else {
    if (errorCount > 0) {
      doc.setTextColor(200, 50, 50);
      doc.text(`\u2717 ${errorCount} error(s) require resolution before proceeding`, 14, y);
    } else {
      doc.setTextColor(180, 120, 0);
      doc.text(`\u26A0 ${warningCount} advisory warning(s) — review recommended`, 14, y);
    }
  }
  y += 10;

  // Per-unit validation table
  const tableData: string[][] = [];
  for (let i = 0; i < units.length; i++) {
    const unitErrors = validationErrors.filter(e => e.field.startsWith(`Unit ${i + 1}`) || e.message.startsWith(`Unit ${i + 1}`));
    const unitErrorCount = unitErrors.filter(e => e.severity === "error").length;
    const unitWarningCount = unitErrors.filter(e => e.severity === "warning").length;

    // Dimension checks
    const u = units[i];
    const dimStatus = (u.bladeWidth >= 1500 && u.bladeWidth <= 4200 && u.length >= 1500 && u.length <= 6500 && u.height >= 2100 && u.height <= 3600) ? "\u2713 Pass" : "\u2717 Fail";
    const bracketStatus = (u.attachmentMethod === "None" || ((u.fasciaBrackets || 0) + (u.extendaBrackets || 0) + (u.wallFixingBeam || 0) + (u.wallFixingBracket || 0)) > 0) ? "\u2713 Pass" : "\u26A0 Review";
    const postStatus = (u.mountType === "Freestanding" && u.posts < 4) ? "\u26A0 Review" : "\u2713 Pass";
    const overallStatus = unitErrorCount > 0 ? `\u2717 ${unitErrorCount} Error(s)` : unitWarningCount > 0 ? `\u26A0 ${unitWarningCount} Warning(s)` : "\u2713 Pass";

    tableData.push([
      `Unit ${i + 1}`,
      `${u.bladeWidth}×${u.length}×${u.height}mm`,
      dimStatus,
      bracketStatus,
      postStatus,
      overallStatus,
    ]);
  }

  autoTable(doc, {
    startY: y,
    head: [["Unit", "Dimensions (W×L×H)", "Dim. Limits", "Brackets", "Posts", "Status"]],
    body: tableData,
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [45, 80, 70], textColor: [255, 255, 255], fontStyle: "bold" },
    columnStyles: {
      0: { cellWidth: 18 },
      1: { cellWidth: 42 },
      2: { cellWidth: 22 },
      3: { cellWidth: 22 },
      4: { cellWidth: 22 },
      5: { cellWidth: 35 },
    },
    margin: { left: 14, right: 14 },
  });

  y = (doc as any).lastAutoTable?.finalY || y + 40;
  y += 8;

  // Detailed issues list
  if (validationErrors.length > 0) {
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(60, 50, 45);
    doc.text("Detailed Issues:", 14, y);
    y += 6;

    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");

    for (const err of validationErrors) {
      if (y > 270) {
        doc.addPage();
        y = 18;
      }
      const icon = err.severity === "error" ? "\u2717" : "\u26A0";
      doc.setTextColor(err.severity === "error" ? 200 : 180, err.severity === "error" ? 50 : 120, err.severity === "error" ? 50 : 0);
      const lines = doc.splitTextToSize(`${icon} [${err.field}] ${err.message}`, pageWidth - 28);
      doc.text(lines, 14, y);
      y += lines.length * 4 + 2;
    }
  }

  // Sign-off section
  y += 12;
  if (y > 240) { doc.addPage(); y = 18; }
  doc.setDrawColor(60, 50, 45);
  doc.setLineWidth(0.5);
  doc.line(14, y, pageWidth - 14, y);
  y += 8;
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(60, 50, 45);
  doc.text("Pre-Construction Sign-Off", 14, y);
  y += 7;
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(80, 80, 80);
  doc.text("I confirm that the above validation checks have been reviewed and all errors resolved", 14, y);
  doc.text("prior to commencing construction.", 14, y + 4);
  y += 16;
  // Signature lines
  doc.setDrawColor(180, 180, 180);
  doc.setLineWidth(0.3);
  doc.line(14, y, 90, y);
  doc.line(110, y, 186, y);
  y += 5;
  doc.setFontSize(7);
  doc.setTextColor(120, 120, 120);
  doc.text("Reviewed by (name)", 14, y);
  doc.text("Date", 110, y);
  y += 12;
  doc.line(14, y, 90, y);
  doc.line(110, y, 186, y);
  y += 5;
  doc.text("Signature", 14, y);
  doc.text("Position / Role", 110, y);

  // Timestamp
  y += 12;
  if (y > 285) { doc.addPage(); y = 18; }
  doc.setFontSize(7);
  doc.setFont("helvetica", "italic");
  doc.setTextColor(150, 150, 150);
  doc.text(`Validation generated: ${new Date().toLocaleString("en-AU", { dateStyle: "medium", timeStyle: "short" })}`, 14, y);
}
