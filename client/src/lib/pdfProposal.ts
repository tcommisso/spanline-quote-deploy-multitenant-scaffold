/**
 * Branded PDF Proposal Generator
 * Generates a professional multi-page proposal using jsPDF.
 * Follows the product-quoting-app skill PDF export patterns.
 */

import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { applyInternalUseWatermark } from "./pdfWatermark";
import { renderRoofDiagram, parseRoofType, type RoofDiagramOptions } from "./renderRoofDiagram";
import {
  loadCompanyDetails,
  loadCustomLogo,
  loadProposalText,
  type CustomLogo,
  type CompanyDetails,
  type ProposalText,
} from "./proposalStore";
import { computePerSideInset, type PerSideSetbacks } from "./polygonInset";
import { logClientDownload } from "./userActivity";

/** Load an image from a URL into an HTMLImageElement, returns null on failure */
function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
    // Timeout after 8 seconds
    setTimeout(() => resolve(null), 8000);
  });
}

export interface BranchDetails {
  name: string;
  address: string;
  phone?: string;
  email?: string;
  smsNumber?: string;
}

export interface ProposalQuoteData {
  quoteNumber: string;
  clientName: string;
  clientPhone?: string;
  clientEmail?: string;
  siteAddress?: string;
  suburb?: string;
  region?: string;
  descriptionOfWork?: string;
  branchDetails?: BranchDetails;
  // Spec fields for diagram
  specRoofType?: string;
  specWidth?: string;
  specLength?: string;
  specFloorHeight?: string;
  specRoofTopColour?: string;
  specRoofBottomColour?: string;
  specPostsColour?: string;
  specBeamColour?: string;
  // Deck area (m²) — used on pricing page for deck proposals
  deckAreaM2?: number;
  // Totals
  grandTotalExGst: number;
  grandTotalIncGst: number;
  gst: number;
  // Component breakdown for pricing table
  componentSummary: { name: string; amount: number }[];
  // Adjustments
  adjustments: { name: string; amount: number }[];
  // Progress payments
  progressPayments?: Record<string, string>;
  // Site plan & elevation data
  sitePlan?: {
    boundaryCoords?: [number, number][];
    centroid?: [number, number];
    lotId?: string;
    suburb?: string;
    areaSqm?: number;
    frontageM?: number;
    depthM?: number;
    /** Pre-fetched satellite image data URL from server-side proxy */
    satelliteDataUrl?: string;
    /** Structure offset from centroid in metres */
    structureOffsetX?: number;
    structureOffsetY?: number;
    /** Structure rotation in degrees */
    structureRotation?: number;
  };
  specProjection?: string;
  specHouseEave?: string;
  specJobEave?: string;
  specFloorToGround?: string;
  specRoofShape?: string;
  specFall?: string;
  specPostsNumber?: string;
  specPostsType?: string;
  specSetbackFront?: string;
  specSetbackRear?: string;
  specSetbackLeft?: string;
  specSetbackRight?: string;
  specSetbackColor?: string;
  specHouseWalls?: string;
  /** Post positions encoded as "side:percent" e.g. ["B-C:0", "B-C:50", "C-D:75"] */
  postPositions?: string[];
  // Deck design canvas data (subfloor plan view)
  deckDesign?: {
    /** Base64-encoded PNG of the SVG schematic plan view */
    schematicImageDataUrl?: string;
    /** Framing system identifier */
    framingSystem?: string;
    /** Human-readable framing system label */
    framingSystemLabel?: string;
    /** Active option result for BOM and post schedule */
    option: {
      label: string;
      description: string;
      profileLabel: string;
      joistCount: number;
      joistLength: number;
      joistCentres: number;
      bearerCount: number;
      bearerLength: number;
      postCount: number;
      joistsCost: number;
      bearersCost: number;
      totalCost: number;
      labourNote: string;
      posts: { label: string; bearer: string; x: number; y: number }[];
    };
    /** Deck shape for display */
    shape: string;
    /** Deck dimensions in mm */
    lengthMm: number;
    widthMm: number;
    /** Board layout info for the proposal */
    boardLayout?: {
      boardDirection: string;
      boardWidth: number;
      boardGap: number;
      boardLength: number;
      pictureFrame: string | boolean;
      breakerBoard: string | boolean;
      staggerPattern?: string;
    };
    /** Base64-encoded PNG of the board layout SVG */
    boardLayoutImageDataUrl?: string;
    /** Decking product info */
    deckingProduct?: string;
    deckingColour?: string;
    /** Base64-encoded PNG of the side view / cross-section SVG */
    sideViewImageDataUrl?: string;
    /** Stair BOM data for the proposal */
    stairBom?: {
      stairType: string;
      flights: number;
      numberOfRisers: number;
      actualRiser: number;
      going: number;
      stairWidth: number;
      stringerCount: number;
      stringerLengthMm: number;
      treadBoards: number;
      treadCutLength: number;
      riserBoards: number;
      riserCutLength: number;
      handrailLength: number;
      balustradePosts: number;
      landingBoards: number;
      treadMaterial: string;
      stringerMaterial: string;
      riserStyle: string;
      handrailStyle: string;
    };
  };
  // Materials table for proposal
  materialsList?: {
    category: string;
    product: string;
    colour?: string;
    imageUrl?: string;
  }[];
  // Connection type for attachment callout
  connectionType?: string;
  connectionImageUrl?: string;
  // Optional photo gallery (site/project photos)
  photos?: { url: string; caption?: string }[];
  // Financial breakdown details
  financialBreakdown?: {
    complexity?: {
      total: number;
      criteria: { name: string; rate: number }[];
    };
    constructionMgmt?: {
      percent: number;
      roofShape: string;
    };
    delivery?: {
      distanceKm: number;
      ratePerKm: number;
      factorTier: number;
      total: number;
    };
    smallJob?: {
      threshold: number;
      subtotal: number;
      applied: boolean;
      surcharge: number;
    };
  };
}

export type ProposalMode = "download" | "preview" | "base64";

export async function generateProposalPDF(
  data: ProposalQuoteData,
  mode: ProposalMode = "download",
  options?: { internalUseOnly?: boolean }
): Promise<string | { pdfBase64: string; totalPages: number; signatureY?: number } | { blob: Blob; filename: string } | undefined> {
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

  // ─── Page 1: Cover Page ──────────────────────────────────────────────────────
  drawCoverPage(doc, data, company, logo, dateStr, pageWidth, pageHeight);

  // ─── Page 2: Project Details & Scope ─────────────────────────────────────────
  doc.addPage();
  let y = drawPageHeader(doc, logo, dateStr, data.quoteNumber, pageWidth);
  y = drawProjectDetails(doc, data, proposalText, y, margin, contentWidth, pageWidth);

  // ─── Page 3: Roof Diagram ────────────────────────────────────────────────────
  // ─── Roof/Site/Elevations pages (skip for deck quotes which have their own design page) ──
  if (data.specWidth && data.specLength && !data.deckDesign) {
    doc.addPage();
    y = drawPageHeader(doc, logo, dateStr, data.quoteNumber, pageWidth);
    y = drawRoofDiagramPage(doc, data, y, margin, contentWidth, pageWidth, pageHeight);

    doc.addPage();
    y = drawPageHeader(doc, logo, dateStr, data.quoteNumber, pageWidth);
    y = await drawSitePlanPageA4(doc, data, y, margin, contentWidth, pageWidth, pageHeight);

    doc.addPage();
    y = drawPageHeader(doc, logo, dateStr, data.quoteNumber, pageWidth);
    y = drawElevationsPage(doc, data, y, margin, contentWidth, pageWidth, pageHeight);
  }

  // ─── Deck Design: Subfloor Plan View + BOM + Post Schedule ─────────────────
  if (data.deckDesign) {
    doc.addPage("a4", "portrait");
    y = drawPageHeader(doc, logo, dateStr, data.quoteNumber, pageWidth);
    y = drawDeckDesignPage(doc, data.deckDesign, y, margin, contentWidth, pageWidth, pageHeight);
  }

  // ─── Materials Table Page ────────────────────────────────────────────────────
  if (data.materialsList && data.materialsList.length > 0) {
    doc.addPage();
    y = drawPageHeader(doc, logo, dateStr, data.quoteNumber, pageWidth);
    y = await drawMaterialsTablePage(doc, data, y, margin, contentWidth, pageWidth, pageHeight);
  }

  // ─── Photo Gallery Page (optional) ───────────────────────────────────────────
  if (data.photos && data.photos.length > 0) {
    await drawPhotoGalleryPages(doc, data.photos, logo, dateStr, data.quoteNumber, margin, contentWidth, pageWidth, pageHeight);
  }

  // ─── Page 4: Pricing Summary ─────────────────────────────────────────────────
  doc.addPage();
  y = drawPageHeader(doc, logo, dateStr, data.quoteNumber, pageWidth);
  y = drawPricingSummary(doc, data, y, margin, contentWidth, pageWidth);

  // ─── Page 5: Terms, Payments & Signature ─────────────────────────────────────
  doc.addPage();
  y = drawPageHeader(doc, logo, dateStr, data.quoteNumber, pageWidth);
  const sigResult = drawTermsAndSignature(doc, data, proposalText, company, y, margin, contentWidth, pageWidth, pageHeight);
  y = sigResult.y;
  const signatureY = sigResult.signatureY;

  // ─── Add page number footers to all pages ─────────────────────────────────
  addPageNumberFooters(doc, pageWidth, pageHeight);

    // ─── Apply Internal Use Only watermark if requested ─────────────────────────
  if (options?.internalUseOnly) {
    applyInternalUseWatermark(doc);
  }
  // ─── Save / Preview / Base64 ─────────────────────────────────────────────
  const filename = `Proposal_${data.quoteNumber}_${data.clientName.replace(/\s+/g, "_")}.pdf`;
  if (mode === "base64") {
    const totalPages = doc.getNumberOfPages();
    const pdfBase64 = doc.output("datauristring").split(",")[1];
    return { pdfBase64, totalPages, signatureY };
  } else if (mode === "preview") {
    const blob = doc.output("blob");
    return { blob, filename };
  } else {
    const blob = doc.output("blob");
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    logClientDownload({
      filename,
      source: "proposal_pdf",
      entityType: "quote",
      entityId: data.quoteNumber,
      mimeType: "application/pdf",
      metadata: { clientName: data.clientName },
    });
  }
  return undefined;
}

// ─── Page Number Footers ─────────────────────────────────────────────────────
function addPageNumberFooters(doc: jsPDF, pageWidth: number, pageHeight: number) {
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(150, 150, 150);
    doc.text(
      `Page ${i} of ${totalPages}`,
      pageWidth / 2,
      pageHeight - 8,
      { align: "center" }
    );
  }
}

