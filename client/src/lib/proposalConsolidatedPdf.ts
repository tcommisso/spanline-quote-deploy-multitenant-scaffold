/**
 * Centralised Proposal PDF Generator
 * Generates a consolidated client-facing proposal PDF from the proposal entity.
 * Structure:
 *   1. Cover page (branded, with client details and cover message)
 *   2. Section pricing summary (one line per section)
 *   3. Additional costs breakdown
 *   4. Adjustments (discount/markup)
 *   5. Grand total with GST and deposit
 *   6. Terms & Conditions
 *   7. Signature / acceptance block
 */
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import {
  loadCompanyDetails,
  loadCustomLogo,
  loadProposalText,
  type CustomLogo,
  type CompanyDetails,
  type ProposalText,
} from "./proposalStore";
import { getAppendixPages, type SectionType } from "./proposalAppendixPlugins";
import { trpcVanilla } from "./trpcVanilla";

// ─── Types ────────────────────────────────────────────────────────────────────
export interface ProposalSection {
  type: string;
  quoteId: number;
  label: string;
  worksPrice: number;
  description?: string;
}

export interface ProposalPdfData {
  proposalNumber: string;
  clientName: string;
  clientEmail?: string;
  clientPhone?: string;
  clientAddress?: string;
  clientCompany?: string;
  preparedByName: string;
  createdAt: string; // ISO date
  validityDays: number;
  coverMessage?: string;
  scopeOfWorks?: string;
  exclusions?: string;
  termsAndConditions?: string;
  sections: ProposalSection[];
  // Additional costs (reduced set)
  siteClean?: string;
  constructionMgmt?: string;
  councilFees?: string;
  homeWarranty?: string;
  otherCost?: string;
  // Adjustments
  discountPercent?: string;
  discountAmount?: string;
  markupPercent?: string;
  markupAmount?: string;
  // Computed totals
  sectionsSubtotalExGst: number;
  additionalCostsTotal: number;
  adjustmentAmount: number;
  grandTotalExGst: number;
  gstAmount: number;
  grandTotalIncGst: number;
  // Deposit
  depositPercent?: string;
  depositAmount?: string;
  depositTotal?: number;
  // Progress Payments
  progressPayments?: Record<string, { percent: string; amount: string }>;
}

export type PdfOutputMode = "download" | "preview" | "base64" | "blob";

