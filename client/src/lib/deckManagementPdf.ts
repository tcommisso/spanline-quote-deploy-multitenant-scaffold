/**
 * Deck Management Report — PDF Export (Admin-only)
 * Full material breakdown, cutting optimiser results, labour, margins, and net profit.
 * Mirrors the Eclipse Management PDF structure adapted for deck quotes.
 */

import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { applyInternalUseWatermark } from "./pdfWatermark";
import { loadCompanyDetails, loadCustomLogo, type CustomLogo, type CompanyDetails } from "./proposalStore";
import { logClientDownload } from "./userActivity";
import type { DeckCalcResult } from "../../../server/deck-calc";
import type { SubfloorInputs, SubfloorResult, OptionResult } from "../../../shared/subfloor-calc";
import type { CuttingResult, MaterialSummary } from "../../../shared/cuttingOptimiser";
import type { BoardCutPlan } from "../../../shared/boardCutPlan";

// ─── Types ─────────────────────────────────────────────────────────────────

export interface DeckManagementPDFOptions {
  quoteNumber: string;
  clientName: string;
  clientPhone?: string;
  clientEmail?: string;
  siteAddress?: string;

  // Deck specs
  deckWidthM: number;
  deckProjectionM: number;
  areaM2: number;
  perimeterM: number;
  deckShape: string;
  productName: string;
  colourName: string;
  framingSystem: string;

  // Pricing result
  calcResult: DeckCalcResult;
  marginPercent: number;

  // Engineering result
  subfloorResult?: SubfloorResult;
  subfloorInputs?: SubfloorInputs;
  activeOption?: "A" | "B";

  // Cutting optimiser result
  cuttingResult?: CuttingResult;
  boardCutPlan?: BoardCutPlan;

  // Board layout summary
  boardDirection?: string;
  pictureFrame?: string;
  breakerBoard?: string;
  staggerPattern?: string;

  // Stair data
  stairSummary?: {
    type: string;
    risers: number;
    goings: number;
    width: number;
    totalRise: number;
    stringerLength: number;
    treads: number;
  };

  // SVG diagram images (data URLs captured from DOM)
  planViewImageDataUrl?: string;
  boardLayoutImageDataUrl?: string;
  sideElevationImageDataUrl?: string;

  // AI render image (data URL or remote URL)
  aiRenderImageDataUrl?: string;

  // Options
  internalUseOnly?: boolean;
  /** If true, returns a blob for preview instead of triggering download */
  previewOnly?: boolean;
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function fmt(val: number): string {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    minimumFractionDigits: 2,
  }).format(val);
}

function fmtNum(val: number, decimals = 1): string {
  return val.toFixed(decimals);
}

function savePdfReliably(doc: jsPDF, filename: string) {
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
    source: "deck_management_pdf",
    entityType: "deck_quote",
    mimeType: "application/pdf",
  });
}

function getLogoData(): string | null {
  const logo: CustomLogo | null = loadCustomLogo();
  return logo?.dataUrl ?? null;
}

// ─── PDF Sections ──────────────────────────────────────────────────────────

function drawHeader(doc: jsPDF, logoData: string | null, company: CompanyDetails) {
  const pageWidth = doc.internal.pageSize.getWidth();
  // Dark header bar
  doc.setFillColor(30, 41, 59); // slate-800
  doc.rect(0, 0, pageWidth, 36, "F");

  let textX = 14;
  if (logoData) {
    try {
      doc.addImage(logoData, "PNG", 10, 3, 30, 30);
      textX = 44;
    } catch { /* logo failed */ }
  }

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.text("Deck Quote", textX, 15);
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text("Management Report", textX, 23);

  // Date on right
  doc.setFontSize(8);
  const dateStr = new Date().toLocaleDateString("en-AU", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
  doc.text(`Generated: ${dateStr}`, pageWidth - 14, 15, { align: "right" });

  if (company.companyName) {
    doc.setFontSize(7);
    doc.text(company.companyName, pageWidth - 14, 22, { align: "right" });
  }
}

function drawFooter(doc: jsPDF) {
  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setFontSize(7);
    doc.setTextColor(160, 150, 140);
    doc.text(
      `Deck Quote — Management Report — Page ${p} of ${totalPages}`,
      doc.internal.pageSize.getWidth() / 2,
      doc.internal.pageSize.getHeight() - 8,
      { align: "center" }
    );
  }
}

