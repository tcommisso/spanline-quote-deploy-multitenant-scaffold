/**
 * Printable Connections & Brackets Index PDF Generator
 * Generates a multi-page A4 reference document listing all connection types,
 * brackets, and structural components from the technical library.
 * Now includes thumbnail images for visual identification on site.
 */
import { PDFDocument, StandardFonts, rgb, PDFPage, PDFFont, PDFImage } from "pdf-lib";
import { getCompanyDisplayName } from "./company-name";
import { getActiveTechLibraryDocuments } from "./db";
import { listProductImages } from "./plan-converter-db";
import { storageGet } from "./storage";

// A4 portrait dimensions in points
const A4_WIDTH = 595.28;
const A4_HEIGHT = 841.89;
const MARGIN = 40;
const CONTENT_WIDTH = A4_WIDTH - MARGIN * 2;

// Thumbnail dimensions
const THUMB_WIDTH = 80;
const THUMB_HEIGHT = 60;

// Connection types used in the patio planner system
const CONNECTION_TYPES = [
  {
    code: "FLY",
    name: "Flyover Bracket",
    description: "Roof structure flies over existing house roof. Extenda brackets mount to existing rafters, supporting beams that carry the new roof above the existing ridge line.",
    useCase: "Most common connection. Used when patio roof needs to clear existing roof ridge.",
    components: ["Extenda brackets", "Beam support saddles", "Tek screws", "Rafter bolts"],
  },
  {
    code: "BCH",
    name: "Back Channel",
    description: "Aluminium channel bolts through the eave lining into existing rafters. Provides a ledger for the new roof beams to rest on at the house wall.",
    useCase: "Used when patio attaches at eave height. Lower profile than flyover.",
    components: ["Back channel extrusion", "Coach bolts", "Rafter locators", "Flashing"],
  },
  {
    code: "CRK",
    name: "Cranked Post",
    description: "Steel post with an angled crank (bend) that allows the post to clear an obstruction such as a slab edge, garden bed, or step. Available in standard and 90-degree variants.",
    useCase: "When post footing cannot be placed directly below beam due to site constraints.",
    components: ["Cranked post (steel)", "Base plate", "Dynabolts", "Post cap"],
  },
  {
    code: "FSS",
    name: "Free Standing System",
    description: "Independent structure with no attachment to existing building. Uses larger footings and additional bracing to resist all wind loads independently.",
    useCase: "Detached patios, carports away from house, or when existing structure cannot support attachment.",
    components: ["Bracing kit", "Larger footings", "Knee braces or portal frame", "Independent posts all sides"],
  },
  {
    code: "GBL",
    name: "Gable Bracket",
    description: "Specialised bracket for gable roof connections. Supports the ridge beam at the gable end and transfers loads to the supporting posts.",
    useCase: "Gable and hip roof styles where a central ridge beam is required.",
    components: ["Gable bracket", "Ridge beam saddle", "Tek screws", "Beam clamps"],
  },
  {
    code: "POP",
    name: "Pop-up Bracket",
    description: "Raises the new roof above the existing fascia/gutter line using vertical brackets. Creates clearance for water runoff between existing and new roof.",
    useCase: "When new roof needs to sit above existing gutter line without flyover height.",
    components: ["Pop-up bracket (vertical)", "Fascia mount plate", "Through bolts", "Flashing"],
  },
  {
    code: "WFX",
    name: "Wall Fixing",
    description: "Direct attachment to masonry or timber-framed wall using wall brackets or ledger beams. Suitable for flat or low-pitch roofs attaching to a solid wall.",
    useCase: "Flat roof patios attaching to brick or rendered walls.",
    components: ["Wall bracket / ledger", "Chemical anchors or coach bolts", "Flashing", "Sealant"],
  },
  {
    code: "SPL",
    name: "Beam Splice",
    description: "Joins two beam sections end-to-end when a single beam cannot span the full length. Must occur over a post or support point.",
    useCase: "Long spans exceeding single beam length, or transport limitations.",
    components: ["Splice plate (internal)", "Tek screws or bolts", "Must be at support point"],
  },
];

