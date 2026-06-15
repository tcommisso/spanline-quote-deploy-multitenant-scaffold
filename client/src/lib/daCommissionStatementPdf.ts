/**
 * DA Commission Statement — PDF Export (Admin / DA use)
 * Shows commission ledger for a Design Adviser with branded header,
 * summary totals, and "Internal Use Only" watermark.
 */

import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { applyInternalUseWatermark } from "./pdfWatermark";
import { loadCompanyDetails, loadCustomLogo, type CustomLogo, type CompanyDetails } from "./proposalStore";

// ─── Types ─────────────────────────────────────────────────────────────────

export interface CommissionRow {
  clientName: string;
  jobNo: string | null;
  contractNo: string | null;
  totalCommission: string | number;
  amountPaid: string | number;
  adjustmentsTotal: string | number;
  balanceDue: string | number;
  status: string;
}

export interface DaCommissionStatementOptions {
  daName: string;
  daAbn?: string;
  daEmail?: string;
  daPhone?: string;
  daAddress?: string;
  commissions: CommissionRow[];
  statementDate?: Date;
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function fmt(val: string | number | null | undefined): string {
  const n = parseFloat(String(val || "0"));
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    minimumFractionDigits: 2,
  }).format(n);
}

function statusLabel(status: string): string {
  const map: Record<string, string> = {
    pending: "Pending",
    deposit_received: "Deposit Received",
    partial_paid: "Partial Paid",
    fully_paid: "Fully Paid",
    closed: "Closed",
  };
  return map[status] || status;
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
}

function getLogoData(): string | null {
  const logo: CustomLogo | null = loadCustomLogo();
  return logo?.dataUrl ?? null;
}

// ─── PDF Sections ──────────────────────────────────────────────────────────

function drawHeader(doc: jsPDF, logoData: string | null, company: CompanyDetails, options: DaCommissionStatementOptions) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const statementDate = options.statementDate || new Date();

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
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text("Commission Statement", textX, 15);
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text("Design Adviser", textX, 23);

  // Date on right
  doc.setFontSize(8);
  const dateStr = statementDate.toLocaleDateString("en-AU", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
  doc.text(`Statement Date: ${dateStr}`, pageWidth - 14, 15, { align: "right" });

  if (company.companyName) {
    doc.setFontSize(7);
    doc.text(company.companyName, pageWidth - 14, 22, { align: "right" });
  }
  if (company.abn) {
    doc.setFontSize(7);
    doc.text(`ABN: ${company.abn}`, pageWidth - 14, 28, { align: "right" });
  }
}

function drawDaDetails(doc: jsPDF, options: DaCommissionStatementOptions, y: number): number {
  const { daName, daAbn, daEmail, daPhone, daAddress } = options;

  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(30, 41, 59);
  doc.text("Design Adviser Details", 14, y);
  y += 6;

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(71, 85, 105);

  if (daName) { doc.text(`Name: ${daName}`, 14, y); y += 5; }
  if (daAbn) { doc.text(`ABN: ${daAbn}`, 14, y); y += 5; }
  if (daEmail) { doc.text(`Email: ${daEmail}`, 14, y); y += 5; }
  if (daPhone) { doc.text(`Phone: ${daPhone}`, 14, y); y += 5; }
  if (daAddress) { doc.text(`Address: ${daAddress}`, 14, y); y += 5; }

  return y + 4;
}

function drawCommissionTable(doc: jsPDF, options: DaCommissionStatementOptions, y: number): number {
  const { commissions } = options;

  const tableHead = [["Client Name", "Job No", "Contract No", "Total Commission", "Amount Paid", "Adjustments", "Balance Due", "Status"]];
  const tableBody = commissions.map(c => [
    c.clientName,
    c.jobNo || "—",
    c.contractNo || "—",
    fmt(c.totalCommission),
    fmt(c.amountPaid),
    fmt(c.adjustmentsTotal),
    fmt(c.balanceDue),
    statusLabel(c.status),
  ]);

  autoTable(doc, {
    startY: y,
    head: tableHead,
    body: tableBody,
    theme: "striped",
    headStyles: {
      fillColor: [30, 41, 59],
      textColor: [255, 255, 255],
      fontSize: 8,
      fontStyle: "bold",
    },
    bodyStyles: {
      fontSize: 8,
      textColor: [51, 65, 85],
    },
    columnStyles: {
      0: { cellWidth: 35 },
      3: { halign: "right" },
      4: { halign: "right" },
      5: { halign: "right" },
      6: { halign: "right" },
    },
    margin: { left: 14, right: 14 },
    didParseCell: (data) => {
      // Bold the Balance Due column
      if (data.section === "body" && data.column.index === 6) {
        data.cell.styles.fontStyle = "bold";
      }
    },
  });

  return (doc as any).lastAutoTable?.finalY || y + 20;
}