function drawCustomerDetails(doc: jsPDF, options: DeckManagementPDFOptions, y: number): number {
  const { quoteNumber, clientName, clientPhone, clientEmail, siteAddress } = options;

  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(30, 41, 59);
  doc.text("Customer Details", 14, y);
  y += 6;

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(71, 85, 105);

  if (quoteNumber) {
    doc.setFont("helvetica", "bold");
    doc.text(`Quote Ref: ${quoteNumber}`, 14, y);
    doc.setFont("helvetica", "normal");
    y += 5;
  }
  if (clientName) { doc.text(`Client: ${clientName}`, 14, y); y += 5; }
  if (clientPhone) { doc.text(`Phone: ${clientPhone}`, 14, y); y += 5; }
  if (clientEmail) { doc.text(`Email: ${clientEmail}`, 14, y); y += 5; }
  if (siteAddress) {
    const lines = doc.splitTextToSize(`Address: ${siteAddress}`, 120);
    doc.text(lines, 14, y);
    y += lines.length * 4.5;
  }

  y += 4;
  return y;
}

function drawDeckSpecifications(doc: jsPDF, options: DeckManagementPDFOptions, y: number): number {
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(30, 41, 59);
  doc.text("Deck Specifications", 14, y);
  y += 7;

  const specRows: string[][] = [
    ["Deck Shape", options.deckShape || "Rectangle"],
    ["Dimensions", `${options.deckWidthM}m × ${options.deckProjectionM}m`],
    ["Area", `${fmtNum(options.areaM2, 2)} m²`],
    ["Perimeter", `${fmtNum(options.perimeterM, 1)} m`],
    ["Product", options.productName],
    ["Colour", options.colourName],
    ["Framing System", options.framingSystem],
    ["Board Direction", options.boardDirection || "Parallel"],
    ["Picture Frame", options.pictureFrame || "None"],
    ["Breaker Board", options.breakerBoard || "None"],
    ["Stagger Pattern", options.staggerPattern || "Random"],
  ];

  autoTable(doc, {
    startY: y,
    body: specRows,
    theme: "plain",
    bodyStyles: { fontSize: 8 },
    columnStyles: {
      0: { cellWidth: 45, fontStyle: "bold", textColor: [71, 85, 105] },
      1: { cellWidth: "auto" },
    },
    styles: { cellPadding: 1.5 },
    margin: { left: 14, right: 14 },
  });

  y = (doc as any).lastAutoTable.finalY + 6;
  return y;
}