// ─── Photo Gallery Pages ────────────────────────────────────────────────────────
async function drawPhotoGalleryPages(
  doc: jsPDF,
  photos: { url: string; caption?: string }[],
  logo: CustomLogo | null,
  dateStr: string,
  quoteNumber: string,
  margin: number,
  contentWidth: number,
  pageWidth: number,
  pageHeight: number
) {
  // Layout: 2 photos per page in a 2x1 grid
  const photosPerPage = 2;
  const photoMaxWidth = contentWidth;
  const photoMaxHeight = 105; // mm per photo slot
  const gapBetweenPhotos = 8;

  for (let i = 0; i < photos.length; i += photosPerPage) {
    doc.addPage();
    let y = drawPageHeader(doc, logo, dateStr, quoteNumber, pageWidth);

    // Section title on first gallery page only
    if (i === 0) {
      doc.setFontSize(14);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(30, 35, 40);
      doc.text("PHOTO GALLERY", margin, y + 6);
      y += 14;
    }

    const pagePhotos = photos.slice(i, i + photosPerPage);
    for (let j = 0; j < pagePhotos.length; j++) {
      const photo = pagePhotos[j];
      const img = await loadImage(photo.url);
      if (img) {
        // Calculate aspect-fit dimensions
        const aspect = img.naturalWidth / img.naturalHeight;
        let imgW = photoMaxWidth;
        let imgH = imgW / aspect;
        if (imgH > photoMaxHeight) {
          imgH = photoMaxHeight;
          imgW = imgH * aspect;
        }
        // Center horizontally
        const imgX = margin + (contentWidth - imgW) / 2;
        doc.addImage(img, "JPEG", imgX, y, imgW, imgH);
        y += imgH + 3;
      } else {
        // Placeholder if image fails to load
        doc.setFillColor(240, 240, 240);
        doc.rect(margin, y, photoMaxWidth, photoMaxHeight, "F");
        doc.setFontSize(9);
        doc.setTextColor(150, 150, 150);
        doc.text("Image could not be loaded", pageWidth / 2, y + photoMaxHeight / 2, { align: "center" });
        y += photoMaxHeight + 3;
      }

      // Caption
      if (photo.caption) {
        doc.setFontSize(8);
        doc.setFont("helvetica", "italic");
        doc.setTextColor(100, 100, 100);
        doc.text(photo.caption, pageWidth / 2, y, { align: "center" });
        y += 5;
      }
      y += gapBetweenPhotos;
    }
  }
}

// ─── Cover Page ────────────────────────────────────────────────────────────────
function drawCoverPage(
  doc: jsPDF,
  data: ProposalQuoteData,
  company: CompanyDetails,
  logo: CustomLogo | null,
  dateStr: string,
  pageWidth: number,
  pageHeight: number
) {
  // Dark background
  doc.setFillColor(30, 35, 40);
  doc.rect(0, 0, pageWidth, pageHeight, "F");

  // Accent line
  doc.setFillColor(45, 120, 100); // Teal accent
  doc.rect(0, 55, pageWidth, 2, "F");

  // Logo
  if (logo) {
    const { w, h } = logoSize(logo, 70, 30);
    doc.addImage(logo.dataUrl, logo.dataUrl.includes("image/jpeg") || logo.dataUrl.includes("image/jpg") ? "JPEG" : "PNG", (pageWidth - w) / 2, 18, w, h);
  } else {
    // Fallback text logo
    doc.setFontSize(24);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(255, 255, 255);
    doc.text(company.companyName, pageWidth / 2, 38, { align: "center" });
  }

  // "PROPOSAL" title
  doc.setFontSize(32);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(255, 255, 255);
  doc.text("PROPOSAL", pageWidth / 2, 90, { align: "center" });

  // Client name
  doc.setFontSize(20);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(220, 225, 230);
  doc.text(data.clientName, pageWidth / 2, 115, { align: "center" });

  // Site address
  if (data.siteAddress) {
    doc.setFontSize(12);
    doc.setTextColor(180, 185, 190);
    doc.text(data.siteAddress, pageWidth / 2, 130, { align: "center" });
  }

  // Quote reference and date
  doc.setFontSize(11);
  doc.setTextColor(150, 155, 160);
  doc.text(`Ref: ${data.quoteNumber}`, pageWidth / 2, 155, { align: "center" });
  doc.text(dateStr, pageWidth / 2, 163, { align: "center" });

  // Grand total highlight
  doc.setFillColor(45, 120, 100);
  doc.roundedRect(pageWidth / 2 - 50, 185, 100, 30, 3, 3, "F");
  doc.setFontSize(10);
  doc.setTextColor(200, 230, 220);
  doc.text("TOTAL (inc GST)", pageWidth / 2, 195, { align: "center" });
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(255, 255, 255);
  doc.text(formatCurrency(data.grandTotalIncGst), pageWidth / 2, 208, { align: "center" });

  // Company footer - use branch details if available, fallback to company details
  const footerPhone = data.branchDetails?.phone || company.phone;
  const footerEmail = data.branchDetails?.email || company.email;
  const footerAddress = data.branchDetails?.address || company.address;
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(160, 165, 170);
  doc.text(company.companyName, pageWidth / 2, pageHeight - 55, { align: "center" });
  if (data.branchDetails?.name) {
    doc.setFontSize(9);
    doc.text(data.branchDetails.name, pageWidth / 2, pageHeight - 48, { align: "center" });
  }
  doc.setFontSize(10);
  if (footerPhone || footerEmail) {
    doc.text(
      [footerPhone, footerEmail].filter(Boolean).join(" | "),
      pageWidth / 2,
      pageHeight - 41,
      { align: "center" }
    );
  }
  if (footerAddress) {
    doc.setFontSize(9);
    doc.text(footerAddress, pageWidth / 2, pageHeight - 34, { align: "center" });
  }
  if (company.website) {
    doc.text(company.website, pageWidth / 2, pageHeight - 27, { align: "center" });
  }
  if (company.licenceACT || company.licenceNSW) {
    doc.setFontSize(8);
    doc.setTextColor(120, 125, 130);
    const licences = [
      company.licenceACT ? `ACT: ${company.licenceACT}` : "",
      company.licenceNSW ? `NSW: ${company.licenceNSW}` : "",
    ]
      .filter(Boolean)
      .join(" | ");
    doc.text(licences, pageWidth / 2, pageHeight - 20, { align: "center" });
  }
}

// ─── Page Header ───────────────────────────────────────────────────────────────
function drawPageHeader(
  doc: jsPDF,
  logo: CustomLogo | null,
  dateStr: string,
  quoteRef: string,
  pageWidth: number
): number {
  if (logo) {
    const { w, h } = logoSize(logo, 30, 12);
    doc.addImage(logo.dataUrl, logo.dataUrl.includes("image/jpeg") || logo.dataUrl.includes("image/jpg") ? "JPEG" : "PNG", 14, 10, w, h);
  }
  doc.setFontSize(8);
  doc.setTextColor(140, 140, 140);
  doc.text(`Ref: ${quoteRef}`, pageWidth - 14, 14, { align: "right" });
  doc.text(dateStr, pageWidth - 14, 19, { align: "right" });

  // Separator line
  doc.setDrawColor(220, 220, 220);
  doc.setLineWidth(0.3);
  doc.line(14, 28, pageWidth - 14, 28);

  return 36; // y position after header
}

// ─── Project Details ───────────────────────────────────────────────────────────
function drawProjectDetails(
  doc: jsPDF,
  data: ProposalQuoteData,
  proposalText: ProposalText,
  startY: number,
  margin: number,
  contentWidth: number,
  pageWidth: number
): number {
  let y = startY;

  // Introduction
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(30, 35, 40);
  doc.text(proposalText.introTitle, margin, y);
  y += 8;

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(60, 65, 70);
  const introLines = doc.splitTextToSize(proposalText.introBody, contentWidth);
  doc.text(introLines, margin, y);
  y += introLines.length * 5 + 10;

  // Client details table
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(30, 35, 40);
  doc.text("Client Details", margin, y);
  y += 6;

  const clientRows = [
    ["Client", data.clientName],
    ["Site Address", data.siteAddress || "—"],
    ["Phone", data.clientPhone || "—"],
    ["Email", data.clientEmail || "—"],
    ["Region", data.region || "—"],
  ];

  autoTable(doc, {
    startY: y,
    head: [],
    body: clientRows,
    theme: "plain",
    styles: { fontSize: 9, cellPadding: 3, textColor: [50, 55, 60] },
    columnStyles: {
      0: { fontStyle: "bold", cellWidth: 35, textColor: [80, 85, 90] },
      1: { cellWidth: contentWidth - 35 },
    },
    margin: { left: margin, right: margin },
  });
  y = (doc as any).lastAutoTable.finalY + 12;

  // Scope of works
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(30, 35, 40);
  doc.text(proposalText.scopeTitle, margin, y);
  y += 6;

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(60, 65, 70);
  const scopeLines = doc.splitTextToSize(proposalText.scopeBody, contentWidth);
  doc.text(scopeLines, margin, y);
  y += scopeLines.length * 5 + 8;

  // Description of work
  if (data.descriptionOfWork) {
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(30, 35, 40);
    doc.text("Description of Work", margin, y);
    y += 6;

    doc.setFont("helvetica", "normal");
    doc.setTextColor(60, 65, 70);
    const descLines = doc.splitTextToSize(data.descriptionOfWork, contentWidth);
    doc.text(descLines, margin, y);
    y += descLines.length * 5 + 8;
  }

  return y;
}

// ─── Roof Diagram Page ─────────────────────────────────────────────────────────
function drawRoofDiagramPage(
  doc: jsPDF,
  data: ProposalQuoteData,
  startY: number,
  margin: number,
  contentWidth: number,
  pageWidth: number,
  pageHeight: number
): number {
  let y = startY;

  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(30, 35, 40);
  doc.text("Structure Diagram", margin, y);
  y += 10;

  // Generate roof diagram
  const roofType = parseRoofType(data.specRoofType);
  const width = parseFloat(data.specWidth || "4") * 1000;
  const length = parseFloat(data.specLength || "3") * 1000;
  const height = parseFloat(data.specFloorHeight || "2.4") * 1000;

  const diagramOptions: RoofDiagramOptions = {
    roofType,
    width,
    length,
    height,
    roofColour: data.specRoofTopColour || "Monument",
    wallColour: data.specBeamColour || "Surfmist",
    postColour: data.specPostsColour || "Monument",
    label: `${data.clientName} — ${data.siteAddress || ""}`,
    showDimensions: true,
  };

  const diagramUrl = renderRoofDiagram(diagramOptions);

  // Embed diagram in PDF — canvas is 1200x800 (3:2 aspect)
  const imgW = contentWidth;
  const imgH = imgW * (800 / 1200); // canvas aspect ratio 1200:800

  if (y + imgH > pageHeight - 20) {
    doc.addPage();
    y = 36;
  }

  doc.addImage(diagramUrl, "PNG", margin, y, imgW, imgH);
  y += imgH + 8;

  // Dimensions summary below diagram
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(80, 85, 90);

  const roofTypeLabel = roofType === "split_gable" ? "Split Gable" : roofType.charAt(0).toUpperCase() + roofType.slice(1);
  const dimText = `Roof Type: ${roofTypeLabel}  |  Width: ${data.specWidth || "—"}m  |  Length: ${data.specLength || "—"}m  |  Height: ${data.specFloorHeight || "—"}m`;
  doc.text(dimText, pageWidth / 2, y, { align: "center" });
  y += 10;

  return y;
}// ─── Site Plan & Elevation ───────────────────────────────────────────────────────────
/**
 * Draw site plan on A4 portrait page — consistent with other proposal pages.
 * Renders the satellite image + boundary + structure at a resolution suitable for A4.
 */