// ─── Main Export ──────────────────────────────────────────────────────────────
export async function generateProposalPdf(
  data: ProposalPdfData,
  mode: PdfOutputMode = "download"
): Promise<string | Blob | void> {
  const company = loadCompanyDetails();
  const logo = loadCustomLogo();
  const proposalText = loadProposalText();

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 15;
  const contentWidth = pageWidth - margin * 2;

  // ─── Page 1: Cover ──────────────────────────────────────────────────────────
  drawCoverPage(doc, data, company, logo, proposalText, pageWidth, pageHeight, margin);

  // ─── Page 2: Pricing ────────────────────────────────────────────────────────
  doc.addPage();
  let y = drawPageHeader(doc, logo, data.proposalNumber, pageWidth, margin);

  // Section title
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text("Proposal Pricing Summary", margin, y);
  y += 8;

  // Sections table
  const sectionRows = data.sections.map((s, i) => [
    String(i + 1),
    s.label,
    formatCurrency(s.worksPrice),
  ]);

  autoTable(doc, {
    startY: y,
    head: [["#", "Description", "Amount (ex GST)"]],
    body: sectionRows,
    margin: { left: margin, right: margin },
    headStyles: { fillColor: [51, 51, 51], textColor: [255, 255, 255], fontSize: 9 },
    bodyStyles: { fontSize: 9 },
    columnStyles: {
      0: { cellWidth: 10, halign: "center" },
      1: { cellWidth: contentWidth - 45 },
      2: { cellWidth: 35, halign: "right" },
    },
    theme: "grid",
  });

  y = (doc as any).lastAutoTable.finalY + 4;

  // Sections subtotal
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.text("Works Subtotal (ex GST):", margin, y + 4);
  doc.text(formatCurrency(data.sectionsSubtotalExGst), pageWidth - margin, y + 4, { align: "right" });
  y += 10;

  // Additional costs
  if (data.additionalCostsTotal > 0) {
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text("Additional Costs", margin, y);
    y += 6;

    const costRows: string[][] = [];
    const addCost = (label: string, val?: string) => {
      const n = parseFloat(val || "0");
      if (n > 0) costRows.push([label, formatCurrency(n)]);
    };
    addCost("Site Clean", data.siteClean);
    addCost("Construction Management", data.constructionMgmt);
    addCost("Council Fees (additional)", data.councilFees);
    addCost("Home Warranty Insurance", data.homeWarranty);
    addCost("Other Cost", data.otherCost);

    autoTable(doc, {
      startY: y,
      body: costRows,
      margin: { left: margin, right: margin },
      bodyStyles: { fontSize: 9 },
      columnStyles: {
        0: { cellWidth: contentWidth - 35 },
        1: { cellWidth: 35, halign: "right" },
      },
      theme: "plain",
    });

    y = (doc as any).lastAutoTable.finalY + 4;
  }

  // ─── Grand Total Box ────────────────────────────────────────────────────────
  y += 4;
  const boxY = y;
  const boxH = data.adjustmentAmount !== 0 ? 42 : 34;
  doc.setFillColor(245, 245, 245);
  doc.rect(margin, boxY, contentWidth, boxH, "F");
  doc.setDrawColor(51, 51, 51);
  doc.rect(margin, boxY, contentWidth, boxH, "S");

  y = boxY + 6;
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");

  doc.text("Subtotal (ex GST):", margin + 4, y);
  doc.text(formatCurrency(data.sectionsSubtotalExGst + data.additionalCostsTotal), pageWidth - margin - 4, y, { align: "right" });
  y += 5;

  if (data.adjustmentAmount !== 0) {
    const adjLabel = data.adjustmentAmount < 0 ? "Discount" : "Markup";
    let adjDetail = "";
    if (data.discountPercent) adjDetail = ` (${data.discountPercent}%)`;
    else if (data.markupPercent) adjDetail = ` (${data.markupPercent}%)`;
    doc.text(`${adjLabel}${adjDetail}:`, margin + 4, y);
    doc.text(
      `${data.adjustmentAmount < 0 ? "-" : "+"}${formatCurrency(Math.abs(data.adjustmentAmount))}`,
      pageWidth - margin - 4, y, { align: "right" }
    );
    y += 5;
  }

  doc.setFont("helvetica", "bold");
  doc.text("Total (ex GST):", margin + 4, y);
  doc.text(formatCurrency(data.grandTotalExGst), pageWidth - margin - 4, y, { align: "right" });
  y += 5;

  doc.setFont("helvetica", "normal");
  doc.text("GST (10%):", margin + 4, y);
  doc.text(formatCurrency(data.gstAmount), pageWidth - margin - 4, y, { align: "right" });
  y += 5;

  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text("TOTAL (inc GST):", margin + 4, y);
  doc.text(formatCurrency(data.grandTotalIncGst), pageWidth - margin - 4, y, { align: "right" });
  y += 8;

  // Deposit
  if (data.depositTotal && data.depositTotal > 0) {
    y = boxY + boxH + 6;
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.text(`Deposit Required: ${formatCurrency(data.depositTotal)}`, margin, y);
    if (data.depositPercent) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.text(` (${data.depositPercent}% of total)`, margin + 60, y);
    }
    y += 8;
  }

  // Validity
  y = boxY + boxH + (data.depositTotal && data.depositTotal > 0 ? 16 : 6);
  doc.setFontSize(8);
  doc.setFont("helvetica", "italic");
  doc.text(`This proposal is valid for ${data.validityDays} days from the date of issue.`, margin, y);

  // ─── Progress Payments Schedule Page ─────────────────────────────────────────
  if (data.progressPayments && Object.keys(data.progressPayments).length > 0) {
    doc.addPage();
    y = drawPageHeader(doc, logo, data.proposalNumber, pageWidth, margin);

    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text("PROGRESS PAYMENT SCHEDULE", margin, y);
    y += 10;

    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.text("The following payment schedule applies to this contract:", margin, y);
    y += 8;

    // Contract A stages
    const CONTRACT_A_KEYS = ["A1", "A2"];
    const CONTRACT_B_KEYS = ["B1", "B2", "B3", "B4", "B5", "B6", "B7", "B8", "B9", "B10", "B11", "B12", "B13"];
    const STAGE_LABELS: Record<string, string> = {
      A1: "Deposit A \u2013 Contract Execution Stage",
      A2: "Design, Development and Building Approvals Stage",
      B1: "Deposit B \u2013 Materials Ordered Stage",
      B2: "Earthworks / Foundations / Slab Stage",
      B3: "First Trades or Materials (on the Building Site) Stage",
      B4: "Subfloor, Yellow/Red Tongue and/or Deck Stage",
      B5: "Above Floor Frame Stage",
      B6: "Roof Stage",
      B7: "Windows & Doors Stage",
      B8: "Underground Services & Plumbing Stage",
      B9: "Electrical Stage",
      B10: "Flooring Stage",
      B11: "Other",
      B12: "Work Substantially Completed (Practical Completion) Stage",
      B13: "Final Payment (Issue of Certificate of Occupancy) Stage",
    };

    const drawPaymentTable = (title: string, keys: string[]) => {
      const activeRows = keys.filter(k => {
        const p = data.progressPayments![k];
        return p && (parseFloat(p.percent) > 0 || parseFloat(p.amount) > 0);
      });
      if (activeRows.length === 0) return;

      doc.setFontSize(9);
      doc.setFont("helvetica", "bold");
      doc.text(title, margin, y);
      y += 5;

      // Table header
      doc.setFontSize(7);
      doc.setFont("helvetica", "bold");
      doc.setFillColor(240, 240, 240);
      doc.rect(margin, y - 3, pageWidth - margin * 2, 5, "F");
      doc.text("Stage", margin + 2, y);
      doc.text("Description", margin + 14, y);
      doc.text("%", pageWidth - margin - 30, y, { align: "right" });
      doc.text("Amount", pageWidth - margin - 2, y, { align: "right" });
      y += 5;

      doc.setFont("helvetica", "normal");
      let subtotalAmt = 0;
      let subtotalPct = 0;
      for (const key of activeRows) {
        const p = data.progressPayments![key];
        const pct = parseFloat(p.percent) || 0;
        const amt = parseFloat(p.amount) || 0;
        subtotalAmt += amt;
        subtotalPct += pct;

        doc.text(key, margin + 2, y);
        const label = STAGE_LABELS[key] || key;
        doc.text(label.length > 55 ? label.slice(0, 55) + "..." : label, margin + 14, y);
        doc.text(`${pct.toFixed(1)}%`, pageWidth - margin - 30, y, { align: "right" });
        doc.text(formatCurrency(amt), pageWidth - margin - 2, y, { align: "right" });
        y += 4.5;
      }

      // Subtotal row
      doc.setFont("helvetica", "bold");
      doc.setDrawColor(0);
      doc.line(margin, y - 1, pageWidth - margin, y - 1);
      doc.text("Subtotal", margin + 14, y + 2);
      doc.text(`${subtotalPct.toFixed(1)}%`, pageWidth - margin - 30, y + 2, { align: "right" });
      doc.text(formatCurrency(subtotalAmt), pageWidth - margin - 2, y + 2, { align: "right" });
      y += 8;
    };

    drawPaymentTable("Contract A \u2013 Design & Approvals", CONTRACT_A_KEYS);
    drawPaymentTable("Contract B \u2013 Construction", CONTRACT_B_KEYS);

    // Grand total
    const allKeys = [...CONTRACT_A_KEYS, ...CONTRACT_B_KEYS];
    const totalAmt = allKeys.reduce((sum, k) => sum + parseFloat(data.progressPayments![k]?.amount || "0"), 0);
    const totalPct = allKeys.reduce((sum, k) => sum + parseFloat(data.progressPayments![k]?.percent || "0"), 0);
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.text("TOTAL PROGRESS PAYMENTS:", margin, y);
    doc.text(`${totalPct.toFixed(1)}% \u2014 ${formatCurrency(totalAmt)}`, pageWidth - margin, y, { align: "right" });
  }

  // ─── Page 3: Terms & Signature ──────────────────────────────────────────────
  doc.addPage();
  y = drawPageHeader(doc, logo, data.proposalNumber, pageWidth, margin);
  y = drawTermsAndSignature(doc, proposalText, data, pageWidth, pageHeight, margin, y);

  // ─── Appendix Pages (plugin-generated) ─────────────────────────────────────
  const appendixSections = data.sections.map((s) => ({
    type: s.type as SectionType,
    quoteId: s.quoteId,
    label: s.label,
    worksPrice: s.worksPrice,
  }));
  const appendixPages = await getAppendixPages(appendixSections, trpcVanilla);

  for (const page of appendixPages) {
    doc.addPage();
    y = drawPageHeader(doc, logo, data.proposalNumber, pageWidth, margin);

    // Appendix page title
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(100, 100, 100);
    doc.text("APPENDIX", margin, y);
    doc.setTextColor(0, 0, 0);
    y += 6;

    doc.setFontSize(14);
    doc.text(page.title, margin, y);
    y += 10;

    // Delegate rendering to the plugin
    y = page.render(doc, y, pageWidth, margin);
  }

  // ─── Output ─────────────────────────────────────────────────────────────────
  const fileName = `Proposal_${data.proposalNumber}_${data.clientName.replace(/\s+/g, "_")}.pdf`;

  switch (mode) {
    case "download":
      doc.save(fileName);
      return;
    case "preview":
      const blob = doc.output("blob");
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
      return url;
    case "base64":
      return doc.output("datauristring");
    case "blob":
      return doc.output("blob");
  }
}