function drawPricingSummary(doc: jsPDF, options: DeckManagementPDFOptions, y: number): number {
  const { calcResult, marginPercent } = options;

  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(30, 41, 59);
  doc.text("Pricing Summary", 14, y);
  y += 7;

  // Main pricing table
  autoTable(doc, {
    startY: y,
    head: [["Sell (ex GST)", "GST", "Sell (inc GST)", "Hard Cost", "Margin $", "Margin %"]],
    body: [[
      fmt(calcResult.sellPriceExGst),
      fmt(calcResult.gstAmount),
      fmt(calcResult.sellPriceIncGst),
      fmt(calcResult.hardCostSubtotal),
      fmt(calcResult.marginAmount),
      `${calcResult.effectiveMarginPercent.toFixed(1)}%`,
    ]],
    theme: "grid",
    headStyles: { fillColor: [30, 41, 59], textColor: 255, fontStyle: "bold", fontSize: 8 },
    bodyStyles: { fontSize: 9, fontStyle: "bold", halign: "center" },
    styles: { cellPadding: 3 },
    margin: { left: 14, right: 14 },
  });

  y = (doc as any).lastAutoTable.finalY + 6;

  // Detailed cost breakdown
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(30, 41, 59);
  doc.text("Cost Breakdown", 14, y);
  y += 6;

  const costRows: string[][] = [
    ["Decking Material", fmt(calcResult.deckingMaterialCost)],
    ["Clip / Fixing", fmt(calcResult.clipFixingCost)],
    ...(calcResult.wasteCost > 0 ? [["Waste Allowance", fmt(calcResult.wasteCost)]] : []),
    ["Framing (Subfloor)", fmt(calcResult.framingCost)],
    ["Materials Subtotal", fmt(calcResult.materialsSubtotal)],
    ["", ""],
    ["Base Labour", fmt(calcResult.baseLabour)],
    [`Complexity (×${calcResult.complexityMultiplier.toFixed(3)})`, fmt(calcResult.adjustedLabour)],
    ["", ""],
  ];

  // Add-ons
  if (calcResult.stairsCost > 0) costRows.push(["Stairs", fmt(calcResult.stairsCost)]);
  if (calcResult.handrailCost > 0) costRows.push(["Handrail", fmt(calcResult.handrailCost)]);
  if (calcResult.screensCost > 0) costRows.push(["Screens", fmt(calcResult.screensCost)]);
  if (calcResult.lightingCost > 0) costRows.push(["Lighting", fmt(calcResult.lightingCost)]);
  if (calcResult.demolitionCost > 0) costRows.push(["Demolition", fmt(calcResult.demolitionCost)]);
  if (calcResult.disposalCost > 0) costRows.push(["Disposal", fmt(calcResult.disposalCost)]);
  if (calcResult.engineeringCost > 0) costRows.push(["Engineering", fmt(calcResult.engineeringCost)]);
  if (calcResult.permitCost > 0) costRows.push(["Permit", fmt(calcResult.permitCost)]);
  if (calcResult.dynamicAddonsCost > 0) costRows.push(["Other Add-ons", fmt(calcResult.dynamicAddonsCost)]);
  if (calcResult.addonsSubtotal > 0) costRows.push(["Add-ons Subtotal", fmt(calcResult.addonsSubtotal)]);

  costRows.push(["", ""]);
  costRows.push(["Delivery", fmt(calcResult.deliveryTotal)]);
  costRows.push(["", ""]);
  costRows.push(["HARD COST TOTAL", fmt(calcResult.hardCostSubtotal)]);
  costRows.push([`Margin (${marginPercent}%)`, fmt(calcResult.marginAmount)]);
  costRows.push(["SELL PRICE (ex GST)", fmt(calcResult.sellPriceExGst)]);
  costRows.push(["GST (10%)", fmt(calcResult.gstAmount)]);
  costRows.push(["SELL PRICE (inc GST)", fmt(calcResult.sellPriceIncGst)]);
  costRows.push(["Deposit", fmt(calcResult.depositAmount)]);

  autoTable(doc, {
    startY: y,
    body: costRows,
    theme: "plain",
    bodyStyles: { fontSize: 8 },
    columnStyles: {
      0: { cellWidth: 60, fontStyle: "bold" },
      1: { cellWidth: 35, halign: "right" },
    },
    styles: { cellPadding: 1.5 },
    margin: { left: 14, right: 14 },
    didParseCell: (data: any) => {
      const label = data.row.raw?.[0] || "";
      if (label === "HARD COST TOTAL" || label === "SELL PRICE (inc GST)") {
        data.cell.styles.fillColor = [241, 245, 249]; // slate-100
        data.cell.styles.fontStyle = "bold";
      }
      if (label === "SELL PRICE (inc GST)") {
        data.cell.styles.textColor = [22, 163, 74]; // green-600
      }
      if (label === "Materials Subtotal" || label === "Add-ons Subtotal") {
        data.cell.styles.fillColor = [248, 250, 252]; // slate-50
      }
    },
  });

  y = (doc as any).lastAutoTable.finalY + 6;
  return y;
}

function drawFramingBOM(doc: jsPDF, options: DeckManagementPDFOptions, y: number): number {
  const { subfloorResult, activeOption } = options;
  if (!subfloorResult) return y;

  const option: OptionResult = activeOption === "B" ? subfloorResult.optionB : subfloorResult.optionA;

  // Check if we need a new page
  if (y > 220) { doc.addPage(); y = 15; }

  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(30, 41, 59);
  doc.text(`Framing BOM — Option ${activeOption || "A"}`, 14, y);
  y += 7;

  const framingRows: string[][] = [
    ["Joist Profile", option.profile.label],
    ["Joist Count", `${option.joistCount}`],
    ["Joist Length", `${option.joistLength} mm`],
    ["Joist Centres", `${option.joistCentres} mm`],
    ["Joists Cost", fmt(option.joistsCost)],
    ["Bearer Profile", option.bearerProfile.label],
    ["Bearer Count", `${option.bearerCount}`],
    ["Bearer Length", `${option.bearerLength} mm`],
    ["Bearers Cost", fmt(option.bearersCost)],
    ["Post Count", `${option.postCount}`],
    ["Total Framing Cost", fmt(option.totalCost)],
  ];

  autoTable(doc, {
    startY: y,
    body: framingRows,
    theme: "striped",
    bodyStyles: { fontSize: 8 },
    columnStyles: {
      0: { cellWidth: 50, fontStyle: "bold", textColor: [71, 85, 105] },
      1: { cellWidth: "auto" },
    },
    styles: { cellPadding: 2 },
    margin: { left: 14, right: 14 },
    didParseCell: (data: any) => {
      const label = data.row.raw?.[0] || "";
      if (label === "Total Framing Cost") {
        data.cell.styles.fillColor = [241, 245, 249];
        data.cell.styles.fontStyle = "bold";
      }
    },
  });

  y = (doc as any).lastAutoTable.finalY + 6;

  // Post schedule
  if (option.bearerLines && option.bearerLines.length > 0) {
    if (y > 240) { doc.addPage(); y = 15; }

    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(30, 41, 59);
    doc.text("Post Schedule", 14, y);
    y += 5;

    const postRows: string[][] = [];
    option.bearerLines.forEach((bl) => {
      bl.posts.forEach((post) => {
        postRows.push([
          post.label,
          `B${bl.index + 1}${bl.isWallAttached ? " (wall)" : ""}`,
          `${post.x.toLocaleString()} mm`,
          `${post.y.toLocaleString()} mm`,
        ]);
      });
    });

    autoTable(doc, {
      startY: y,
      head: [["Label", "Bearer", "X", "Y"]],
      body: postRows,
      theme: "striped",
      headStyles: { fillColor: [71, 85, 105], textColor: 255, fontSize: 7 },
      bodyStyles: { fontSize: 7 },
      columnStyles: {
        0: { cellWidth: 20, fontStyle: "bold" },
        1: { cellWidth: 30 },
        2: { cellWidth: 25, halign: "right" },
        3: { cellWidth: 25, halign: "right" },
      },
      styles: { cellPadding: 1.5 },
      margin: { left: 14, right: 14 },
    });

    y = (doc as any).lastAutoTable.finalY + 6;
  }

  return y;
}