async function drawSitePlanPageA4(
  doc: jsPDF,
  data: ProposalQuoteData,
  startY: number,
  margin: number,
  contentWidth: number,
  pageWidth: number,
  pageHeight: number
): Promise<number> {
  let y = startY;

  // Title
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(30, 35, 40);
  doc.text("Site Plan", margin, y);
  y += 6;

  const sp = data.sitePlan;
  if (sp?.lotId || sp?.suburb) {
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(80, 85, 90);
    const lotLine = [sp.lotId, sp.suburb, sp.areaSqm ? `${sp.areaSqm.toFixed(0)} m²` : ""].filter(Boolean).join(" • ");
    doc.text(lotLine, margin, y);
    y += 6;
  }

  // Render site plan canvas — 4:3 aspect for A4 portrait
  const canvasW = 1600;
  const canvasH = 1200;
  const sitePlanCanvas = await renderSitePlanToCanvas(data, canvasW, canvasH);
  if (sitePlanCanvas) {
    const imgData = sitePlanCanvas.toDataURL("image/png");
    const imgW = contentWidth;
    const imgH = imgW * (canvasH / canvasW);
    // Check if it fits on the page
    if (y + imgH > pageHeight - 30) {
      doc.addPage();
      y = 36;
    }
    doc.addImage(imgData, "PNG", margin, y, imgW, imgH);
    y += imgH + 6;
  }

  // Dimensions & setbacks summary below
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(80, 85, 90);
  const parts: string[] = [];
  if (data.specWidth) parts.push(`Structure: ${data.specWidth}m \u00D7 ${data.specProjection || data.specLength || ""}m`);
  if (sp?.frontageM) parts.push(`Frontage: ${sp.frontageM.toFixed(1)}m`);
  if (sp?.depthM) parts.push(`Depth: ${sp.depthM.toFixed(1)}m`);
  const setbacks: string[] = [];
  if (data.specSetbackFront) setbacks.push(`Front: ${(parseFloat(data.specSetbackFront) / 1000).toFixed(1)}m`);
  if (data.specSetbackRear) setbacks.push(`Rear: ${(parseFloat(data.specSetbackRear) / 1000).toFixed(1)}m`);
  if (data.specSetbackLeft) setbacks.push(`Left: ${(parseFloat(data.specSetbackLeft) / 1000).toFixed(1)}m`);
  if (data.specSetbackRight) setbacks.push(`Right: ${(parseFloat(data.specSetbackRight) / 1000).toFixed(1)}m`);
  const bottomText = [...parts, setbacks.length > 0 ? `Setbacks: ${setbacks.join(", ")}` : ""].filter(Boolean).join("  |  ");
  if (bottomText) {
    doc.text(bottomText, pageWidth / 2, y, { align: "center" });
    y += 8;
  }

  return y;
}

/**
 * Draw front and side elevations on an A4 portrait page.
 */
function drawElevationsPage(
  doc: jsPDF,
  data: ProposalQuoteData,
  startY: number,
  margin: number,
  contentWidth: number,
  pageWidth: number,
  pageHeight: number
): number {
  let y = startY;

  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(30, 35, 40);
  doc.text("Elevations", margin, y);
  y += 8;

  // Render front elevation
  const elevCanvas = renderElevationToCanvas(data, contentWidth * 2.5, contentWidth * 1.5, "front");
  if (elevCanvas) {
    const imgData = elevCanvas.toDataURL("image/png");
    const imgW = contentWidth * 0.85;
    const imgH = imgW * (1.5 / 2.5);
    if (y + imgH > pageHeight - 20) {
      doc.addPage();
      y = 36;
    }
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(30, 35, 40);
    doc.text("Front Elevation", margin, y);
    y += 5;
    doc.addImage(imgData, "PNG", margin, y, imgW, imgH);
    y += imgH + 8;
  }

  // Render side elevation
  const sideElevCanvas = renderElevationToCanvas(data, contentWidth * 2.5, contentWidth * 1.5, "side");
  if (sideElevCanvas) {
    const imgData = sideElevCanvas.toDataURL("image/png");
    const imgW = contentWidth * 0.85;
    const imgH = imgW * (1.5 / 2.5);
    if (y + imgH > pageHeight - 20) {
      doc.addPage();
      y = 36;
    }
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(30, 35, 40);
    doc.text("Side Elevation", margin, y);
    y += 5;
    doc.addImage(imgData, "PNG", margin, y, imgW, imgH);
    y += imgH + 8;
  }

  return y;
}

/**
 * Compute optimal zoom level based on boundary extents or property dimensions.
 * Uses the same formula as the live SitePlanDiagram component.
 */
function computeAutoZoom(sp: ProposalQuoteData["sitePlan"], frontageM: number, depthM: number): number {
  if (sp?.boundaryCoords && sp.boundaryCoords.length >= 3 && sp.centroid) {
    let minLng = Infinity, maxLng = -Infinity, minLat = Infinity, maxLat = -Infinity;
    for (const [lng, lat] of sp.boundaryCoords) {
      if (lng < minLng) minLng = lng;
      if (lng > maxLng) maxLng = lng;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
    }
    const midLat = (minLat + maxLat) / 2;
    const extentLngM = (maxLng - minLng) * 111320 * Math.cos(midLat * Math.PI / 180);
    const extentLatM = (maxLat - minLat) * 111320;
    const maxExtentM = Math.max(extentLngM, extentLatM);
    const cosLat = Math.cos(midLat * Math.PI / 180);
    const targetZoom = Math.log2((0.7 * 480 * 156543.03 * cosLat) / maxExtentM);
    return Math.max(15, Math.min(21, Math.floor(targetZoom)));
  }
  const maxDim = Math.max(frontageM, depthM);
  if (maxDim > 100) return 16;
  if (maxDim > 60) return 17;
  if (maxDim > 40) return 18;
  if (maxDim > 20) return 19;
  return 20;
}

/**
 * Render a simplified site plan to an offscreen canvas for PDF export
 */