// ─── Cover Page ───────────────────────────────────────────────────────────────
function drawCoverPage(
  doc: jsPDF,
  data: ProposalPdfData,
  company: CompanyDetails,
  logo: CustomLogo | null,
  proposalText: ProposalText,
  pageWidth: number,
  pageHeight: number,
  margin: number
) {
  // Dark header band
  doc.setFillColor(33, 33, 33);
  doc.rect(0, 0, pageWidth, 60, "F");

  // Logo
  let logoX = margin;
  if (logo?.dataUrl) {
    const { w, h } = logoSize(logo, 50, 20);
    doc.addImage(logo.dataUrl, "PNG", margin, 10, w, h);
    logoX = margin + w + 8;
  }

  // Company name in header
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.text(company.companyName || "AltaSpan", logoX, 28);

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  const headerLines = [company.phone, company.email, company.website].filter(Boolean);
  doc.text(headerLines.join("  |  "), logoX, 38);

  // Reset text color
  doc.setTextColor(0, 0, 0);

  // Proposal title
  let y = 80;
  doc.setFontSize(24);
  doc.setFont("helvetica", "bold");
  doc.text("PROPOSAL", margin, y);
  y += 10;

  doc.setFontSize(11);
  doc.setFont("helvetica", "normal");
  doc.text(`${data.proposalNumber}`, margin, y);
  y += 6;
  doc.text(`Date: ${new Date(data.createdAt).toLocaleDateString("en-AU", { day: "2-digit", month: "long", year: "numeric" })}`, margin, y);
  y += 12;

  // Client details
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text("Prepared For:", margin, y);
  y += 7;

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(data.clientName, margin, y); y += 5;
  if (data.clientCompany) { doc.text(data.clientCompany, margin, y); y += 5; }
  if (data.clientAddress) { doc.text(data.clientAddress, margin, y); y += 5; }
  if (data.clientEmail) { doc.text(data.clientEmail, margin, y); y += 5; }
  if (data.clientPhone) { doc.text(data.clientPhone, margin, y); y += 5; }
  y += 8;

  // Prepared by
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text("Prepared By:", margin, y);
  doc.setFont("helvetica", "normal");
  doc.text(data.preparedByName, margin + 30, y);
  y += 12;

  // Cover message
  if (data.coverMessage) {
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    const lines = doc.splitTextToSize(data.coverMessage, pageWidth - margin * 2);
    doc.text(lines, margin, y);
    y += lines.length * 5 + 8;
  }

  // Scope summary
  if (data.sections.length > 0) {
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text("Scope of Works:", margin, y);
    y += 7;

    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    for (const s of data.sections) {
      doc.text(`• ${s.label}`, margin + 4, y);
      y += 5;
    }
  }

  // Licence info at bottom
  const licY = pageHeight - 20;
  doc.setFontSize(7);
  doc.setTextColor(120, 120, 120);
  const licLines = [];
  if (company.licenceACT) licLines.push(`ACT Licence: ${company.licenceACT}`);
  if (company.licenceNSW) licLines.push(`NSW Licence: ${company.licenceNSW}`);
  if (company.abn) licLines.push(`ABN: ${company.abn}`);
  doc.text(licLines.join("   |   "), pageWidth / 2, licY, { align: "center" });
  doc.setTextColor(0, 0, 0);
}