function drawFramingCuttingList(doc: jsPDF, options: DeckManagementPDFOptions, y: number): number {
  const { subfloorResult, subfloorInputs, activeOption } = options;
  if (!subfloorResult || !subfloorInputs) return y;

  const option: OptionResult = activeOption === "B" ? subfloorResult.optionB : subfloorResult.optionA;
  const boardLayout = subfloorInputs.boardLayout;
  const hasPictureFrame = boardLayout?.pictureFrame && boardLayout.pictureFrame !== "none";
  const hasBreaker = boardLayout?.breakerBoard && boardLayout.breakerBoard !== "none";
  const isDouble = boardLayout?.pictureFrame === "double";
  const isDoubleBreaker = boardLayout?.breakerBoard === "double";
  const boardWidth = boardLayout?.boardWidth || 138;
  const joistSize = option.profile.label;
  const bearerSize = option.bearerProfile.label;

  if (y > 200) { doc.addPage(); y = 15; }

  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(30, 41, 59);
  doc.text("Framing Cutting List", 14, y);
  y += 5;

  const fmtLen = (mm: number) => mm >= 1000 ? `${(mm / 1000).toFixed(mm % 1000 === 0 ? 0 : 1)}m` : `${Math.round(mm)}mm`;
  const rows: string[][] = [];

  // Perimeter frame
  rows.push(["Perimeter Frame (Top/Bottom)", bearerSize, fmtLen(subfloorInputs.length), "2", "Outer frame horizontal"]);
  rows.push(["Perimeter Frame (Left/Right)", bearerSize, fmtLen(subfloorInputs.width), "2", "Outer frame vertical"]);

  // Edge beams (inner frame)
  if (hasPictureFrame) {
    const edgeInset = boardWidth;
    const innerLength = subfloorInputs.length - 2 * edgeInset;
    const innerWidth = subfloorInputs.width - 2 * edgeInset;
    const multiplier = isDouble ? 2 : 1;
    rows.push(["Edge Beam (Top/Bottom)", joistSize, fmtLen(innerLength), String(2 * multiplier), `Inner frame horiz${isDouble ? " (double)" : ""}`]);
    rows.push(["Edge Beam (Left/Right)", joistSize, fmtLen(innerWidth), String(2 * multiplier), `Inner frame vert${isDouble ? " (double)" : ""}`]);

    const topBottomNoggins = Math.max(2, Math.ceil(subfloorInputs.length / option.joistCentres) + 1);
    const leftRightNoggins = Math.max(2, Math.ceil(subfloorInputs.width / option.joistCentres) + 1);
    rows.push(["Noggin (Top/Bottom Edge)", joistSize, fmtLen(edgeInset), String(topBottomNoggins * 2), `@ ${option.joistCentres}mm c/c`]);
    rows.push(["Noggin (Left/Right Edge)", joistSize, fmtLen(edgeInset), String(leftRightNoggins * 2), `@ ${option.joistCentres}mm c/c`]);
  }

  // Breaker beams
  if (hasBreaker) {
    const breakerMult = isDoubleBreaker ? 2 : 1;
    const bDir = boardLayout?.breakerDirection || "along-width";
    const breakerLen = (bDir === "along-width" ? subfloorInputs.width : subfloorInputs.length) - (hasPictureFrame ? 2 * boardWidth : 0);
    rows.push(["Breaker Beam", joistSize, fmtLen(breakerLen), String(2 * breakerMult), `Paired at breaker (${bDir === "along-width" ? "along width" : "along length"})${isDoubleBreaker ? " (double)" : ""}`]);
    const breakerNogginSpan = bDir === "along-width" ? subfloorInputs.width : subfloorInputs.length;
    const breakerNoggins = Math.max(2, Math.ceil(breakerNogginSpan / option.joistCentres) + 1);
    rows.push(["Noggin (Breaker)", joistSize, fmtLen(Math.round(boardWidth * 0.9)), String(breakerNoggins * breakerMult), `@ ${option.joistCentres}mm c/c`]);
  }

  // Joists
  rows.push(["Joist", joistSize, fmtLen(option.joistLength), String(option.joistCount), `@ ${option.joistCentres}mm centres`]);

  // Structural bearers
  const structBearers = option.bearerLines.filter(bl => bl.type === "structural" && !bl.isWallAttached);
  if (structBearers.length > 0) {
    rows.push(["Bearer (Structural)", bearerSize, fmtLen(option.bearerLength), String(structBearers.length), "Intermediate support"]);
  }

  // Waling plate (ledger board) — when wall-mounted
  if (subfloorInputs.wall === "wall-mounted") {
    rows.push(["Waling Plate (Ledger)", bearerSize, fmtLen(subfloorInputs.length), "1", "Fixed to wall, M12 anchors @ 600mm c/c"]);
  }

  // Posts
  rows.push(["Post", "90 × 90 mm", `${subfloorInputs.minHeight}\u2013${subfloorInputs.maxHeight}mm`, String(option.postCount), "Height range"]);

  autoTable(doc, {
    startY: y,
    head: [["Member", "Size", "Length", "Qty", "Notes"]],
    body: rows,
    theme: "grid",
    headStyles: { fillColor: [45, 120, 100], textColor: 255, fontStyle: "bold", fontSize: 7 },
    bodyStyles: { fontSize: 7, textColor: [50, 50, 50] },
    alternateRowStyles: { fillColor: [245, 248, 250] },
    columnStyles: {
      0: { fontStyle: "bold", cellWidth: 48 },
      1: { cellWidth: 28 },
      2: { halign: "right", cellWidth: 22 },
      3: { halign: "center", cellWidth: 14 },
      4: { cellWidth: 52 },
    },
    styles: { cellPadding: 1.5 },
    margin: { left: 14, right: 14 },
  });

  y = (doc as any).lastAutoTable.finalY + 6;
  return y;
}