async function renderSitePlanToCanvas(data: ProposalQuoteData, canvasW: number, canvasH: number): Promise<HTMLCanvasElement | null> {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = canvasW;
    canvas.height = canvasH;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    const sp = data.sitePlan;
    const frontageM = sp?.frontageM || 15;
    const depthM = sp?.depthM || 30;
    // Scale factor: base design is 450x360 canvas, scale everything proportionally
    const sf = Math.min(canvasW / 450, canvasH / 360);
    const padding = Math.round(60 * sf);
    const drawW = canvasW - padding * 2;
    const drawH = canvasH - padding * 2;
    const scale = Math.min(drawW / frontageM, drawH / depthM);
    const propW = frontageM * scale;
    const propH = depthM * scale;
    const propX = (canvasW - propW) / 2;
    const propY = (canvasH - propH) / 2;

    // Background - try satellite image if centroid is available
    ctx.fillStyle = "#f8f9fa";
    ctx.fillRect(0, 0, canvasW, canvasH);

    if (sp?.satelliteDataUrl) {
      // Use pre-fetched satellite data URL
      try {
        const satImg = await loadImage(sp.satelliteDataUrl);
        if (satImg) {
          ctx.drawImage(satImg, 0, 0, canvasW, canvasH);
          ctx.fillStyle = "rgba(255, 255, 255, 0.15)";
          ctx.fillRect(0, 0, canvasW, canvasH);
        }
      } catch {
        // Satellite load failed — keep the plain background
      }
    } else if (sp?.centroid && sp.centroid[0] && sp.centroid[1]) {
      // Fetch satellite image via server-side tRPC endpoint
      try {
        const [lng, lat] = sp.centroid;
        const zoom = computeAutoZoom(sp, frontageM, depthM);
        const batchInput = JSON.stringify({ "0": { json: { lat, lng, zoom, width: 640, height: 480 } } });
        const resp = await fetch(`/api/trpc/quotes.staticMapImage?batch=1&input=${encodeURIComponent(batchInput)}`);
        if (resp.ok) {
          const json = await resp.json();
          // Batch response: [{result:{data:{json:{dataUrl:...}}}}]
          const dataUrl = Array.isArray(json) ? json[0]?.result?.data?.json?.dataUrl : json?.result?.data?.dataUrl;
          if (dataUrl) {
            const satImg = await loadImage(dataUrl);
            if (satImg) {
              ctx.drawImage(satImg, 0, 0, canvasW, canvasH);
              ctx.fillStyle = "rgba(255, 255, 255, 0.15)";
              ctx.fillRect(0, 0, canvasW, canvasH);
            }
          }
        }
      } catch {
        // Satellite load failed — keep the plain background
      }
    }

     // Property boundary
    if (sp?.boundaryCoords && sp.boundaryCoords.length >= 3) {
      // Use Mercator projection when centroid is available (matches satellite image)
      const useMercator = !!(sp.centroid && sp.centroid[0] && sp.centroid[1]);
      let polyPoints: { x: number; y: number }[] = [];

      if (useMercator) {
        const [centerLng, centerLat] = sp.centroid!;
        const zoom = computeAutoZoom(sp, frontageM, depthM);
        const worldScale = 256 * Math.pow(2, zoom);
        const centerWorldX = ((centerLng + 180) / 360) * worldScale;
        const centerWorldY = (worldScale / 2) - (worldScale * Math.log(Math.tan(Math.PI / 4 + (centerLat * Math.PI / 180) / 2)) / (2 * Math.PI));
        // The satellite image fetched is 640x480, rendered to fill canvasW x canvasH
        const imgW = 640;
        const imgH = 480;
        polyPoints = sp.boundaryCoords.map(([lng, lat]) => {
          const worldX = ((lng + 180) / 360) * worldScale;
          const worldY = (worldScale / 2) - (worldScale * Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI / 180) / 2)) / (2 * Math.PI));
          const px = (worldX - centerWorldX) + imgW / 2;
          const py = (worldY - centerWorldY) + imgH / 2;
          return { x: (px / imgW) * canvasW, y: (py / imgH) * canvasH };
        });
      } else {
        let minLng = Infinity, maxLng = -Infinity, minLat = Infinity, maxLat = -Infinity;
        for (const [lng, lat] of sp.boundaryCoords) {
          if (lng < minLng) minLng = lng;
          if (lng > maxLng) maxLng = lng;
          if (lat < minLat) minLat = lat;
          if (lat > maxLat) maxLat = lat;
        }
        const coordW = maxLng - minLng;
        const coordH = maxLat - minLat;
        if (coordW > 0 && coordH > 0) {
          const polyDrawW = canvasW - padding * 2;
          const polyDrawH = canvasH - padding * 2;
          const polyScale = Math.min(polyDrawW / coordW, polyDrawH / coordH) * 0.85;
          const polyOffX = (canvasW - coordW * polyScale) / 2;
          const polyOffY = (canvasH - coordH * polyScale) / 2;
          polyPoints = sp.boundaryCoords.map(([lng, lat]) => ({
            x: (lng - minLng) * polyScale + polyOffX,
            y: (maxLat - lat) * polyScale + polyOffY,
          }));
        }
      }

      if (polyPoints.length >= 3) {
        ctx.strokeStyle = "#DAA520";
        ctx.lineWidth = Math.max(3, Math.round(3 * sf));
        ctx.setLineDash([]);
        ctx.beginPath();
        polyPoints.forEach((pt, i) => {
          if (i === 0) ctx.moveTo(pt.x, pt.y);
          else ctx.lineTo(pt.x, pt.y);
        });
        ctx.closePath();
        ctx.stroke();

        // Edge dimension labels on ALL sides
        const edgeFontSize = Math.max(12, Math.round(12 * sf));
        ctx.font = `bold ${edgeFontSize}px sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        for (let i = 0; i < sp.boundaryCoords.length; i++) {
          const j = (i + 1) % sp.boundaryCoords.length;
          const [lng1, lat1] = sp.boundaryCoords[i];
          const [lng2, lat2] = sp.boundaryCoords[j];
          const dLat = (lat2 - lat1) * 111320;
          const dLng = (lng2 - lng1) * 111320 * Math.cos(((lat1 + lat2) / 2) * Math.PI / 180);
          const distM = Math.sqrt(dLat * dLat + dLng * dLng);
          if (distM < 0.5) continue;
          const x1 = polyPoints[i].x;
          const y1 = polyPoints[i].y;
          const x2 = polyPoints[j].x;
          const y2 = polyPoints[j].y;
          const mx = (x1 + x2) / 2;
          const my = (y1 + y2) / 2;
          const angle = Math.atan2(y2 - y1, x2 - x1);
          // Offset perpendicular to the edge, outward from polygon centroid
          const perpX = Math.cos(angle + Math.PI / 2);
          const perpY = Math.sin(angle + Math.PI / 2);
          // Determine which side is "outward" by checking if offset moves away from centroid
          const cx = polyPoints.reduce((s, p) => s + p.x, 0) / polyPoints.length;
          const cy = polyPoints.reduce((s, p) => s + p.y, 0) / polyPoints.length;
          const testDist = 20 * sf;
          const testX = mx + perpX * testDist;
          const testY = my + perpY * testDist;
          const distFromCenter = Math.hypot(testX - cx, testY - cy);
          const distFromCenterOpp = Math.hypot(mx - perpX * testDist - cx, my - perpY * testDist - cy);
          const sign = distFromCenter > distFromCenterOpp ? 1 : -1;
          const offsetDist = Math.round(18 * sf);
          const lx = mx + perpX * offsetDist * sign;
          const ly = my + perpY * offsetDist * sign;
          // Draw background pill
          const label = `${distM.toFixed(1)}m`;
          const textW = ctx.measureText(label).width + Math.round(8 * sf);
          const pillH = Math.round(16 * sf);
          ctx.save();
          ctx.translate(lx, ly);
          // Rotate text to align with edge
          let textAngle = angle;
          if (textAngle > Math.PI / 2) textAngle -= Math.PI;
          if (textAngle < -Math.PI / 2) textAngle += Math.PI;
          ctx.rotate(textAngle);
          ctx.fillStyle = "rgba(0, 0, 0, 0.8)";
          ctx.beginPath();
          ctx.roundRect(-textW / 2, -pillH / 2, textW, pillH, Math.round(3 * sf));
          ctx.fill();
          ctx.fillStyle = "#FFD700";
          ctx.fillText(label, 0, 0);
          ctx.restore();
        }
        ctx.textBaseline = "alphabetic";

        // Setback envelope (dashed inset polygon) — per-side inset
        const hasSetbacks = data.specSetbackFront || data.specSetbackRear || data.specSetbackLeft || data.specSetbackRight;
        if (hasSetbacks) {
          const setbackFrontM = data.specSetbackFront ? parseFloat(data.specSetbackFront) / 1000 : 0;
          const setbackRearM = data.specSetbackRear ? parseFloat(data.specSetbackRear) / 1000 : 0;
          const setbackLeftM = data.specSetbackLeft ? parseFloat(data.specSetbackLeft) / 1000 : 0;
          const setbackRightM = data.specSetbackRight ? parseFloat(data.specSetbackRight) / 1000 : 0;

          // Calibrate pixels-per-metre from the first boundary edge
          let pxPerM = 1;
          if (sp.boundaryCoords.length >= 2) {
            const [lng1, lat1] = sp.boundaryCoords[0];
            const [lng2, lat2] = sp.boundaryCoords[1];
            const dLat = (lat2 - lat1) * 111320;
            const dLng = (lng2 - lng1) * 111320 * Math.cos(((lat1 + lat2) / 2) * Math.PI / 180);
            const edgeM = Math.sqrt(dLat * dLat + dLng * dLng);
            const edgePx = Math.hypot(polyPoints[1].x - polyPoints[0].x, polyPoints[1].y - polyPoints[0].y);
            if (edgeM > 0.5 && edgePx > 1) pxPerM = edgePx / edgeM;
          }

          const setbacksPx: PerSideSetbacks = {
            front: setbackFrontM * pxPerM,
            rear: setbackRearM * pxPerM,
            left: setbackLeftM * pxPerM,
            right: setbackRightM * pxPerM,
          };

          const insetPts = computePerSideInset(polyPoints, setbacksPx);
          if (insetPts) {
            const sbColor = data.specSetbackColor || "#FF8C00";
            ctx.strokeStyle = sbColor;
            ctx.lineWidth = Math.max(2, Math.round(2 * sf));
            ctx.setLineDash([Math.round(8 * sf), Math.round(4 * sf)]);
            ctx.beginPath();
            insetPts.forEach((pt, i) => {
              if (i === 0) ctx.moveTo(pt.x, pt.y);
              else ctx.lineTo(pt.x, pt.y);
            });
            ctx.closePath();
            ctx.stroke();
            ctx.setLineDash([]);

            // Setback label pill
            const setbackLabel = `Setbacks: F${setbackFrontM.toFixed(1)}m R${setbackRearM.toFixed(1)}m L${setbackLeftM.toFixed(1)}m R${setbackRightM.toFixed(1)}m`;
            const slFontSize = Math.max(9, Math.round(9 * sf));
            ctx.font = `${slFontSize}px sans-serif`;
            const slW = ctx.measureText(setbackLabel).width + Math.round(10 * sf);
            const slH = Math.round(14 * sf);
            const slX = canvasW / 2 - slW / 2;
            const slY = canvasH - Math.round(50 * sf);
            ctx.fillStyle = "rgba(0,0,0,0.7)";
            ctx.beginPath();
            ctx.roundRect(slX, slY, slW, slH, Math.round(3 * sf));
            ctx.fill();
            ctx.fillStyle = sbColor;
            ctx.textAlign = "center";
            ctx.fillText(setbackLabel, canvasW / 2, slY + slH - Math.round(3 * sf));
          }
        }
      }
    } else {
      // Fallback rectangle boundary
      ctx.strokeStyle = "#DAA520";
      ctx.lineWidth = Math.max(3, Math.round(3 * sf));
      ctx.setLineDash([Math.round(10 * sf), Math.round(5 * sf)]);
      ctx.strokeRect(propX, propY, propW, propH);
      ctx.setLineDash([]);
    }

    // Structure footprint (with offset and rotation support)
    const structWidthM = parseFloat(data.specWidth || "0");
    const structLengthM = parseFloat(data.specProjection || data.specLength || "0");
    if (structWidthM > 0 && structLengthM > 0) {
      const sw = structWidthM * scale;
      const sh = structLengthM * scale;
      // Default center: middle of property, offset 35% down
      let centerX = propX + propW / 2;
      let centerY = propY + propH * 0.35 + sh / 2;
      // Apply user offset if available (offset is in metres, convert to pixels)
      if (sp?.structureOffsetX) centerX += sp.structureOffsetX * scale;
      if (sp?.structureOffsetY) centerY += sp.structureOffsetY * scale;
      const rotDeg = sp?.structureRotation || 0;

      ctx.save();
      ctx.translate(centerX, centerY);
      if (rotDeg !== 0) ctx.rotate((rotDeg * Math.PI) / 180);
      ctx.fillStyle = "rgba(34, 197, 94, 0.25)";
      ctx.fillRect(-sw / 2, -sh / 2, sw, sh);
      ctx.strokeStyle = "rgba(34, 197, 94, 0.9)";
      ctx.lineWidth = Math.max(3, Math.round(3 * sf));
      ctx.strokeRect(-sw / 2, -sh / 2, sw, sh);

      // Structure label
      ctx.fillStyle = "#166534";
      ctx.font = `bold ${Math.max(14, Math.round(14 * sf))}px sans-serif`;
      ctx.textAlign = "center";
      ctx.fillText("STRUCTURE", 0, -Math.round(5 * sf));
      ctx.font = `${Math.max(12, Math.round(12 * sf))}px sans-serif`;
      ctx.fillText(`${structWidthM.toFixed(1)}m × ${structLengthM.toFixed(1)}m`, 0, Math.round(12 * sf));

      // Post position markers — drawn inside the rotated context
      if (data.postPositions && data.postPositions.length > 0) {
        const halfW = sw / 2;
        const halfH = sh / 2;
        // Edge definitions relative to structure center: A=top-left, B=top-right, C=bottom-right, D=bottom-left
        const edgeMap: Record<string, { x1: number; y1: number; x2: number; y2: number }> = {
          "A-B": { x1: -halfW, y1: -halfH, x2: halfW, y2: -halfH },
          "B-C": { x1: halfW, y1: -halfH, x2: halfW, y2: halfH },
          "C-D": { x1: halfW, y1: halfH, x2: -halfW, y2: halfH },
          "D-A": { x1: -halfW, y1: halfH, x2: -halfW, y2: -halfH },
        };
        const postRadius = Math.max(5, Math.round(5 * sf));
        for (const marker of data.postPositions) {
          const [side, pctStr] = marker.split(":");
          const pct = parseInt(pctStr, 10) / 100;
          const edge = edgeMap[side];
          if (!edge) continue;
          const px = edge.x1 + (edge.x2 - edge.x1) * pct;
          const py = edge.y1 + (edge.y2 - edge.y1) * pct;
          // Filled green circle with white border
          ctx.beginPath();
          ctx.arc(px, py, postRadius, 0, Math.PI * 2);
          ctx.fillStyle = "#16a34a";
          ctx.fill();
          ctx.strokeStyle = "#ffffff";
          ctx.lineWidth = Math.max(1.5, Math.round(2 * sf));
          ctx.setLineDash([]);
          ctx.stroke();
        }
        // Post count label below structure
        ctx.fillStyle = "#16a34a";
        const postFontSize = Math.max(11, Math.round(11 * sf));
        ctx.font = `bold ${postFontSize}px sans-serif`;
        ctx.textAlign = "center";
        ctx.fillText(`${data.postPositions.length} post${data.postPositions.length !== 1 ? "s" : ""}`, 0, halfH + Math.round(18 * sf));
      }

      ctx.restore();
    }

    // Dimension labels
    ctx.fillStyle = "#333";
    ctx.font = `bold ${Math.max(12, Math.round(12 * sf))}px sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText(`${frontageM.toFixed(1)}m`, propX + propW / 2, propY + propH + Math.round(25 * sf));
    ctx.save();
    ctx.translate(propX - Math.round(20 * sf), propY + propH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText(`${depthM.toFixed(1)}m`, 0, 0);
    ctx.restore();

    // Lot ID
    if (sp?.lotId) {
      ctx.fillStyle = "#555";
      ctx.font = `bold ${Math.max(11, Math.round(11 * sf))}px sans-serif`;
      ctx.textAlign = "left";
      ctx.fillText(sp.lotId, propX + Math.round(5 * sf), propY + Math.round(15 * sf));
    }
    if (sp?.suburb) {
      ctx.fillStyle = "#777";
      ctx.font = `${Math.max(10, Math.round(10 * sf))}px sans-serif`;
      ctx.textAlign = "left";
      ctx.fillText(sp.suburb, propX + Math.round(5 * sf), propY + Math.round(28 * sf));
    }

    // North arrow (scaled)
    const arrowMargin = Math.round(30 * sf);
    const arrowTopY = Math.round(25 * sf);
    ctx.fillStyle = "#333";
    ctx.font = `bold ${Math.max(10, Math.round(10 * sf))}px sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText("N", canvasW - arrowMargin, arrowTopY);
    ctx.beginPath();
    ctx.moveTo(canvasW - arrowMargin, arrowTopY + Math.round(3 * sf));
    ctx.lineTo(canvasW - arrowMargin, arrowTopY + Math.round(25 * sf));
    ctx.strokeStyle = "#333";
    ctx.lineWidth = Math.max(2, Math.round(2 * sf));
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(canvasW - arrowMargin - Math.round(5 * sf), arrowTopY + Math.round(10 * sf));
    ctx.lineTo(canvasW - arrowMargin, arrowTopY + Math.round(3 * sf));
    ctx.lineTo(canvasW - arrowMargin + Math.round(5 * sf), arrowTopY + Math.round(10 * sf));
    ctx.fill();

    // Street label
    ctx.fillStyle = "#666";
    ctx.font = `${Math.max(9, Math.round(9 * sf))}px sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText("STREET FRONTAGE", canvasW / 2, canvasH - Math.round(10 * sf));

    // Scale bar (bottom-left corner)
    {
      // Determine metres-per-pixel from the Mercator zoom or fallback scale
      let metersPerPx: number;
      if (sp?.centroid && sp?.boundaryCoords && sp.boundaryCoords.length >= 3) {
        const zoom = computeAutoZoom(sp, frontageM, depthM);
        const lat = sp.centroid[1];
        // Google Static Maps: resolution = 156543.03 * cos(lat) / 2^zoom  (metres per pixel)
        // The fetched image is 640px wide, rendered to canvasW
        metersPerPx = (156543.03 * Math.cos(lat * Math.PI / 180) / Math.pow(2, zoom)) * (640 / canvasW);
      } else {
        metersPerPx = frontageM / propW;
      }

      // Choose a nice round scale bar length
      const targetBarPx = Math.round(100 * sf); // scale bar width scales with canvas
      const targetMeters = targetBarPx * metersPerPx;
      const niceSteps = [1, 2, 5, 10, 15, 20, 25, 30, 40, 50, 75, 100, 150, 200, 500];
      let scaleM = niceSteps[0];
      for (const s of niceSteps) {
        if (s <= targetMeters * 1.5) scaleM = s;
      }
      const barPx = scaleM / metersPerPx;

      const barX = Math.round(15 * sf);
      const barY = canvasH - Math.round(25 * sf);
      const barH = Math.round(6 * sf);

      // Background
      ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
      ctx.beginPath();
      ctx.roundRect(barX - Math.round(4 * sf), barY - Math.round(16 * sf), barPx + Math.round(8 * sf), barH + Math.round(24 * sf), Math.round(4 * sf));
      ctx.fill();

      // Bar segments (alternating black/white)
      const segments = 2;
      const segW = barPx / segments;
      for (let s = 0; s < segments; s++) {
        ctx.fillStyle = s % 2 === 0 ? "#ffffff" : "#999999";
        ctx.fillRect(barX + s * segW, barY, segW, barH);
      }
      // Border
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 1;
      ctx.strokeRect(barX, barY, barPx, barH);

      // Tick marks at start, middle, end
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 1;
      for (let t = 0; t <= segments; t++) {
        const tx = barX + t * segW;
        ctx.beginPath();
        ctx.moveTo(tx, barY - Math.round(2 * sf));
        ctx.lineTo(tx, barY + barH + Math.round(2 * sf));
        ctx.stroke();
      }

      // Labels
      ctx.fillStyle = "#ffffff";
      ctx.font = `bold ${Math.max(9, Math.round(9 * sf))}px sans-serif`;
      ctx.textAlign = "left";
      ctx.textBaseline = "bottom";
      ctx.fillText("0", barX, barY - Math.round(3 * sf));
      ctx.textAlign = "right";
      ctx.fillText(`${scaleM}m`, barX + barPx, barY - Math.round(3 * sf));
      ctx.textBaseline = "alphabetic";
    }

    return canvas;
  } catch {
    return null;
  }
}