// Bracket/component categories
const BRACKET_CATEGORIES = [
  {
    category: "Roof Connection Brackets",
    items: [
      { code: "EXT-STD", name: "Extenda Bracket (Standard)", size: "Suits 100-150mm rafter", notes: "Primary flyover connection" },
      { code: "EXT-HD", name: "Extenda Bracket (Heavy Duty)", size: "Suits 150-200mm rafter", notes: "High wind areas N3+" },
      { code: "GBL-100", name: "Gable Bracket 100mm", size: "100mm beam", notes: "Ridge connection" },
      { code: "GBL-150", name: "Gable Bracket 150mm", size: "150mm beam", notes: "Ridge connection" },
      { code: "POP-150", name: "Pop-up Bracket 150mm", size: "150mm rise", notes: "Fascia mount" },
      { code: "POP-200", name: "Pop-up Bracket 200mm", size: "200mm rise", notes: "Fascia mount" },
      { code: "POP-250", name: "Pop-up Bracket 250mm", size: "250mm rise", notes: "High fascia" },
    ],
  },
  {
    category: "Post Brackets & Connectors",
    items: [
      { code: "PC-ALU", name: "Aluminium Post Connector", size: "75x75 to 125x125", notes: "Post to beam connection" },
      { code: "PC-STL", name: "Steel Post Cap", size: "90x90 to 150x150", notes: "Heavy duty" },
      { code: "BP-STD", name: "Base Plate (Standard)", size: "150x150x6mm", notes: "Bolt-down to slab" },
      { code: "BP-HD", name: "Base Plate (Heavy Duty)", size: "200x200x10mm", notes: "High wind / tall post" },
      { code: "CRK-STD", name: "Cranked Post Bracket", size: "Standard offset", notes: "Slab edge clearance" },
      { code: "CRK-90", name: "90 Degree Cranked Post", size: "90° offset", notes: "Step/garden bed" },
    ],
  },
  {
    category: "Beam & Ridge Connectors",
    items: [
      { code: "G1-RDG", name: "G1 Ridge Extrusion", size: "Standard", notes: "Aluminium ridge connector" },
      { code: "G2-RDG", name: "G2 Ridge Extrusion", size: "Heavy duty", notes: "Wider beam support" },
      { code: "SPL-INT", name: "Internal Splice Plate", size: "Suits all beams", notes: "Must be at support" },
      { code: "BCH-STD", name: "Back Channel", size: "Standard depth", notes: "Eave attachment" },
      { code: "BCH-B2B", name: "Back to Back Channel", size: "Double depth", notes: "Higher load" },
      { code: "BM-SAD", name: "Beam Saddle", size: "75-150mm", notes: "Beam to post top" },
    ],
  },
  {
    category: "Bracing & Fixing",
    items: [
      { code: "KB-STD", name: "Knee Brace", size: "600mm arm", notes: "Wind bracing" },
      { code: "KB-LG", name: "Knee Brace (Large)", size: "900mm arm", notes: "High wind areas" },
      { code: "PF-STD", name: "Portal Frame Kit", size: "Standard", notes: "Free standing bracing" },
      { code: "RF-STR", name: "Rafter Strengthening", size: "Per rafter", notes: "Existing rafter support" },
      { code: "WB-STD", name: "Wall Bracket", size: "Standard", notes: "Ledger to wall" },
      { code: "WB-HD", name: "Wall Bracket (Heavy Duty)", size: "High load", notes: "Masonry anchor" },
    ],
  },
];

interface IndexOptions {
  includeConnectionTypes?: boolean;
  includeBracketList?: boolean;
  includeTechLibraryRefs?: boolean;
}