function drawCuttingOptimiser(doc: jsPDF, options: DeckManagementPDFOptions, y: number): number {
  const { cuttingResult, boardCutPlan } = options;
  if (!cuttingResult) return y;

  // Check if we need a new page
  if (y > 200) { doc.addPage(); y = 15; }

  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(30, 41, 59);
  doc.text("Cutting Optimiser — Material Usage", 14, y);
  y += 7;

  // Summary per material
  const summaryRows: string[][] = cuttingResult.materialSummaries.map((ms: MaterialSummary) => [
    ms.label,
    `${ms.stockLength} mm`,
    `${ms.stockCount}`,
    `${(ms.totalCutsLength / 1000).toFixed(1)} m`,
    `${(ms.totalWaste / 1000).toFixed(1)} m`,
    `${ms.wastePercent.toFixed(1)}%`,
    `${ms.usableOffcuts}`,
  ]);

  autoTable(doc, {
    startY: y,
    head: [["Material", "Stock Length", "Stock Qty", "Used", "Waste", "Waste %", "Offcuts"]],
    body: summaryRows,
    theme: "grid",
    headStyles: { fillColor: [51, 65, 85], textColor: 255, fontSize: 7 },
    bodyStyles: { fontSize: 7 },
    columnStyles: {
      0: { cellWidth: 35, fontStyle: "bold" },
      1: { cellWidth: 22, halign: "right" },
      2: { cellWidth: 18, halign: "center" },
      3: { cellWidth: 20, halign: "right" },
      4: { cellWidth: 20, halign: "right" },
      5: { cellWidth: 18, halign: "center" },
      6: { cellWidth: 18, halign: "center" },
    },
    styles: { cellPadding: 2 },
    margin: { left: 14, right: 14 },
  });

  y = (doc as any).lastAutoTable.finalY + 4;

  // Totals row
  const totals = cuttingResult.totals;
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(71, 85, 105);
  doc.text(
    `Totals: ${totals.totalStockPieces} stock pieces | ${(totals.totalCutsLength / 1000).toFixed(1)}m used | ${(totals.totalWaste / 1000).toFixed(1)}m waste (${totals.overallWastePercent.toFixed(1)}%) | ${totals.usableOffcutCount} usable offcuts`,
    14, y
  );
  y += 6;

  // Naive vs Optimised comparison
  if (boardCutPlan) {
    const boardMaterial = cuttingResult.materialSummaries.find((m: MaterialSummary) => m.materialKey === "board");
    if (boardMaterial) {
      const naiveCount = boardCutPlan.totalStockBoards;
      const optimisedCount = boardMaterial.stockCount;
      const saved = naiveCount - optimisedCount;

      if (saved > 0) {
        doc.setFontSize(9);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(22, 163, 74); // green-600
        doc.text(`Board Optimisation: ${saved} fewer stock boards needed (${naiveCount} naive → ${optimisedCount} optimised)`, 14, y);
        y += 6;
      }
    }
  }

  y += 4;

  // Per-stock cut breakdown (first 30 pieces max to avoid excessive pages)
  if (cuttingResult.stockPieces.length > 0) {
    if (y > 220) { doc.addPage(); y = 15; }

    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(30, 41, 59);
    doc.text("Cut Breakdown (per stock piece)", 14, y);
    y += 5;

    const maxPieces = Math.min(cuttingResult.stockPieces.length, 40);
    const cutRows: string[][] = cuttingResult.stockPieces.slice(0, maxPieces).map((sp) => [
      `#${sp.index}`,
      sp.materialKey,
      sp.cuts.map((c) => `${c.cutLength}mm (${c.component})`).join(", "),
      `${sp.offcut}mm`,
      sp.offcutUsable ? "✓ Usable" : "Waste",
      `${sp.utilisation.toFixed(0)}%`,
    ]);

    autoTable(doc, {
      startY: y,
      head: [["#", "Material", "Cuts", "Offcut", "Status", "Util %"]],
      body: cutRows,
      theme: "striped",
      headStyles: { fillColor: [71, 85, 105], textColor: 255, fontSize: 6 },
      bodyStyles: { fontSize: 6 },
      columnStyles: {
        0: { cellWidth: 10 },
        1: { cellWidth: 18 },
        2: { cellWidth: "auto" },
        3: { cellWidth: 18, halign: "right" },
        4: { cellWidth: 18 },
        5: { cellWidth: 14, halign: "center" },
      },
      styles: { cellPadding: 1.2, overflow: "linebreak" },
      margin: { left: 14, right: 14 },
    });

    y = (doc as any).lastAutoTable.finalY + 4;

    if (cuttingResult.stockPieces.length > maxPieces) {
      doc.setFontSize(7);
      doc.setFont("helvetica", "italic");
      doc.setTextColor(120, 120, 120);
      doc.text(`... and ${cuttingResult.stockPieces.length - maxPieces} more stock pieces (truncated for brevity)`, 14, y);
      y += 6;
    }
  }

  return y;
}