/**
 * Render a simplified front elevation to an offscreen canvas for PDF export
 */
function renderElevationToCanvas(data: ProposalQuoteData, canvasW: number, canvasH: number, view: "front" | "side" = "front"): HTMLCanvasElement | null {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = canvasW;
    canvas.height = canvasH;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    // Background
    ctx.fillStyle = "#f8f9fa";
    ctx.fillRect(0, 0, canvasW, canvasH);

    if (view === "side") {
      return renderSideElevationCanvas(ctx, data, canvasW, canvasH);
    }

    // ─── FRONT ELEVATION (original logic) ─────────────────────────────────────
    const widthM = parseFloat(data.specWidth || "4");
    const heightM = parseFloat(data.specFloorHeight || "2.4");
    const floorToGroundM = parseFloat(data.specFloorToGround || "0.3");
    const displayWidthM = widthM;

    const padding = 50;
    const drawW = canvasW - padding * 2;
    const drawH = canvasH - padding * 2;
    const scaleX = drawW / displayWidthM;
    const scaleY = drawH / (heightM + floorToGroundM + 0.5);
    const scale = Math.min(scaleX, scaleY);

    const structW = displayWidthM * scale;
    const structH = heightM * scale;
    const groundH = floorToGroundM * scale;
    const baseX = (canvasW - structW) / 2;
    const baseY = canvasH - padding - groundH;

    // Ground line
    ctx.strokeStyle = "#8B4513";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(padding - 20, baseY);
    ctx.lineTo(canvasW - padding + 20, baseY);
    ctx.stroke();

    // Posts
    const numPosts = parseInt(data.specPostsNumber || "2") || 2;
    ctx.strokeStyle = "#555";
    ctx.lineWidth = 4;
    for (let i = 0; i < numPosts; i++) {
      const px = baseX + (i / (numPosts - 1 || 1)) * structW;
      ctx.beginPath();
      ctx.moveTo(px, baseY);
      ctx.lineTo(px, baseY - structH);
      ctx.stroke();
    }

    // Beam
    ctx.strokeStyle = "#333";
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(baseX - 10, baseY - structH);
    ctx.lineTo(baseX + structW + 10, baseY - structH);
    ctx.stroke();

    // Roof
    const roofH = 0.3 * scale;
    ctx.fillStyle = "rgba(100, 100, 100, 0.3)";
    ctx.strokeStyle = "#444";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(baseX - 15, baseY - structH);
    ctx.lineTo(baseX + structW + 15, baseY - structH);
    ctx.lineTo(baseX + structW + 15, baseY - structH - roofH);
    ctx.lineTo(baseX - 15, baseY - structH - roofH);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Dimension labels
    ctx.fillStyle = "#333";
    ctx.font = "bold 12px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(`${displayWidthM.toFixed(1)}m`, baseX + structW / 2, baseY + 25);
    ctx.save();
    ctx.translate(baseX - 25, baseY - structH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText(`${heightM.toFixed(1)}m`, 0, 0);
    ctx.restore();

    // Label
    ctx.fillStyle = "#555";
    ctx.font = "10px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("FRONT ELEVATION", canvasW / 2, 20);

    return canvas;
  } catch {
    return null;
  }
}

/**
 * Render a proper side elevation with house wall, eave-aligned connection, sloped roof, and post.
 * Matches the on-screen SideElevationDiagram true-scale geometry.
 *
 * SVG Math (true-scale):
 *   beamHeight (mm) = height from FFL to underside of beam at house wall (high side)
 *   projection (mm) = horizontal distance from house wall to post line
 *   pitch (°) = roof fall angle
 *   jobEave (mm) = eave overhang width beyond post line
 *
 *   roofDrop = projection × tan(pitch) — vertical fall across projection
 *   eaveDrop = jobEave × tan(pitch) — additional fall past post
 *   postHeight = beamHeight - roofDrop
 *   frontHeight = beamHeight (at wall connection)
 *
 *   Scale: single uniform factor for both X and Y axes
 */