function drawSummary(doc: jsPDF, options: DaCommissionStatementOptions, y: number): number {
  const { commissions } = options;

  const totalCommission = commissions.reduce((sum, c) => sum + parseFloat(String(c.totalCommission || "0")), 0);
  const totalPaid = commissions.reduce((sum, c) => sum + parseFloat(String(c.amountPaid || "0")), 0);
  const totalAdjustments = commissions.reduce((sum, c) => sum + parseFloat(String(c.adjustmentsTotal || "0")), 0);
  const totalBalance = commissions.reduce((sum, c) => sum + parseFloat(String(c.balanceDue || "0")), 0);

  y += 8;

  // Summary box
  const pageWidth = doc.internal.pageSize.getWidth();
  const boxWidth = 120;
  const boxX = pageWidth - 14 - boxWidth;

  doc.setFillColor(248, 250, 252); // slate-50
  doc.setDrawColor(226, 232, 240); // slate-200
  doc.roundedRect(boxX, y, boxWidth, 40, 2, 2, "FD");

  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(30, 41, 59);
  doc.text("Statement Summary", boxX + 6, y + 8);

  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(71, 85, 105);

  const col1 = boxX + 6;
  const col2 = boxX + boxWidth - 6;
  let sy = y + 15;

  doc.text("Total Commission:", col1, sy);
  doc.text(fmt(totalCommission), col2, sy, { align: "right" });
  sy += 5;

  doc.text("Total Paid:", col1, sy);
  doc.text(fmt(totalPaid), col2, sy, { align: "right" });
  sy += 5;

  doc.text("Adjustments:", col1, sy);
  doc.text(fmt(totalAdjustments), col2, sy, { align: "right" });
  sy += 5;

  doc.setFont("helvetica", "bold");
  doc.setTextColor(30, 41, 59);
  doc.text("Total Balance Due:", col1, sy);
  doc.text(fmt(totalBalance), col2, sy, { align: "right" });

  return y + 48;
}

function drawFooter(doc: jsPDF) {
  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setFontSize(7);
    doc.setTextColor(160, 150, 140);
    doc.text(
      `Commission Statement — Page ${p} of ${totalPages}`,
      doc.internal.pageSize.getWidth() / 2,
      doc.internal.pageSize.getHeight() - 8,
      { align: "center" }
    );
  }
}

function drawPaymentSchedule(doc: jsPDF, y: number): number {
  // Check if we need a new page
  if (y > doc.internal.pageSize.getHeight() - 50) {
    doc.addPage();
    y = 20;
  }

  y += 6;
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(30, 41, 59);
  doc.text("Commission Payment Schedule", 14, y);
  y += 6;

  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(71, 85, 105);
  doc.text("• 75% — Payable after deposit is received and contract is signed", 14, y);
  y += 5;
  doc.text("• 25% — Payable after completion (or adjusted amount at admin's discretion)", 14, y);
  y += 5;
  doc.text("• Formula: Total Commission − Amount Paid ± Adjustments = Balance Due", 14, y);

  return y + 8;
}

// ─── Main Export ───────────────────────────────────────────────────────────

export function generateDaCommissionStatementPdf(options: DaCommissionStatementOptions) {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const logoData = getLogoData();
  const company = loadCompanyDetails();

  // Header
  drawHeader(doc, logoData, company, options);

  // DA details
  let y = drawDaDetails(doc, options, 44);

  // Commission table
  y = drawCommissionTable(doc, options, y);

  // Summary
  y = drawSummary(doc, options, y);

  // Payment schedule note
  drawPaymentSchedule(doc, y);

  // Footer
  drawFooter(doc);

  // Watermark
  applyInternalUseWatermark(doc);

  // Save
  const dateStr = (options.statementDate || new Date()).toISOString().split("T")[0];
  const filename = `Commission-Statement-${options.daName.replace(/\s+/g, "-")}-${dateStr}.pdf`;
  savePdfReliably(doc, filename);
}
