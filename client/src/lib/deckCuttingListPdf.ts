/**
 * deckCuttingListPdf.ts — Standalone single-page A4 cutting list PDF
 * for workshop/site use. Shows framing member schedule with member type,
 * size, quantity, and length in a clean tabular format.
 */

import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { loadCompanyDetails, loadCustomLogo } from "./proposalStore";
import { logClientDownload } from "./userActivity";
import type { SubfloorInputs, SubfloorResult, OptionResult, BearerLine } from "../../../shared/subfloor-calc";

// ─── Types ─────────────────────────────────────────────────────────────────

export interface CuttingListPdfOptions {
  quoteNumber: string;
  clientName: string;
  siteAddress?: string;
  deckWidthM: number;
  deckProjectionM: number;
  productName?: string;
  colourName?: string;

  subfloorResult: SubfloorResult;
  subfloorInputs: SubfloorInputs;
  activeOption?: "A" | "B";
}

interface CuttingListRow {
  member: string;
  size: string;
  length: number; // mm
  qty: number;
  notes: string;
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function fmtLen(mm: number): string {
  return mm >= 1000 ? `${(mm / 1000).toFixed(mm % 1000 === 0 ? 0 : 1)}m` : `${Math.round(mm)}mm`;
}

function buildCuttingListRows(option: OptionResult, inputs: SubfloorInputs): CuttingListRow[] {
  const rows: CuttingListRow[] = [];
  const boardLayout = inputs.boardLayout;
  const boardWidth = boardLayout?.boardWidth || 138;
  const hasPictureFrame = boardLayout?.pictureFrame && boardLayout.pictureFrame !== "none";
  const hasBreaker = boardLayout?.breakerBoard && boardLayout.breakerBoard !== "none";
  const isDouble = boardLayout?.pictureFrame === "double";
  const isDoubleBreaker = boardLayout?.breakerBoard === "double";

  const joistSize = option.profile.label;
  const bearerSize = option.bearerProfile.label;

  // Perimeter frame
  rows.push({ member: "Perimeter Frame (Top/Bottom)", size: bearerSize, length: inputs.length, qty: 2, notes: "Outer frame horizontal" });
  rows.push({ member: "Perimeter Frame (Left/Right)", size: bearerSize, length: inputs.width, qty: 2, notes: "Outer frame vertical" });

  // Edge beams (inner frame)
  if (hasPictureFrame) {
    const edgeInset = boardWidth;
    const innerLength = inputs.length - 2 * edgeInset;
    const innerWidth = inputs.width - 2 * edgeInset;
    const multiplier = isDouble ? 2 : 1;

    rows.push({ member: "Edge Beam (Top/Bottom)", size: joistSize, length: Math.round(innerLength), qty: 2 * multiplier, notes: `Inner frame horiz${isDouble ? " (double)" : ""}` });
    rows.push({ member: "Edge Beam (Left/Right)", size: joistSize, length: Math.round(innerWidth), qty: 2 * multiplier, notes: `Inner frame vert${isDouble ? " (double)" : ""}` });

    const topBottomNoggins = Math.max(2, Math.ceil(inputs.length / option.joistCentres) + 1);
    const leftRightNoggins = Math.max(2, Math.ceil(inputs.width / option.joistCentres) + 1);
    rows.push({ member: "Noggin (Top/Bottom Edge)", size: joistSize, length: edgeInset, qty: topBottomNoggins * 2, notes: `@ ${option.joistCentres}mm c/c` });
    rows.push({ member: "Noggin (Left/Right Edge)", size: joistSize, length: edgeInset, qty: leftRightNoggins * 2, notes: `@ ${option.joistCentres}mm c/c` });
  }

  // Breaker beams
  if (hasBreaker) {
    const breakerMult = isDoubleBreaker ? 2 : 1;
    const bDir = boardLayout?.breakerDirection || "along-width";
    const breakerLen = (bDir === "along-width" ? inputs.width : inputs.length) - (hasPictureFrame ? 2 * boardWidth : 0);
    rows.push({ member: "Breaker Beam", size: joistSize, length: breakerLen, qty: 2 * breakerMult, notes: `Paired at breaker (${bDir === "along-width" ? "along width" : "along length"})${isDoubleBreaker ? " (double)" : ""}` });
    const breakerNogginSpan = bDir === "along-width" ? inputs.width : inputs.length;
    const breakerNoggins = Math.max(2, Math.ceil(breakerNogginSpan / option.joistCentres) + 1);
    rows.push({ member: "Noggin (Breaker)", size: joistSize, length: Math.round(boardWidth * 0.9), qty: breakerNoggins * breakerMult, notes: `@ ${option.joistCentres}mm c/c` });
  }

  // Joists
  rows.push({ member: "Joist", size: joistSize, length: option.joistLength, qty: option.joistCount, notes: `@ ${option.joistCentres}mm centres` });

  // Structural bearers
  const structBearers = option.bearerLines.filter((bl: BearerLine) => bl.type === "structural" && !bl.isWallAttached);
  if (structBearers.length > 0) {
    rows.push({ member: "Bearer (Structural)", size: bearerSize, length: option.bearerLength, qty: structBearers.length, notes: "Intermediate support" });
  }

  // Waling plate (ledger board) — when wall-mounted
  if (inputs.wall === "wall-mounted") {
    rows.push({ member: "Waling Plate (Ledger)", size: bearerSize, length: inputs.length, qty: 1, notes: "Fixed to wall, M12 anchors @ 600mm c/c" });
  }

  // Posts
  rows.push({ member: "Post", size: "90 \u00D7 90 mm", length: Math.round((inputs.minHeight + inputs.maxHeight) / 2), qty: option.postCount, notes: `${inputs.minHeight}\u2013${inputs.maxHeight}mm range` });

  return rows;
}

// ─── PDF Generator ─────────────────────────────────────────────────────────

export async function generateCuttingListPdf(
  options: CuttingListPdfOptions,
  mode: "download" | "preview" = "download"
): Promise<void> {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();

  // Load branding
  const company = loadCompanyDetails();
  const customLogo = loadCustomLogo();
  let logoData: string | null = null;
  if (customLogo?.dataUrl) {
    logoData = customLogo.dataUrl;
  }

  // ─── Header Bar ──────────────────────────────────────────────────────────
  doc.setFillColor(30, 41, 59); // slate-800
  doc.rect(0, 0, pageWidth, 28, "F");

  let textX = 14;
  if (logoData) {
    try {
      doc.addImage(logoData, "PNG", 10, 2, 24, 24);
      textX = 38;
    } catch { /* logo failed */ }
  }

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text("Framing Cutting List", textX, 12);
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text("Workshop / Site Reference", textX, 19);

  // Date on right
  doc.setFontSize(8);
  const dateStr = new Date().toLocaleDateString("en-AU", { day: "2-digit", month: "long", year: "numeric" });
  doc.text(`Generated: ${dateStr}`, pageWidth - 14, 12, { align: "right" });
  if (company.companyName) {
    doc.setFontSize(7);
    doc.text(company.companyName, pageWidth - 14, 18, { align: "right" });
  }

  // ─── Job Reference Section ───────────────────────────────────────────────
  let y = 34;
  doc.setTextColor(30, 41, 59);
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.text("Job Reference", 14, y);
  y += 5;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  const refLines: string[] = [];
  refLines.push(`Quote: ${options.quoteNumber}`);
  refLines.push(`Client: ${options.clientName}`);
  if (options.siteAddress) refLines.push(`Site: ${options.siteAddress}`);
  refLines.push(`Deck: ${options.deckWidthM.toFixed(1)}m × ${options.deckProjectionM.toFixed(1)}m = ${(options.deckWidthM * options.deckProjectionM).toFixed(1)}m²`);
  if (options.productName) refLines.push(`Product: ${options.productName}${options.colourName ? ` (${options.colourName})` : ""}`);

  for (const line of refLines) {
    doc.text(line, 14, y);
    y += 4;
  }
  y += 3;

  // ─── Cutting List Table ──────────────────────────────────────────────────
  const option: OptionResult = options.activeOption === "B" ? options.subfloorResult.optionB : options.subfloorResult.optionA;
  const rows = buildCuttingListRows(option, options.subfloorInputs);

  // Calculate totals
  const totalLinearM = rows.reduce((sum, r) => sum + r.length * r.qty, 0) / 1000;
  const totalPieces = rows.reduce((sum, r) => sum + r.qty, 0);

  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.text("Member Schedule", 14, y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.text(`${totalPieces} pieces | ${totalLinearM.toFixed(1)} lin.m total`, pageWidth - 14, y, { align: "right" });
  y += 3;

  const tableBody = rows.map(r => [
    r.member,
    r.size,
    fmtLen(r.length),
    String(r.qty),
    `${((r.length * r.qty) / 1000).toFixed(1)}m`,
    r.notes,
  ]);

  autoTable(doc, {
    startY: y,
    head: [["Member", "Size", "Length", "Qty", "Lin.m", "Notes"]],
    body: tableBody,
    theme: "grid",
    headStyles: { fillColor: [45, 120, 100], textColor: 255, fontStyle: "bold", fontSize: 8 },
    bodyStyles: { fontSize: 8, textColor: [50, 50, 50] },
    alternateRowStyles: { fillColor: [245, 248, 250] },
    columnStyles: {
      0: { fontStyle: "bold", cellWidth: 50 },
      1: { cellWidth: 28 },
      2: { halign: "right", cellWidth: 20 },
      3: { halign: "center", cellWidth: 14 },
      4: { halign: "right", cellWidth: 18 },
      5: { cellWidth: 46 },
    },
    styles: { cellPadding: 2 },
    margin: { left: 14, right: 14 },
  });

  y = (doc as any).lastAutoTable.finalY + 6;

  // ─── Summary Footer ──────────────────────────────────────────────────────
  doc.setDrawColor(200, 200, 200);
  doc.line(14, y, pageWidth - 14, y);
  y += 5;

  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(30, 41, 59);
  doc.text("Totals:", 14, y);
  doc.setFont("helvetica", "normal");
  doc.text(`${totalPieces} pieces`, 40, y);
  doc.text(`${totalLinearM.toFixed(1)} linear metres`, 70, y);

  const optLabel = options.activeOption === "B" ? "Option B" : "Option A";
  doc.text(`Framing: ${optLabel} — Joists @ ${option.joistCentres}mm c/c`, 110, y);

  // ─── Page Footer ─────────────────────────────────────────────────────────
  doc.setFontSize(7);
  doc.setTextColor(160, 150, 140);
  doc.text(
    `${options.quoteNumber} — Framing Cutting List — Page 1 of 1`,
    pageWidth / 2,
    doc.internal.pageSize.getHeight() - 8,
    { align: "center" }
  );

  // ─── Output ──────────────────────────────────────────────────────────────
  const blob = doc.output("blob");
  const url = URL.createObjectURL(blob);

  if (mode === "preview") {
    window.open(url, "_blank");
  } else {
    const a = document.createElement("a");
    a.href = url;
    a.download = `${options.quoteNumber}-cutting-list.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    logClientDownload({
      filename: `${options.quoteNumber}-cutting-list.pdf`,
      source: "deck_cutting_list_pdf",
      entityType: "deck_quote",
      entityId: options.quoteNumber,
      mimeType: "application/pdf",
      metadata: { clientName: options.clientName },
    });
  }
}

// Export the row builder for testing
export { buildCuttingListRows };
export type { CuttingListRow };