function renderSideElevationCanvas(ctx: CanvasRenderingContext2D, data: ProposalQuoteData, canvasW: number, canvasH: number): HTMLCanvasElement | null {
  const beamMm = parseFloat(data.specFloorHeight || "2400");
  const projMm = parseFloat(data.specProjection || data.specLength || "3") * (beamMm > 100 ? 1 : 1000);
  // If specProjection is in metres (< 100), convert to mm; if already mm, keep as-is
  const projFinal = projMm < 100 ? projMm * 1000 : projMm;
  const floorToGroundM = parseFloat(data.specFloorToGround || "0.3");
  const roofPitch = parseFloat(data.specFall || "2");
  const eaveMm = parseFloat(data.specJobEave || "0") || 0;

  // Convert to metres for scaling
  const beamM = beamMm / 1000;
  const projM = projFinal / 1000;
  const eaveM = eaveMm / 1000;

  const padding = 60;
  const drawW = canvasW - padding * 2;
  const drawH = canvasH - padding * 2;

  // Total real-world extents
  const houseAboveEave = 0.6; // metres of house wall visible above eave
  const houseWallThickM = 0.2;
  const totalWidthM = houseWallThickM + projM + eaveM + 0.3;
  const totalH = beamM + floorToGroundM + houseAboveEave + 0.2;
  const scaleX = drawW / totalWidthM;
  const scaleY = drawH / totalH;
  const scale = Math.min(scaleX, scaleY);

  const groundY = canvasH - padding;
  const baseY = groundY - floorToGroundM * scale;
  const eaveY = baseY - beamM * scale;
  const wallTopY = eaveY - houseAboveEave * scale;

  // House wall on the left
  const wallX = padding + 30;
  const wallW = 20;

  // Post on the right (true-scale distance)
  const postX = wallX + projM * scale;
  const postTopY = eaveY + Math.tan(roofPitch * Math.PI / 180) * projM * scale; // roof drops

  // Eave overhang tip
  const eaveEndX = postX + eaveM * scale;
  const eaveEndY = postTopY + Math.tan(roofPitch * Math.PI / 180) * eaveM * scale;

  // ─── Draw ground ───
  ctx.strokeStyle = "#8B4513";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(padding - 10, groundY);
  ctx.lineTo(canvasW - padding + 10, groundY);
  ctx.stroke();

  // Hatching below ground
  ctx.strokeStyle = "#c4a882";
  ctx.lineWidth = 0.5;
  for (let i = 0; i < canvasW; i += 8) {
    ctx.beginPath();
    ctx.moveTo(i, groundY);
    ctx.lineTo(i - 5, groundY + 6);
    ctx.stroke();
  }

  // ─── House wall (extends from ground up above eave) ───
  ctx.fillStyle = "#e8e0d8";
  ctx.strokeStyle = "#666";
  ctx.lineWidth = 2;
  ctx.fillRect(wallX, wallTopY, wallW, groundY - wallTopY);
  ctx.strokeRect(wallX, wallTopY, wallW, groundY - wallTopY);

  // Brick pattern on wall
  ctx.strokeStyle = "#ccc";
  ctx.lineWidth = 0.5;
  for (let row = 0; row < Math.floor((groundY - wallTopY) / 10); row++) {
    const ry = wallTopY + row * 10;
    ctx.beginPath();
    ctx.moveTo(wallX, ry);
    ctx.lineTo(wallX + wallW, ry);
    ctx.stroke();
    const offset = row % 2 === 0 ? wallW / 2 : 0;
    ctx.beginPath();
    ctx.moveTo(wallX + offset, ry);
    ctx.lineTo(wallX + offset, ry + 10);
    ctx.stroke();
  }

  // ─── House roof (above eave, sloping up-left) ───
  ctx.strokeStyle = "#555";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(wallX + wallW, eaveY);
  ctx.lineTo(wallX - 30, wallTopY - 20);
  ctx.stroke();
  // Roof thickness
  ctx.beginPath();
  ctx.moveTo(wallX + wallW, eaveY - 6);
  ctx.lineTo(wallX - 30, wallTopY - 26);
  ctx.stroke();

  // ─── Fascia at eave ───
  ctx.strokeStyle = "#444";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(wallX + wallW, eaveY - 6);
  ctx.lineTo(wallX + wallW, eaveY);
  ctx.stroke();

  // ─── EAVE LEVEL dashed line ───
  ctx.setLineDash([6, 4]);
  ctx.strokeStyle = "#999";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(wallX - 40, eaveY);
  ctx.lineTo(postX + 30, eaveY);
  ctx.stroke();
  ctx.setLineDash([]);

  // Label
  ctx.fillStyle = "#888";
  ctx.font = "9px sans-serif";
  ctx.textAlign = "right";
  ctx.fillText("EAVE LEVEL", wallX - 5, eaveY - 4);

  // ─── Beam / roof slope from eave to post ───
  ctx.strokeStyle = "#333";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(wallX + wallW, eaveY);
  ctx.lineTo(postX, postTopY);
  ctx.stroke();

  // Roof panel (filled) — extends to eave overhang tip
  ctx.fillStyle = "rgba(100, 120, 140, 0.2)";
  ctx.strokeStyle = "#555";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(wallX + wallW, eaveY);
  ctx.lineTo(eaveEndX, eaveEndY);
  ctx.lineTo(eaveEndX, eaveEndY - 6);
  ctx.lineTo(wallX + wallW, eaveY - 6);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Eave end cap
  ctx.strokeStyle = "#555";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(eaveEndX, eaveEndY - 6);
  ctx.lineTo(eaveEndX, eaveEndY);
  ctx.stroke();

  // ─── Post ───
  ctx.strokeStyle = "#555";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(postX, groundY);
  ctx.lineTo(postX, postTopY);
  ctx.stroke();

  // ─── Dimension labels ───
  ctx.fillStyle = "#333";
  ctx.font = "bold 11px sans-serif";
  ctx.textAlign = "center";

  // Projection (horizontal)
  const projLabelY = groundY + 18;
  ctx.fillText(`${projM.toFixed(1)}m (projection)`, (wallX + wallW + postX) / 2, projLabelY);
  // Arrow line
  ctx.strokeStyle = "#333";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(wallX + wallW, projLabelY - 12);
  ctx.lineTo(postX, projLabelY - 12);
  ctx.stroke();

  // Post height (vertical on post)
  const postHtMm = Math.round(beamMm - projFinal * Math.tan(roofPitch * Math.PI / 180));
  ctx.save();
  ctx.translate(postX + 20, (baseY + postTopY) / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText(`${postHtMm}mm post`, 0, 0);
  ctx.restore();

  // Beam height at wall (vertical on left)
  ctx.save();
  ctx.translate(wallX - 10, (baseY + eaveY) / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText(`${Math.round(beamMm)}mm`, 0, 0);
  ctx.restore();

  // Roof pitch label
  const midRoofX = (wallX + wallW + postX) / 2;
  const midRoofY = (eaveY + postTopY) / 2;
  ctx.fillStyle = "#555";
  ctx.font = "10px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(`${roofPitch}° pitch`, midRoofX, midRoofY - 12);

  // Connection type label
  if (data.connectionType) {
    const connLabels: Record<string, string> = {
      FLY: "Fly-over bracket",
      BCH: "Fascia bracket",
      WFX: "Wall fix bracket",
      GBL: "Gable bracket",
      FSS: "Free-standing",
      POP: "Post on plate",
    };
    const label = connLabels[data.connectionType] || data.connectionType;
    ctx.fillStyle = "#c0392b";
    ctx.font = "bold 9px sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(`CONNECTION: ${label}`, wallX - 10, wallTopY - 8);
  }

  // Title label
  ctx.fillStyle = "#555";
  ctx.font = "10px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("SIDE ELEVATION", canvasW / 2, 20);

  return ctx.canvas;
}

// ─── Pricing Summary ───────────────────────────────────────────────────────────────
function drawPricingSummary( doc: jsPDF,
  data: ProposalQuoteData,
  startY: number,
  margin: number,
  contentWidth: number,
  pageWidth: number
): number {
  let y = startY;

  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(30, 35, 40);
  doc.text("Pricing Summary", margin, y);
  y += 8;

  // ─── Deck proposals: simplified pricing (Area, Sell ex GST, GST, Sell inc GST) ───
  if (data.deckDesign) {
    const boxH = data.deckAreaM2 ? 50 : 40;
    doc.setFillColor(245, 247, 250);
    doc.roundedRect(margin, y, contentWidth, boxH, 2, 2, "F");

    let lineY = y + 12;
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(60, 65, 70);

    if (data.deckAreaM2) {
      doc.text("Deck Area:", margin + 8, lineY);
      doc.text(`${data.deckAreaM2.toFixed(1)} m\u00B2`, margin + contentWidth - 8, lineY, { align: "right" });
      lineY += 10;
    }

    doc.text("Sell (ex GST):", margin + 8, lineY);
    doc.text(formatCurrency(data.grandTotalExGst), margin + contentWidth - 8, lineY, { align: "right" });
    lineY += 10;

    doc.text("GST (10%):", margin + 8, lineY);
    doc.text(formatCurrency(data.gst), margin + contentWidth - 8, lineY, { align: "right" });
    lineY += 10;

    doc.setFontSize(13);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(30, 100, 80);
    doc.text("Sell (inc GST):", margin + 8, lineY);
    doc.text(formatCurrency(data.grandTotalIncGst), margin + contentWidth - 8, lineY, { align: "right" });

    y += boxH + 10;

    // Render dynamic add-on adjustments for deck proposals
    if (data.adjustments.length > 0) {
      const adjBody = data.adjustments.map((a) => [a.name, formatCurrency(a.amount)]);
      autoTable(doc, {
        startY: y,
        head: [["Included Add-Ons", "Amount (ex GST)"]],
        body: adjBody,
        theme: "striped",
        headStyles: {
          fillColor: [50, 60, 70],
          textColor: [255, 255, 255],
          fontSize: 9,
          fontStyle: "bold",
        },
        styles: { fontSize: 9, cellPadding: 4 },
        columnStyles: {
          0: { cellWidth: contentWidth - 45 },
          1: { cellWidth: 45, halign: "right" },
        },
        margin: { left: margin, right: margin },
      });
      y = (doc as any).lastAutoTable.finalY + 8;
    }

    return y;
  }

  // ─── Non-deck proposals: full component breakdown ────────────────────────────
  // Component breakdown table
  const tableBody = data.componentSummary
    .filter((c) => c.amount > 0)
    .map((c) => [c.name, formatCurrency(c.amount)]);

  if (tableBody.length > 0) {
    autoTable(doc, {
      startY: y,
      head: [["Component", "Amount (ex GST)"]],
      body: tableBody,
      theme: "striped",
      headStyles: {
        fillColor: [30, 35, 40],
        textColor: [255, 255, 255],
        fontSize: 9,
        fontStyle: "bold",
      },
      styles: { fontSize: 9, cellPadding: 4 },
      columnStyles: {
        0: { cellWidth: contentWidth - 45 },
        1: { cellWidth: 45, halign: "right" },
      },
      margin: { left: margin, right: margin },
    });
    y = (doc as any).lastAutoTable.finalY + 8;
  }

  // Adjustments
  if (data.adjustments.length > 0) {
    const adjBody = data.adjustments.map((a) => [a.name, formatCurrency(a.amount)]);
    autoTable(doc, {
      startY: y,
      head: [["Adjustment", "Amount"]],
      body: adjBody,
      theme: "plain",
      headStyles: { fontSize: 9, fontStyle: "bold", textColor: [80, 85, 90] },
      styles: { fontSize: 9, cellPadding: 3 },
      columnStyles: {
        0: { cellWidth: contentWidth - 45 },
        1: { cellWidth: 45, halign: "right" },
      },
      margin: { left: margin, right: margin },
    });
    y = (doc as any).lastAutoTable.finalY + 8;
  }

  // Financial Breakdown Details
  if (data.financialBreakdown) {
    const fb = data.financialBreakdown;
    const breakdownRows: string[][] = [];

    if (fb.complexity && fb.complexity.criteria.length > 0) {
      const criteriaStr = fb.complexity.criteria.map(c => `${c.name} (${c.rate}%)`).join(", ");
      breakdownRows.push(["Complexity Loading", `${fb.complexity.total}% — Triggered by: ${criteriaStr}`]);
    }

    if (fb.constructionMgmt && fb.constructionMgmt.percent > 0) {
      breakdownRows.push(["Construction Mgmt %", `${fb.constructionMgmt.percent}% — Roof shape: ${fb.constructionMgmt.roofShape}`]);
    }

    if (fb.delivery && fb.delivery.total > 0) {
      breakdownRows.push(["Delivery", `${fb.delivery.distanceKm}km × $${fb.delivery.ratePerKm.toFixed(2)}/km × ${fb.delivery.factorTier} factor = ${formatCurrency(fb.delivery.total)}`]);
    }

    if (fb.smallJob) {
      if (fb.smallJob.applied) {
        breakdownRows.push(["Small Job Surcharge", `Applied — Subtotal ${formatCurrency(fb.smallJob.subtotal)} below threshold ${formatCurrency(fb.smallJob.threshold)}`]);
      } else {
        breakdownRows.push(["Small Job Surcharge", `Not applied — Subtotal exceeds threshold ${formatCurrency(fb.smallJob.threshold)}`]);
      }
    }

    if (breakdownRows.length > 0) {
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(80, 85, 90);
      doc.text("Calculation Breakdown", margin, y);
      y += 4;

      autoTable(doc, {
        startY: y,
        head: [],
        body: breakdownRows,
        theme: "plain",
        styles: { fontSize: 8, cellPadding: 2.5, textColor: [70, 75, 80] },
        columnStyles: {
          0: { fontStyle: "bold", cellWidth: 42 },
          1: { cellWidth: contentWidth - 42 },
        },
        margin: { left: margin, right: margin },
      });
      y = (doc as any).lastAutoTable.finalY + 8;
    }
  }

  // Totals box
  doc.setFillColor(245, 247, 250);
  doc.roundedRect(margin, y, contentWidth, 40, 2, 2, "F");

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(60, 65, 70);
  doc.text("Subtotal (ex GST):", margin + 8, y + 12);
  doc.text(formatCurrency(data.grandTotalExGst), margin + contentWidth - 8, y + 12, { align: "right" });

  doc.text("GST (10%):", margin + 8, y + 22);
  doc.text(formatCurrency(data.gst), margin + contentWidth - 8, y + 22, { align: "right" });

  doc.setFontSize(13);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(30, 100, 80);
  doc.text("TOTAL (inc GST):", margin + 8, y + 34);
  doc.text(formatCurrency(data.grandTotalIncGst), margin + contentWidth - 8, y + 34, { align: "right" });

  y += 50;

  return y;
}

// ─── Terms & Signature ─────────────────────────────────────────────────────────
function drawTermsAndSignature(
  doc: jsPDF,
  data: ProposalQuoteData,
  proposalText: ProposalText,
  company: CompanyDetails,
  startY: number,
  margin: number,
  contentWidth: number,
  pageWidth: number,
  pageHeight: number
): { y: number; signatureY: number } {
  let y = startY;

  // Warranty section
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

  // Progress payments (if available)
  if (data.progressPayments && Object.keys(data.progressPayments).length > 0) {
    const paymentEntries = Object.entries(data.progressPayments).filter(([_, v]) => v && v !== "0");
    if (paymentEntries.length > 0) {
      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(30, 35, 40);
      doc.text("Progress Payments", margin, y);
      y += 6;

      const payBody = paymentEntries.map(([k, v]) => [k, `$${v}`]);
      autoTable(doc, {
        startY: y,
        head: [],
        body: payBody,
        theme: "plain",
        styles: { fontSize: 9, cellPadding: 2.5 },
        columnStyles: {
          0: { cellWidth: contentWidth - 35, textColor: [60, 65, 70] },
          1: { cellWidth: 35, halign: "right", fontStyle: "bold" },
        },
        margin: { left: margin, right: margin },
      });
      y = (doc as any).lastAutoTable.finalY + 10;
    }
  }

  // Footer note
  if (proposalText.footerNote) {
    doc.setFontSize(8);
    doc.setFont("helvetica", "italic");
    doc.setTextColor(120, 125, 130);
    const footerLines = doc.splitTextToSize(proposalText.footerNote, contentWidth);
    doc.text(footerLines, margin, y);
    y += footerLines.length * 4 + 12;
  }

  // Signature section
  if (y > pageHeight - 70) {
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
  doc.text(
    "I/We accept this proposal and authorise the commencement of works as described above.",
    margin,
    y
  );
  y += 14;

  // Signature lines
  const sigWidth = (contentWidth - 20) / 2;
  const signatureY = y; // Record the Y position where signature section starts (in mm)

  // Client signature
  doc.setDrawColor(30, 35, 40);
  doc.setLineWidth(0.5);
  doc.line(margin, y + 20, margin + sigWidth, y + 20);
  doc.setFontSize(8);
  doc.setTextColor(100, 105, 110);
  doc.text("Client Signature", margin, y + 26);
  doc.text("Date: ___/___/______", margin, y + 32);

  // Company signature
  const sigX2 = margin + sigWidth + 20;
  doc.line(sigX2, y + 20, sigX2 + sigWidth, y + 20);
  doc.text(`${company.companyName}`, sigX2, y + 26);
  doc.text("Date: ___/___/______", sigX2, y + 32);

  y += 40;

  return { y, signatureY };
}

// ─── Helpers ───────────────────────────────────────────────────────────────────
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


// ─── Deck Design: Subfloor Plan View + BOM + Post Schedule ─────────────────
type DeckDesignData = NonNullable<ProposalQuoteData["deckDesign"]>;

function drawDeckDesignPage(
  doc: jsPDF,
  deck: DeckDesignData,
  startY: number,
  margin: number,
  contentWidth: number,
  pageWidth: number,
  pageHeight: number
): number {
  let y = startY;
  const fmtMM = (n: number) => n.toLocaleString() + " mm";
  const fmtAUD = (n: number) =>
    new Intl.NumberFormat("en-AU", {
      style: "currency",
      currency: "AUD",
      minimumFractionDigits: 2,
    }).format(n);

  // ─── Section title ──────────────────────────────────────────────────────────
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(30, 35, 40);
  doc.text("Subfloor Design — Plan View", margin, y);
  y += 3;
  doc.setDrawColor(45, 120, 100);
  doc.setLineWidth(0.8);
  doc.line(margin, y, margin + contentWidth, y);
  y += 6;

  // ─── Deck info summary ──────────────────────────────────────────────────────
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(80, 80, 80);
  const shapeLabel =
    deck.shape === "rectangle"
      ? "Rectangle"
      : deck.shape === "l-shape"
      ? "L-Shape"
      : deck.shape === "u-shape"
      ? "U-Shape"
      : deck.shape;
  const framingLabel = deck.framingSystemLabel || "Spanmor (Aluminium)";
  doc.text(
    `Shape: ${shapeLabel}   |   Length: ${fmtMM(deck.lengthMm)}   |   Width: ${fmtMM(deck.widthMm)}   |   Framing: ${framingLabel}`,
    margin,
    y
  );
  y += 4;
  doc.text(
    `Engineering Selection: ${deck.option.label} — ${deck.option.profileLabel}`,
    margin,
    y
  );
  y += 6;

  // ─── Schematic image ───────────────────────────────────────────────────────
  if (deck.schematicImageDataUrl) {
    const imgMaxW = contentWidth;
    const imgMaxH = 100; // mm max height for the schematic
    try {
      doc.addImage(deck.schematicImageDataUrl, "PNG", margin, y, imgMaxW, imgMaxH);
      y += imgMaxH + 4;
    } catch {
      // If image fails, show placeholder text
      doc.setFontSize(10);
      doc.setTextColor(150, 150, 150);
      doc.text("[Schematic image could not be rendered]", pageWidth / 2, y + 20, { align: "center" });
      y += 30;
    }
  }

  // ─── Disclaimer ─────────────────────────────────────────────────────────────
  doc.setFontSize(7);
  doc.setFont("helvetica", "italic");
  doc.setTextColor(140, 140, 140);
  doc.text(
    "For illustrative purposes only — not a render of the finished structure. Consult supplier span tables for final specifications.",
    pageWidth / 2,
    y,
    { align: "center" }
  );
  y += 6;

  // ─── Framing Summary (quantities only, no costs) ───────────────────────────
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(30, 35, 40);
  doc.text("Subfloor Summary", margin, y);
  y += 4;

  const summaryRows = [
    ["Joists", String(deck.option.joistCount), fmtMM(deck.option.joistLength), `${deck.option.joistCentres} mm`],
    ["Bearers", String(deck.option.bearerCount), fmtMM(deck.option.bearerLength), "—"],
    ["Posts", String(deck.option.postCount), "—", "—"],
  ];

  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    head: [["Item", "Qty", "Length", "Centres"]],
    body: summaryRows,
    theme: "grid",
    headStyles: {
      fillColor: [45, 120, 100],
      textColor: [255, 255, 255],
      fontStyle: "bold",
      fontSize: 8,
    },
    bodyStyles: { fontSize: 8, textColor: [50, 50, 50] },
    alternateRowStyles: { fillColor: [245, 248, 250] },
    columnStyles: {
      0: { fontStyle: "bold", cellWidth: 35 },
      1: { halign: "center", cellWidth: 25 },
      2: { halign: "right", cellWidth: 40 },
      3: { halign: "center", cellWidth: 35 },
    },
  });

  y = (doc as any).lastAutoTable?.finalY ?? y + 30;
  y += 6;

  // ─── Side View / Cross-Section ──────────────────────────────────────────────
  if (deck.sideViewImageDataUrl) {
    if (y > pageHeight - 80) {
      doc.addPage("a4", "portrait");
      y = 20;
    }
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(30, 35, 40);
    doc.text("Side View / Cross-Section", margin, y);
    y += 4;
    const sideImgH = 50;
    try {
      doc.addImage(deck.sideViewImageDataUrl, "PNG", margin, y, contentWidth, sideImgH);
      y += sideImgH + 4;
    } catch {
      doc.setFontSize(9);
      doc.setTextColor(150, 150, 150);
      doc.text("[Side view image could not be rendered]", pageWidth / 2, y + 15, { align: "center" });
      y += 25;
    }
  }

  // ─── Stair BOM ──────────────────────────────────────────────────────────────
  if (deck.stairBom) {
    if (y > pageHeight - 80) {
      doc.addPage("a4", "portrait");
      y = 20;
    }
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(30, 35, 40);
    doc.text("Stair Schedule", margin, y);
    y += 4;

    const sb = deck.stairBom;
    const typeLabel = sb.stairType === "straight" ? "Straight" : sb.stairType === "l-shape" ? "L-Shape" : "U-Shape";
    const matLabel = (m: string) => m.charAt(0).toUpperCase() + m.slice(1);

    // Summary row
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(80, 80, 80);
    doc.text(`Type: ${typeLabel}  |  Flights: ${sb.flights}  |  Risers: ${sb.numberOfRisers}  |  Riser Height: ${Math.round(sb.actualRiser)} mm  |  Going: ${Math.round(sb.going)} mm  |  Width: ${sb.stairWidth} mm`, margin, y);
    y += 5;

    const stairRows: string[][] = [
      ["Stringers", String(sb.stringerCount), `${Math.round(sb.stringerLengthMm)} mm`, matLabel(sb.stringerMaterial)],
      ["Tread Boards", String(sb.treadBoards), `${Math.round(sb.treadCutLength)} mm`, matLabel(sb.treadMaterial)],
    ];
    if (sb.riserStyle === "closed" && sb.riserBoards > 0) {
      stairRows.push(["Riser Boards", String(sb.riserBoards), `${Math.round(sb.riserCutLength)} mm`, "Closed"]);
    }
    if (sb.landingBoards > 0) {
      stairRows.push(["Landing Boards", String(sb.landingBoards), "-", "-"]);
    }
    if (sb.handrailLength > 0) {
      stairRows.push(["Handrail", sb.handrailStyle === "both-sides" ? "2 sides" : "1 side", `${Math.round(sb.handrailLength)} mm total`, "-"]);
    }
    if (sb.balustradePosts > 0) {
      stairRows.push(["Balustrade Posts", String(sb.balustradePosts), "-", "-"]);
    }

    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      head: [["Item", "Qty", "Length / Detail", "Material"]],
      body: stairRows,
      theme: "grid",
      headStyles: {
        fillColor: [120, 80, 50],
        textColor: [255, 255, 255],
        fontStyle: "bold",
        fontSize: 8,
      },
      bodyStyles: { fontSize: 8, textColor: [50, 50, 50] },
      alternateRowStyles: { fillColor: [252, 248, 244] },
      columnStyles: {
        0: { fontStyle: "bold", cellWidth: 40 },
        1: { halign: "center", cellWidth: 25 },
        2: { halign: "right", cellWidth: 45 },
        3: { cellWidth: 40 },
      },
    });

    y = (doc as any).lastAutoTable?.finalY ?? y + 30;
    y += 6;
  }

  // ─── Board Layout Summary ───────────────────────────────────────────────────
  if (deck.boardLayout) {
    // Start on a new page for the board layout section
    doc.addPage("a4", "portrait");
    y = 20;

    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(30, 35, 40);
    doc.text("Board Layout", margin, y);
    y += 3;
    doc.setDrawColor(45, 120, 100);
    doc.setLineWidth(0.8);
    doc.line(margin, y, margin + contentWidth, y);
    y += 6;

    // ─── Board Layout Image ─────────────────────────────────────────────────────
    if (deck.boardLayoutImageDataUrl) {
      const imgMaxW = contentWidth;
      const imgMaxH = 90;
      try {
        doc.addImage(deck.boardLayoutImageDataUrl, "PNG", margin, y, imgMaxW, imgMaxH);
        y += imgMaxH + 4;
      } catch {
        doc.setFontSize(10);
        doc.setTextColor(150, 150, 150);
        doc.text("[Board layout image could not be rendered]", pageWidth / 2, y + 20, { align: "center" });
        y += 30;
      }
    }

    // ─── Board Layout Specs Table ────────────────────────────────────────────────
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(60, 60, 60);

    const bl = deck.boardLayout;
    const dirLabel = bl.boardDirection === "perpendicular" ? "Perpendicular" : bl.boardDirection === "diagonal" ? "Diagonal (45\u00b0)" : "Parallel";
    const stagger = bl.staggerPattern || "random";
    const staggerLabel = stagger === "equal" ? "Equal (\u00bd offset)" : stagger === "third" ? "\u2153 Offset" : stagger === "quarter" ? "\u00bc Offset" : "Random";
    const features: string[] = [];
    if (bl.pictureFrame && bl.pictureFrame !== "none") features.push(typeof bl.pictureFrame === "string" && bl.pictureFrame !== "true" ? `Picture Frame (${bl.pictureFrame})` : "Picture Frame");
    if (bl.breakerBoard && bl.breakerBoard !== "none") features.push(typeof bl.breakerBoard === "string" && bl.breakerBoard !== "true" ? `Breaker Board (${bl.breakerBoard})` : "Breaker Board");
    const featStr = features.length > 0 ? features.join(", ") : "Standard";
    const productStr = deck.deckingProduct ? `${deck.deckingProduct}${deck.deckingColour ? " \u2014 " + deck.deckingColour : ""}` : "";

    const boardRows = [
      ["Direction", dirLabel],
      ["Stagger Pattern", staggerLabel],
      ["Board Width", `${bl.boardWidth} mm`],
      ["Board Gap", `${bl.boardGap} mm`],
      ["Stock Length", `${(bl.boardLength / 1000).toFixed(1)} m`],
      ["Edge / Features", featStr],
    ];
    if (productStr) boardRows.unshift(["Decking Product", productStr]);

    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      body: boardRows,
      theme: "plain",
      bodyStyles: { fontSize: 8.5, textColor: [50, 50, 50], cellPadding: 2 },
      columnStyles: {
        0: { fontStyle: "bold", cellWidth: 45 },
        1: { cellWidth: contentWidth - 45 },
      },
    });

    y = (doc as any).lastAutoTable?.finalY ?? y + 30;
    y += 4;

    // Disclaimer
    doc.setFontSize(7);
    doc.setFont("helvetica", "italic");
    doc.setTextColor(140, 140, 140);
    doc.text(
      "Board layout shown for illustrative purposes only. Actual installation may vary based on site conditions.",
      pageWidth / 2,
      y,
      { align: "center" }
    );
    y += 6;
  }

  return y;
}