// ─── Page Header ──────────────────────────────────────────────────────────────
function drawPageHeader(
  doc: jsPDF,
  logo: CustomLogo | null,
  proposalNumber: string,
  pageWidth: number,
  margin: number
): number {
  let y = 12;
  if (logo?.dataUrl) {
    const { w, h } = logoSize(logo, 30, 12);
    doc.addImage(logo.dataUrl, "PNG", margin, y - 4, w, h);
  }
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(120, 120, 120);
  doc.text(proposalNumber, pageWidth - margin, y, { align: "right" });
  doc.setTextColor(0, 0, 0);

  // Separator line
  y += 8;
  doc.setDrawColor(200, 200, 200);
  doc.line(margin, y, pageWidth - margin, y);
  return y + 8;
}

// ─── Terms & Signature ────────────────────────────────────────────────────────
function drawTermsAndSignature(
  doc: jsPDF,
  proposalText: ProposalText,
  data: ProposalPdfData,
  pageWidth: number,
  pageHeight: number,
  margin: number,
  startY: number
): number {
  let y = startY;
  const contentWidth = pageWidth - margin * 2;

  // Scope of Works (if provided)
  if (data.scopeOfWorks) {
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.text("Scope of Works", margin, y);
    y += 6;
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    const scopeLines = doc.splitTextToSize(data.scopeOfWorks, contentWidth);
    doc.text(scopeLines, margin, y);
    y += scopeLines.length * 3.5 + 8;
  }

  // Exclusions (if provided)
  if (data.exclusions) {
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.text("Exclusions", margin, y);
    y += 6;
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    const exLines = doc.splitTextToSize(data.exclusions, contentWidth);
    doc.text(exLines, margin, y);
    y += exLines.length * 3.5 + 8;
  }

  // Terms heading
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text("Terms & Conditions", margin, y);
  y += 7;

  // Terms content — per-proposal custom terms override global defaults
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  const termsText = data.termsAndConditions || proposalText.warrantyBody || getDefaultTerms();
  const termsLines = doc.splitTextToSize(termsText, contentWidth);

  // Check if we need a new page
  if (y + termsLines.length * 3.5 > pageHeight - 60) {
    // Split across pages
    const linesPerPage = Math.floor((pageHeight - y - 60) / 3.5);
    doc.text(termsLines.slice(0, linesPerPage), margin, y);
    doc.addPage();
    y = drawPageHeader(doc, null, data.proposalNumber, pageWidth, margin);
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.text(termsLines.slice(linesPerPage), margin, y);
    y += (termsLines.length - linesPerPage) * 3.5 + 8;
  } else {
    doc.text(termsLines, margin, y);
    y += termsLines.length * 3.5 + 8;
  }

  // Signature block
  if (y + 50 > pageHeight - 20) {
    doc.addPage();
    y = drawPageHeader(doc, null, data.proposalNumber, pageWidth, margin);
  }

  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text("Acceptance", margin, y);
  y += 8;

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text("I accept the above proposal and agree to the terms and conditions stated.", margin, y);
  y += 12;

  // Signature lines
  const sigWidth = (contentWidth - 20) / 2;
  doc.setDrawColor(0, 0, 0);

  doc.line(margin, y, margin + sigWidth, y);
  doc.text("Client Signature", margin, y + 5);

  doc.line(margin + sigWidth + 20, y, margin + sigWidth * 2 + 20, y);
  doc.text("Date", margin + sigWidth + 20, y + 5);

  y += 14;
  doc.line(margin, y, margin + sigWidth, y);
  doc.text("Print Name", margin, y + 5);

  return y + 10;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function logoSize(logo: CustomLogo, maxW: number, maxH: number) {
  const ratio = logo.width / logo.height;
  let w = maxW;
  let h = w / ratio;
  if (h > maxH) { h = maxH; w = h * ratio; }
  return { w, h };
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    minimumFractionDigits: 2,
  }).format(amount);
}

function getDefaultTerms(): string {
  return `1. Payment Terms: A deposit as specified above is required upon acceptance. Progress payments as per the schedule agreed. Final payment due on completion.
2. Variations: Any variations to the scope of works must be agreed in writing and may result in additional charges.
3. Access: The client must provide clear and safe access to the work site.
4. Warranty: All workmanship is warranted for a period of 6 years from the date of completion. Product warranties as per manufacturer specifications.
5. Cancellation: Cancellation after acceptance may incur charges for work already completed and materials ordered.
6. Insurance: The contractor maintains public liability and workers compensation insurance.
7. Compliance: All works will be carried out in accordance with the Building Code of Australia and relevant Australian Standards.
8. Disputes: Any disputes will be resolved in accordance with the relevant state legislation.`;
}