function drawStairSummary(doc: jsPDF, options: DeckManagementPDFOptions, y: number): number {
  if (!options.stairSummary) return y;
  const stair = options.stairSummary;

  if (y > 240) { doc.addPage(); y = 15; }

  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(30, 41, 59);
  doc.text("Stair Design", 14, y);
  y += 7;

  const stairRows: string[][] = [
    ["Type", stair.type],
    ["Total Rise", `${stair.totalRise} mm`],
    ["Risers", `${stair.risers}`],
    ["Goings", `${stair.goings}`],
    ["Width", `${stair.width} mm`],
    ["Stringer Length", `${stair.stringerLength} mm`],
    ["Treads", `${stair.treads}`],
  ];

  autoTable(doc, {
    startY: y,
    body: stairRows,
    theme: "plain",
    bodyStyles: { fontSize: 8 },
    columnStyles: {
      0: { cellWidth: 45, fontStyle: "bold", textColor: [71, 85, 105] },
      1: { cellWidth: "auto" },
    },
    styles: { cellPadding: 1.5 },
    margin: { left: 14, right: 14 },
  });

  y = (doc as any).lastAutoTable.finalY + 6;
  return y;
}

function drawMarginAnalysis(doc: jsPDF, options: DeckManagementPDFOptions, y: number): number {
  const { calcResult, marginPercent } = options;

  if (y > 230) { doc.addPage(); y = 15; }

  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(30, 41, 59);
  doc.text("Margin Analysis", 14, y);
  y += 7;

  const sellEx = calcResult.sellPriceExGst;
  const hardCost = calcResult.hardCostSubtotal;
  const materialsCost = calcResult.materialsSubtotal;
  const labourCost = calcResult.adjustedLabour;
  const addonsCost = calcResult.addonsSubtotal;
  const deliveryCost = calcResult.deliveryTotal;

  // Cost composition percentages
  const materialsPercent = sellEx > 0 ? (materialsCost / sellEx * 100) : 0;
  const labourPercent = sellEx > 0 ? (labourCost / sellEx * 100) : 0;
  const addonsPercent = sellEx > 0 ? (addonsCost / sellEx * 100) : 0;
  const deliveryPercent = sellEx > 0 ? (deliveryCost / sellEx * 100) : 0;
  const marginPercentActual = calcResult.effectiveMarginPercent;

  const analysisRows: string[][] = [
    ["Materials", fmt(materialsCost), `${materialsPercent.toFixed(1)}%`],
    ["Labour", fmt(labourCost), `${labourPercent.toFixed(1)}%`],
    ["Add-ons", fmt(addonsCost), `${addonsPercent.toFixed(1)}%`],
    ["Delivery", fmt(deliveryCost), `${deliveryPercent.toFixed(1)}%`],
    ["Margin", fmt(calcResult.marginAmount), `${marginPercentActual.toFixed(1)}%`],
    ["Total (ex GST)", fmt(sellEx), "100.0%"],
  ];

  autoTable(doc, {
    startY: y,
    head: [["Component", "Amount", "% of Sell"]],
    body: analysisRows,
    theme: "grid",
    headStyles: { fillColor: [30, 41, 59], textColor: 255, fontSize: 8 },
    bodyStyles: { fontSize: 8 },
    columnStyles: {
      0: { cellWidth: 40, fontStyle: "bold" },
      1: { cellWidth: 35, halign: "right" },
      2: { cellWidth: 25, halign: "center" },
    },
    styles: { cellPadding: 2 },
    margin: { left: 14, right: 14 },
    didParseCell: (data: any) => {
      const label = data.row.raw?.[0] || "";
      if (label === "Margin") {
        data.cell.styles.textColor = [22, 163, 74];
        data.cell.styles.fontStyle = "bold";
      }
      if (label === "Total (ex GST)") {
        data.cell.styles.fillColor = [241, 245, 249];
        data.cell.styles.fontStyle = "bold";
      }
    },
  });

  y = (doc as any).lastAutoTable.finalY + 6;

  // Rate metrics
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(71, 85, 105);
  const ratePerM2 = options.areaM2 > 0 ? sellEx / options.areaM2 : 0;
  const costPerM2 = options.areaM2 > 0 ? hardCost / options.areaM2 : 0;
  doc.text(`Rate: ${fmt(ratePerM2)}/m² (sell)  |  ${fmt(costPerM2)}/m² (cost)  |  Target margin: ${marginPercent}%  |  Effective: ${marginPercentActual.toFixed(1)}%`, 14, y);
  y += 8;

  return y;
}