// ─── Materials Table Page ──────────────────────────────────────────────────────
async function drawMaterialsTablePage(
  doc: jsPDF,
  data: ProposalQuoteData,
  startY: number,
  margin: number,
  contentWidth: number,
  pageWidth: number,
  pageHeight: number
): Promise<number> {
  let y = startY;

  // Section title
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(30, 35, 40);
  doc.text("Table of Materials", margin, y);
  y += 8;

  // Subtitle
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100, 100, 100);
  doc.text("Materials and products specified for this project", margin, y);
  y += 10;

    // Connection callout (if applicable)
  if (data.connectionType && data.connectionType !== "None") {
    const hasConnImg = !!data.connectionImageUrl;
    const boxH = hasConnImg ? 52 : 32;
    doc.setFillColor(245, 248, 252);
    doc.roundedRect(margin, y, contentWidth, boxH, 2, 2, "F");
    // Border accent
    doc.setDrawColor(45, 120, 100);
    doc.setLineWidth(0.5);
    doc.line(margin, y, margin, y + boxH);
    doc.setDrawColor(0);
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(30, 35, 40);
    doc.text("Attachment Method", margin + 4, y + 6);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(60, 60, 60);
    doc.text(data.connectionType, margin + 4, y + 12);
    // Connection type description
    const connDescriptions: Record<string, string> = {
      FLY: "Flyover bracket — roof structure flies over existing house roof",
      BCH: "Back channel — aluminium channel bolts into eave rafters",
      WFX: "Wall fix — L-bracket fixed directly to house wall",
      GBL: "Gutter bracket — bracket mounts into existing gutter line",
      FSS: "Free-standing — independent structure with no house attachment",
      POP: "Pop-up bracket — elevated bracket for clearance over existing roof",
    };
    // Derive code for description lookup
    const connCode = (() => {
      const ct = data.connectionType || "";
      if (ct.toLowerCase().includes("flyover") || ct.toLowerCase().includes("extenda")) return "FLY";
      if (ct.toLowerCase().includes("back channel") || ct.toLowerCase().includes("fascia")) return "BCH";
      if (ct.toLowerCase().includes("wall")) return "WFX";
      if (ct.toLowerCase().includes("gutter") || ct.toLowerCase().includes("gable")) return "GBL";
      if (ct.toLowerCase().includes("free")) return "FSS";
      if (ct.toLowerCase().includes("pop")) return "POP";
      return "";
    })();
    const desc = connDescriptions[connCode];
    if (desc) {
      doc.setFontSize(7.5);
      doc.setTextColor(100, 100, 100);
      doc.text(desc, margin + 4, y + 17);
    }
    // Load connection image if available
    if (data.connectionImageUrl) {
      const connImg = await loadImage(data.connectionImageUrl);
      if (connImg) {
        const imgW = 42;
        const imgH = 42;
        doc.addImage(connImg, "PNG", margin + contentWidth - imgW - 4, y + 5, imgW, imgH);
      }
    }
    y += boxH + 4;
  }

  // Materials table
  const materials = data.materialsList || [];
  const tableBody: (string | { content: string })[][] = [];

  // Pre-load images for materials
  const imageCache: Map<string, HTMLImageElement | null> = new Map();
  for (const mat of materials) {
    if (mat.imageUrl && !imageCache.has(mat.imageUrl)) {
      const img = await loadImage(mat.imageUrl);
      imageCache.set(mat.imageUrl, img);
    }
  }

  for (const mat of materials) {
    tableBody.push([
      mat.category,
      mat.product,
      mat.colour || "—",
    ]);
  }

  if (tableBody.length > 0) {
    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      head: [["Component", "Product / Size", "Colour"]],
      body: tableBody,
      theme: "grid",
      headStyles: {
        fillColor: [45, 120, 100],
        textColor: [255, 255, 255],
        fontStyle: "bold",
        fontSize: 9,
      },
      bodyStyles: { fontSize: 8.5, textColor: [50, 50, 50], minCellHeight: 12 },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: {
        0: { fontStyle: "bold", cellWidth: 35 },
        1: { cellWidth: 75 },
        2: { cellWidth: 45 },
      },
      didDrawCell: (hookData: any) => {
        // Draw product image thumbnail in the last column area if available
        if (hookData.section === "body" && hookData.column.index === 2) {
          const rowIdx = hookData.row.index;
          const mat = materials[rowIdx];
          if (mat?.imageUrl) {
            const img = imageCache.get(mat.imageUrl);
            if (img) {
              const cellX = hookData.cell.x + hookData.cell.width + 2;
              const cellY = hookData.cell.y + 1;
              const thumbSize = Math.min(hookData.cell.height - 2, 10);
              doc.addImage(img, "PNG", cellX, cellY, thumbSize, thumbSize);
            }
          }
        }
      },
    });

    y = (doc as any).lastAutoTable?.finalY ?? y + 30;
  }

  y += 6;
  return y;
}