// Fetch and embed an image from storage into the PDF
async function fetchAndEmbedImage(doc: PDFDocument, imageUrl: string): Promise<PDFImage | null> {
  try {
    // Get presigned URL from storage
    const storageKey = imageUrl.replace(/^\/manus-storage\//, "");
    const { url } = await storageGet(storageKey);

    // Fetch the image bytes
    const response = await fetch(url);
    if (!response.ok) return null;

    const arrayBuffer = await response.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);

    // Determine image type from URL or content-type
    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("png") || imageUrl.endsWith(".png")) {
      return await doc.embedPng(bytes);
    } else if (contentType.includes("jpeg") || contentType.includes("jpg") || imageUrl.endsWith(".jpg") || imageUrl.endsWith(".jpeg")) {
      return await doc.embedJpg(bytes);
    }

    // Try PNG first, fall back to JPG
    try {
      return await doc.embedPng(bytes);
    } catch {
      try {
        return await doc.embedJpg(bytes);
      } catch {
        return null;
      }
    }
  } catch (e) {
    console.error(`[ConnectionsIndex] Failed to embed image: ${imageUrl}`, e);
    return null;
  }
}

export async function generateConnectionsIndex(options: IndexOptions = {}): Promise<Buffer> {
  const {
    includeConnectionTypes = true,
    includeBracketList = true,
    includeTechLibraryRefs = true,
  } = options;

  const companyName = await getCompanyDisplayName();
  const doc = await PDFDocument.create();

  const fontRegular = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const fontItalic = await doc.embedFont(StandardFonts.HelveticaOblique);

  let currentPage = doc.addPage([A4_WIDTH, A4_HEIGHT]);
  let cursorY = A4_HEIGHT - MARGIN;

  // Pre-fetch all product images from the database
  const allProductImages = await listProductImages();
  const imagesByCode = new Map<string, typeof allProductImages[0]>();
  for (const img of allProductImages) {
    // Store first image found for each code (primary)
    if (!imagesByCode.has(img.code)) {
      imagesByCode.set(img.code, img);
    }
  }

  // Pre-embed images for connection types (fetch once, reuse in PDF)
  const embeddedImages = new Map<string, PDFImage>();
  for (const conn of CONNECTION_TYPES) {
    const productImg = imagesByCode.get(conn.code);
    if (productImg) {
      const embedded = await fetchAndEmbedImage(doc, productImg.imageUrl);
      if (embedded) {
        embeddedImages.set(conn.code, embedded);
      }
    }
  }

  // Also pre-embed bracket images
  for (const cat of BRACKET_CATEGORIES) {
    for (const item of cat.items) {
      const productImg = imagesByCode.get(item.code);
      if (productImg && !embeddedImages.has(item.code)) {
        const embedded = await fetchAndEmbedImage(doc, productImg.imageUrl);
        if (embedded) {
          embeddedImages.set(item.code, embedded);
        }
      }
    }
  }

  // Helper: check if we need a new page
  function ensureSpace(needed: number): PDFPage {
    if (cursorY - needed < MARGIN + 30) {
      drawFooter(currentPage);
      currentPage = doc.addPage([A4_WIDTH, A4_HEIGHT]);
      cursorY = A4_HEIGHT - MARGIN;
      drawHeader(currentPage);
    }
    return currentPage;
  }

  function drawHeader(page: PDFPage) {
    page.drawText(`${companyName.toUpperCase()} — CONNECTIONS & BRACKETS INDEX`, {
      x: MARGIN,
      y: A4_HEIGHT - MARGIN + 10,
      size: 9,
      font: fontBold,
      color: rgb(0.04, 0.075, 0.125),
    });
    page.drawLine({
      start: { x: MARGIN, y: A4_HEIGHT - MARGIN + 5 },
      end: { x: A4_WIDTH - MARGIN, y: A4_HEIGHT - MARGIN + 5 },
      thickness: 0.75,
      color: rgb(0.04, 0.075, 0.125),
    });
    cursorY = A4_HEIGHT - MARGIN - 5;
  }

  function drawFooter(page: PDFPage) {
    const pageCount = doc.getPageCount();
    page.drawText(`${companyName} — Connections & Brackets Reference — Page ${pageCount}`, {
      x: MARGIN,
      y: MARGIN - 10,
      size: 6,
      font: fontItalic,
      color: rgb(0.5, 0.5, 0.5),
    });
  }

  // Helper: draw a thumbnail image on the page
  function drawThumbnail(page: PDFPage, image: PDFImage, x: number, y: number, maxW: number, maxH: number) {
    const imgDims = image.scale(1);
    const scale = Math.min(maxW / imgDims.width, maxH / imgDims.height);
    const drawW = imgDims.width * scale;
    const drawH = imgDims.height * scale;

    // Draw a light border/background
    page.drawRectangle({
      x: x - 1,
      y: y - drawH - 1,
      width: maxW + 2,
      height: maxH + 2,
      borderColor: rgb(0.8, 0.8, 0.8),
      borderWidth: 0.5,
      color: rgb(0.97, 0.97, 0.97),
    });

    // Center the image within the bounding box
    const offsetX = x + (maxW - drawW) / 2;
    const offsetY = y - drawH + (maxH - drawH) / 2;

    page.drawImage(image, {
      x: offsetX,
      y: offsetY,
      width: drawW,
      height: drawH,
    });
  }

  // ─── Cover / Title Section ──────────────────────────────────────────────────
  currentPage.drawText(companyName.toUpperCase(), {
    x: MARGIN,
    y: cursorY - 20,
    size: 18,
    font: fontBold,
    color: rgb(0.04, 0.075, 0.125),
  });
  cursorY -= 40;

  currentPage.drawText("CONNECTIONS & BRACKETS", {
    x: MARGIN,
    y: cursorY,
    size: 14,
    font: fontBold,
    color: rgb(0.1, 0.1, 0.1),
  });
  cursorY -= 18;

  currentPage.drawText("REFERENCE INDEX", {
    x: MARGIN,
    y: cursorY,
    size: 14,
    font: fontBold,
    color: rgb(0.1, 0.1, 0.1),
  });
  cursorY -= 25;

  currentPage.drawLine({
    start: { x: MARGIN, y: cursorY },
    end: { x: A4_WIDTH - MARGIN, y: cursorY },
    thickness: 1.5,
    color: rgb(0.04, 0.075, 0.125),
  });
  cursorY -= 20;

  currentPage.drawText("Use this reference when drawing hand plans. Write the connection code (e.g. FLY, BCH, CRK)", {
    x: MARGIN,
    y: cursorY,
    size: 8,
    font: fontRegular,
    color: rgb(0.2, 0.2, 0.2),
  });
  cursorY -= 12;
  currentPage.drawText("on your drawing to indicate the connection type at each attachment point.", {
    x: MARGIN,
    y: cursorY,
    size: 8,
    font: fontRegular,
    color: rgb(0.2, 0.2, 0.2),
  });
  cursorY -= 12;
  currentPage.drawText("Write bracket codes (e.g. EXT-STD, PC-ALU) next to numbered elements for the schedule.", {
    x: MARGIN,
    y: cursorY,
    size: 8,
    font: fontRegular,
    color: rgb(0.2, 0.2, 0.2),
  });
  cursorY -= 12;
  currentPage.drawText("Thumbnail images are provided for visual identification of each connection type on site.", {
    x: MARGIN,
    y: cursorY,
    size: 8,
    font: fontItalic,
    color: rgb(0.3, 0.3, 0.3),
  });
  cursorY -= 30;

  // ─── Connection Types Section ─────────────────────────────────────────────
  if (includeConnectionTypes) {
    ensureSpace(30);
    currentPage.drawText("1. CONNECTION TYPES", {
      x: MARGIN,
      y: cursorY,
      size: 11,
      font: fontBold,
      color: rgb(0.04, 0.075, 0.125),
    });
    cursorY -= 5;
    currentPage.drawLine({
      start: { x: MARGIN, y: cursorY },
      end: { x: MARGIN + 200, y: cursorY },
      thickness: 1,
      color: rgb(0.04, 0.075, 0.125),
    });
    cursorY -= 18;

    for (const conn of CONNECTION_TYPES) {
      const hasImage = embeddedImages.has(conn.code);
      // Need more space when we have an image (image height + text)
      const neededHeight = hasImage ? Math.max(THUMB_HEIGHT + 20, 85) : 85;
      const page = ensureSpace(neededHeight);

      const textStartX = hasImage ? MARGIN + THUMB_WIDTH + 12 : MARGIN;
      const textWidth = hasImage ? CONTENT_WIDTH - THUMB_WIDTH - 12 : CONTENT_WIDTH;
      const imageTopY = cursorY + 2;

      // Code badge + name
      page.drawRectangle({
        x: textStartX,
        y: cursorY - 2,
        width: 32,
        height: 14,
        color: rgb(0.04, 0.075, 0.125),
      });
      page.drawText(conn.code, {
        x: textStartX + 4,
        y: cursorY + 1,
        size: 8,
        font: fontBold,
        color: rgb(1, 1, 1),
      });
      page.drawText(conn.name, {
        x: textStartX + 38,
        y: cursorY + 1,
        size: 9,
        font: fontBold,
        color: rgb(0.1, 0.1, 0.1),
      });
      cursorY -= 16;

      // Description (wrapped)
      const descLines = wrapText(conn.description, fontRegular, 7, textWidth - 10);
      for (const line of descLines) {
        page.drawText(line, {
          x: textStartX + 5,
          y: cursorY,
          size: 7,
          font: fontRegular,
          color: rgb(0.2, 0.2, 0.2),
        });
        cursorY -= 10;
      }

      // Use case
      page.drawText(`Use: ${conn.useCase}`, {
        x: textStartX + 5,
        y: cursorY,
        size: 6.5,
        font: fontItalic,
        color: rgb(0.3, 0.3, 0.3),
      });
      cursorY -= 11;

      // Components
      page.drawText(`Components: ${conn.components.join(", ")}`, {
        x: textStartX + 5,
        y: cursorY,
        size: 6.5,
        font: fontRegular,
        color: rgb(0.3, 0.3, 0.3),
      });
      cursorY -= 12;

      // Draw thumbnail image on the left
      if (hasImage) {
        const image = embeddedImages.get(conn.code)!;
        drawThumbnail(page, image, MARGIN, imageTopY, THUMB_WIDTH, THUMB_HEIGHT);
        // Ensure cursor is below the image
        const imageBottomY = imageTopY - THUMB_HEIGHT - 8;
        if (cursorY > imageBottomY) {
          cursorY = imageBottomY;
        }
      }

      cursorY -= 8; // Space between entries
    }
  }

  // ─── Bracket List Section ─────────────────────────────────────────────────
  if (includeBracketList) {
    ensureSpace(30);
    currentPage = ensureSpace(30);
    currentPage.drawText("2. BRACKETS & COMPONENTS", {
      x: MARGIN,
      y: cursorY,
      size: 11,
      font: fontBold,
      color: rgb(0.04, 0.075, 0.125),
    });
    cursorY -= 5;
    currentPage.drawLine({
      start: { x: MARGIN, y: cursorY },
      end: { x: MARGIN + 200, y: cursorY },
      thickness: 1,
      color: rgb(0.04, 0.075, 0.125),
    });
    cursorY -= 18;

    for (const cat of BRACKET_CATEGORIES) {
      const page = ensureSpace(30);

      // Category header
      page.drawText(cat.category.toUpperCase(), {
        x: MARGIN,
        y: cursorY,
        size: 8,
        font: fontBold,
        color: rgb(0.1, 0.1, 0.1),
      });
      cursorY -= 14;

      // Table header
      const colThumb = MARGIN;
      const colCode = MARGIN + 52;
      const colName = MARGIN + 107;
      const colSize = MARGIN + 270;
      const colNotes = MARGIN + 380;

      page.drawText("Image", { x: colThumb, y: cursorY, size: 6.5, font: fontBold, color: rgb(0.3, 0.3, 0.3) });
      page.drawText("Code", { x: colCode, y: cursorY, size: 6.5, font: fontBold, color: rgb(0.3, 0.3, 0.3) });
      page.drawText("Name", { x: colName, y: cursorY, size: 6.5, font: fontBold, color: rgb(0.3, 0.3, 0.3) });
      page.drawText("Size/Spec", { x: colSize, y: cursorY, size: 6.5, font: fontBold, color: rgb(0.3, 0.3, 0.3) });
      page.drawText("Notes", { x: colNotes, y: cursorY, size: 6.5, font: fontBold, color: rgb(0.3, 0.3, 0.3) });
      cursorY -= 3;
      page.drawLine({
        start: { x: MARGIN, y: cursorY },
        end: { x: A4_WIDTH - MARGIN, y: cursorY },
        thickness: 0.5,
        color: rgb(0.6, 0.6, 0.6),
      });
      cursorY -= 10;

      for (const item of cat.items) {
        const hasImage = embeddedImages.has(item.code);
        // Rows with images need more height
        const rowHeight = hasImage ? 38 : 14;
        const rowPage = ensureSpace(rowHeight);

        const rowTopY = cursorY;

        // Draw thumbnail if available (small, 45x35 for table rows)
        if (hasImage) {
          const image = embeddedImages.get(item.code)!;
          drawThumbnail(rowPage, image, colThumb, rowTopY + 4, 45, 32);
        }

        // Text positioned at top of row
        const textY = hasImage ? rowTopY : rowTopY;
        rowPage.drawText(item.code, { x: colCode, y: textY, size: 6.5, font: fontBold, color: rgb(0.04, 0.075, 0.125) });
        rowPage.drawText(item.name, { x: colName, y: textY, size: 6.5, font: fontRegular, color: rgb(0.1, 0.1, 0.1) });
        rowPage.drawText(item.size, { x: colSize, y: textY, size: 6.5, font: fontRegular, color: rgb(0.3, 0.3, 0.3) });
        rowPage.drawText(item.notes, { x: colNotes, y: textY, size: 6.5, font: fontRegular, color: rgb(0.3, 0.3, 0.3) });

        cursorY -= rowHeight;
      }

      cursorY -= 10; // Space between categories
    }
  }

  // ─── Technical Library References ─────────────────────────────────────────
  if (includeTechLibraryRefs) {
    const techDocs = await getActiveTechLibraryDocuments();
    // Filter to connection/bracket related docs
    const relevantDocs = techDocs.filter((d: { title: string; code: string; description: string | null }) =>
      /bracket|connect|cranked|back.*channel|extenda|gable|free.*stand|splice|ridge|post.*connector|anchor|rafter/i.test(
        `${d.title} ${d.code} ${d.description || ""}`
      )
    );

    if (relevantDocs.length > 0) {
      const page = ensureSpace(30);
      page.drawText("3. TECHNICAL LIBRARY REFERENCES", {
        x: MARGIN,
        y: cursorY,
        size: 11,
        font: fontBold,
        color: rgb(0.04, 0.075, 0.125),
      });
      cursorY -= 5;
      page.drawLine({
        start: { x: MARGIN, y: cursorY },
        end: { x: MARGIN + 250, y: cursorY },
        thickness: 1,
        color: rgb(0.04, 0.075, 0.125),
      });
      cursorY -= 15;

      page.drawText("These documents are available in the Technical Library for detailed engineering specifications:", {
        x: MARGIN,
        y: cursorY,
        size: 7,
        font: fontItalic,
        color: rgb(0.3, 0.3, 0.3),
      });
      cursorY -= 16;

      for (const techDoc of relevantDocs) {
        const rowPage = ensureSpace(14);
        rowPage.drawText(techDoc.code, {
          x: MARGIN,
          y: cursorY,
          size: 7,
          font: fontBold,
          color: rgb(0.04, 0.075, 0.125),
        });
        rowPage.drawText(`${techDoc.title}${techDoc.description ? ` — ${techDoc.description}` : ""}`, {
          x: MARGIN + 80,
          y: cursorY,
          size: 7,
          font: fontRegular,
          color: rgb(0.2, 0.2, 0.2),
        });
        cursorY -= 13;
      }
    }
  }

  // Draw footer on last page
  drawFooter(currentPage);

  const pdfBytes = await doc.save();
  return Buffer.from(pdfBytes);
}

// Simple text wrapping helper
function wrapText(text: string, font: PDFFont, fontSize: number, maxWidth: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let currentLine = "";

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    const width = font.widthOfTextAtSize(testLine, fontSize);
    if (width > maxWidth && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  }
  if (currentLine) lines.push(currentLine);
  return lines;
}