// ─── Diagrams Page ────────────────────────────────────────────────────────

function drawDiagrams(doc: jsPDF, options: DeckManagementPDFOptions): void {
  const { planViewImageDataUrl, boardLayoutImageDataUrl, sideElevationImageDataUrl, aiRenderImageDataUrl } = options;
  const hasAny = planViewImageDataUrl || boardLayoutImageDataUrl || sideElevationImageDataUrl || aiRenderImageDataUrl;
  if (!hasAny) return;

  // ── Landscape A4 page for diagrams ──
  doc.addPage("a4", "landscape");
  const pageWidth = doc.internal.pageSize.getWidth(); // 297mm
  const pageHeight = doc.internal.pageSize.getHeight(); // 210mm
  const margin = 14;
  const contentWidth = pageWidth - margin * 2;
  let y = 15;

  // Build caption parts
  const deckDims = `${options.deckWidthM.toFixed(1)}m \u00d7 ${options.deckProjectionM.toFixed(1)}m`;
  const captionParts: string[] = [deckDims, `${options.areaM2.toFixed(1)}m\u00b2`];
  if (options.productName) captionParts.push(options.productName);
  if (options.colourName) captionParts.push(options.colourName);
  if (options.framingSystem) captionParts.push(options.framingSystem);
  const captionText = captionParts.join(" \u2022 ");

  // Page title
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(30, 41, 59);
  doc.text("Deck Diagrams", margin, y);
  // Caption with key dimensions
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100, 116, 139);
  doc.text(captionText, margin, y + 5);
  y += 12;

  // Layout: 2-column grid for plan view + board layout, full-width side elevation below
  const colWidth = (contentWidth - 8) / 2; // 8mm gap between columns
  const topRowHeight = Math.min(100, (pageHeight - y - 80) * 0.55); // ~55% of remaining for top row
  const bottomRowHeight = Math.min(55, (pageHeight - y - 80) * 0.35); // ~35% for bottom row

  const labelStyle = () => {
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(71, 85, 105);
  };
  const subLabelStyle = () => {
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(120, 130, 145);
  };

  // ── Top row: Plan View (left) + Board Layout (right) ──
  if (planViewImageDataUrl) {
    labelStyle();
    doc.text("Plan View \u2014 Framing Schematic", margin, y);
    subLabelStyle();
    doc.text(`${deckDims} \u2022 ${options.framingSystem || "Standard framing"}`, margin, y + 4);
    try {
      doc.addImage(planViewImageDataUrl, "PNG", margin, y + 6, colWidth, topRowHeight - 8);
    } catch { /* image failed */ }
  }

  if (boardLayoutImageDataUrl) {
    const xRight = margin + colWidth + 8;
    labelStyle();
    doc.text("Board Layout", xRight, y);
    subLabelStyle();
    const boardInfo = [options.productName, options.boardDirection, options.staggerPattern].filter(Boolean).join(" \u2022 ");
    doc.text(boardInfo || "Deck board arrangement", xRight, y + 4);
    try {
      doc.addImage(boardLayoutImageDataUrl, "PNG", xRight, y + 6, colWidth, topRowHeight - 8);
    } catch { /* image failed */ }
  }

  y += topRowHeight + 4;

  // ── Bottom row: Side Elevation (left ~60%) + AI Render (right ~40%) ──
  const hasBottom = sideElevationImageDataUrl || aiRenderImageDataUrl;
  if (hasBottom) {
    const sideW = aiRenderImageDataUrl ? (contentWidth - 8) * 0.58 : contentWidth;
    const renderW = (contentWidth - 8) * 0.40;

    if (sideElevationImageDataUrl) {
      labelStyle();
      doc.text("Side Elevation / Cross-Section", margin, y);
      subLabelStyle();
      const wallType = options.subfloorInputs?.wall === "wall-mounted" ? "Wall-mounted (waling plate)" : "Freestanding";
      doc.text(`${wallType} \u2022 Height: ${options.subfloorInputs ? Math.round((options.subfloorInputs.minHeight + options.subfloorInputs.maxHeight) / 2) : "\u2014"}mm`, margin, y + 4);
      try {
        doc.addImage(sideElevationImageDataUrl, "PNG", margin, y + 6, sideW, bottomRowHeight - 8);
      } catch { /* image failed */ }
    }

    if (aiRenderImageDataUrl) {
      const xRender = margin + sideW + 8;
      labelStyle();
      doc.text("AI Render", xRender, y);
      subLabelStyle();
      doc.text("Generated visualisation", xRender, y + 4);
      try {
        doc.addImage(aiRenderImageDataUrl, "JPEG", xRender, y + 6, renderW, bottomRowHeight - 8);
      } catch { /* image failed */ }
    }
  }
}

// ─── Main Export Function ──────────────────────────────────────────────────

export function generateDeckManagementPDF(options: DeckManagementPDFOptions) {
  const company = loadCompanyDetails();
  const logoData = getLogoData();
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  // Page 1: Header + Customer + Specs + Pricing
  drawHeader(doc, logoData, company);
  let y = 44;

  y = drawCustomerDetails(doc, options, y);
  y = drawDeckSpecifications(doc, options, y);
  y = drawPricingSummary(doc, options, y);

  // Page 2+: Framing BOM
  doc.addPage();
  y = 15;
  y = drawFramingBOM(doc, options, y);

  // Framing Cutting List (NTW-style)
  y = drawFramingCuttingList(doc, options, y);

  // Cutting Optimiser
  y = drawCuttingOptimiser(doc, options, y);

  // Stair Summary
  y = drawStairSummary(doc, options, y);

  // Diagrams page (plan view, board layout, side elevation)
  drawDiagrams(doc, options);

  // Margin Analysis (new page)
  doc.addPage();
  y = 15;
  y = drawMarginAnalysis(doc, options, y);

  // Watermark & Footer
  drawFooter(doc);
  if (options.internalUseOnly !== false) {
    applyInternalUseWatermark(doc);
  }

  const filename = `Deck_Management_${options.quoteNumber}_${new Date().toISOString().slice(0, 10)}.pdf`;
  if (options.previewOnly) {
    const blob = doc.output("blob");
    return { blob, filename };
  }
  savePdfReliably(doc, filename);
  return undefined;
}
