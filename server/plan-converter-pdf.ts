/**
 * Architectural Plan PDF Generator
 * Generates A3 landscape PDFs with architectural-style drawings,
 * title blocks, element schedules, and branding using pdf-lib.
 */
import { PDFDocument, StandardFonts, rgb, PDFFont, PDFPage } from "pdf-lib";
import type { PlanConversion, PlanConversionElement } from "../drizzle/schema";
import { getCompanyDisplayName } from "./company-name";

interface GeneratePdfInput {
  conversion: PlanConversion;
  elements: PlanConversionElement[];
}

// A3 landscape dimensions in points (1 point = 1/72 inch)
const A3_WIDTH = 1190.55; // 420mm
const A3_HEIGHT = 841.89; // 297mm
const MARGIN = 40;
const CONTENT_WIDTH = A3_WIDTH - MARGIN * 2;
const CONTENT_HEIGHT = A3_HEIGHT - MARGIN * 2;

// Title block dimensions
const TB_WIDTH = 300;
const TB_HEIGHT = 140;
const TB_X = A3_WIDTH - MARGIN - TB_WIDTH;
const TB_Y = MARGIN;

export async function generateArchitecturalPlanPdf(input: GeneratePdfInput): Promise<Buffer> {
  const { conversion, elements } = input;
  const companyName = await getCompanyDisplayName();

  const doc = await PDFDocument.create();
  const page = doc.addPage([A3_WIDTH, A3_HEIGHT]);

  const fontRegular = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const fontItalic = await doc.embedFont(StandardFonts.HelveticaOblique);

  // ─── Border ───────────────────────────────────────────────────────────────
  page.drawRectangle({
    x: MARGIN - 5,
    y: MARGIN - 5,
    width: CONTENT_WIDTH + 10,
    height: CONTENT_HEIGHT + 10,
    borderColor: rgb(0.1, 0.1, 0.1),
    borderWidth: 2,
  });
  page.drawRectangle({
    x: MARGIN,
    y: MARGIN,
    width: CONTENT_WIDTH,
    height: CONTENT_HEIGHT,
    borderColor: rgb(0.3, 0.3, 0.3),
    borderWidth: 0.5,
  });

  // ─── Diagram Type Label ───────────────────────────────────────────────────
  const diagramTypeLabel: Record<string, string> = {
    floor_plan: "FLOOR PLAN",
    elevation_front: "FRONT ELEVATION",
    elevation_side: "SIDE ELEVATION",
    elevation_rear: "REAR ELEVATION",
  };
  const typeLabel = diagramTypeLabel[conversion.diagramType] || "PLAN";
  const labelWidth = fontBold.widthOfTextAtSize(typeLabel, 18);
  page.drawText(typeLabel, {
    x: A3_WIDTH / 2 - labelWidth / 2,
    y: A3_HEIGHT - MARGIN - 25,
    size: 18,
    font: fontBold,
    color: rgb(0.1, 0.1, 0.1),
  });

  // ─── Drawing Area ─────────────────────────────────────────────────────────
  const drawAreaX = MARGIN + 20;
  const drawAreaY = MARGIN + 180;
  const drawAreaWidth = CONTENT_WIDTH - 40;
  const drawAreaHeight = CONTENT_HEIGHT - 220;

  const overallDims = (conversion.confirmedData as any)?.overallDimensions || { widthMm: 6000, depthMm: 4000, heightMm: 3000 };
  const realWidth = overallDims.widthMm || 6000;
  const realDepth = overallDims.depthMm || 4000;

  const scaleX = drawAreaWidth / realWidth;
  const scaleY = drawAreaHeight / realDepth;
  const scale = Math.min(scaleX, scaleY) * 0.8;

  const offsetX = drawAreaX + (drawAreaWidth - realWidth * scale) / 2;
  const offsetY = drawAreaY + (drawAreaHeight - realDepth * scale) / 2;

  function toX(mmX: number) { return offsetX + mmX * scale; }
  function toY(mmY: number) { return offsetY + (realDepth - mmY) * scale; }

  // Separate elements by type
  const posts = elements.filter(e => e.elementType === "post");
  const beams = elements.filter(e => e.elementType === "beam");
  const wallsExisting = elements.filter(e => e.elementType === "wall_existing");
  const wallsNew = elements.filter(e => e.elementType === "wall_new");
  const openings = elements.filter(e => e.elementType === "opening");
  const dimensions = elements.filter(e => e.elementType === "dimension");
  const annotations = elements.filter(e => e.elementType === "annotation");
  const roofLines = elements.filter(e => e.elementType === "roof_line");

  // Draw existing walls (thick dashed grey)
  for (const wall of wallsExisting) {
    if (wall.x1 != null && wall.y1 != null && wall.x2 != null && wall.y2 != null) {
      const x1 = toX((wall.x1 / 100) * realWidth);
      const y1 = toY((wall.y1 / 100) * realDepth);
      const x2 = toX((wall.x2 / 100) * realWidth);
      const y2 = toY((wall.y2 / 100) * realDepth);
      drawDashedLine(page, x1, y1, x2, y2, rgb(0.4, 0.4, 0.4), 2.5, [8, 4]);
      if (wall.label) {
        const mx = (x1 + x2) / 2;
        const my = (y1 + y2) / 2;
        page.drawText(wall.label, { x: mx - 20, y: my + 6, size: 6, font: fontItalic, color: rgb(0.4, 0.4, 0.4) });
      }
    }
  }

  // Draw new walls (solid black)
  for (const wall of wallsNew) {
    if (wall.x1 != null && wall.y1 != null && wall.x2 != null && wall.y2 != null) {
      const x1 = toX((wall.x1 / 100) * realWidth);
      const y1 = toY((wall.y1 / 100) * realDepth);
      const x2 = toX((wall.x2 / 100) * realWidth);
      const y2 = toY((wall.y2 / 100) * realDepth);
      page.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, thickness: 2, color: rgb(0.1, 0.1, 0.1) });
    }
  }

  // Draw beams
  for (const beam of beams) {
    if (beam.x1 != null && beam.y1 != null && beam.x2 != null && beam.y2 != null) {
      const x1 = toX((beam.x1 / 100) * realWidth);
      const y1 = toY((beam.y1 / 100) * realDepth);
      const x2 = toX((beam.x2 / 100) * realWidth);
      const y2 = toY((beam.y2 / 100) * realDepth);
      page.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, thickness: 1.5, color: rgb(0.15, 0.15, 0.15) });
      if (beam.elementNumber) {
        const mx = (x1 + x2) / 2;
        const my = (y1 + y2) / 2;
        page.drawText(beam.elementNumber, { x: mx - 5, y: my + 5, size: 7, font: fontBold, color: rgb(0.15, 0.15, 0.15) });
      }
    }
  }

  // Draw roof lines (thin dashed)
  for (const rl of roofLines) {
    if (rl.x1 != null && rl.y1 != null && rl.x2 != null && rl.y2 != null) {
      const x1 = toX((rl.x1 / 100) * realWidth);
      const y1 = toY((rl.y1 / 100) * realDepth);
      const x2 = toX((rl.x2 / 100) * realWidth);
      const y2 = toY((rl.y2 / 100) * realDepth);
      drawDashedLine(page, x1, y1, x2, y2, rgb(0.3, 0.3, 0.3), 1, [12, 4]);
    }
  }

  // Draw posts (filled squares with labels)
  for (const post of posts) {
    if (post.x1 != null && post.y1 != null) {
      const cx = toX((post.x1 / 100) * realWidth);
      const cy = toY((post.y1 / 100) * realDepth);
      const sz = 8;
      page.drawRectangle({
        x: cx - sz / 2,
        y: cy - sz / 2,
        width: sz,
        height: sz,
        color: rgb(0.1, 0.1, 0.1),
        borderColor: rgb(0, 0, 0),
        borderWidth: 0.5,
      });
      if (post.elementNumber) {
        page.drawText(post.elementNumber, { x: cx - 6, y: cy + sz / 2 + 3, size: 7, font: fontBold, color: rgb(0.1, 0.1, 0.1) });
      }
    }
  }

  // Draw openings (dashed blue)
  for (const opening of openings) {
    if (opening.x1 != null && opening.y1 != null && opening.x2 != null && opening.y2 != null) {
      const x1 = toX((opening.x1 / 100) * realWidth);
      const y1 = toY((opening.y1 / 100) * realDepth);
      const x2 = toX((opening.x2 / 100) * realWidth);
      const y2 = toY((opening.y2 / 100) * realDepth);
      drawDashedLine(page, x1, y1, x2, y2, rgb(0, 0.4, 0.8), 1.5, [4, 2]);
      if (opening.label) {
        const mx = (x1 + x2) / 2;
        const my = (y1 + y2) / 2;
        page.drawText(opening.label, { x: mx - 15, y: my - 10, size: 6, font: fontRegular, color: rgb(0, 0.4, 0.8) });
      }
    }
  }

  // Draw dimensions
  for (const dim of dimensions) {
    if (dim.x1 != null && dim.y1 != null && dim.x2 != null && dim.y2 != null) {
      const x1 = toX((dim.x1 / 100) * realWidth);
      const y1 = toY((dim.y1 / 100) * realDepth);
      const x2 = toX((dim.x2 / 100) * realWidth);
      const y2 = toY((dim.y2 / 100) * realDepth);
      page.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, thickness: 0.5, color: rgb(0.2, 0.2, 0.2) });
      const isHoriz = Math.abs(y2 - y1) < Math.abs(x2 - x1);
      if (isHoriz) {
        page.drawLine({ start: { x: x1, y: y1 - 4 }, end: { x: x1, y: y1 + 4 }, thickness: 0.5, color: rgb(0.2, 0.2, 0.2) });
        page.drawLine({ start: { x: x2, y: y2 - 4 }, end: { x: x2, y: y2 + 4 }, thickness: 0.5, color: rgb(0.2, 0.2, 0.2) });
      } else {
        page.drawLine({ start: { x: x1 - 4, y: y1 }, end: { x: x1 + 4, y: y1 }, thickness: 0.5, color: rgb(0.2, 0.2, 0.2) });
        page.drawLine({ start: { x: x2 - 4, y: y2 }, end: { x: x2 + 4, y: y2 }, thickness: 0.5, color: rgb(0.2, 0.2, 0.2) });
      }
      const mx = (x1 + x2) / 2;
      const my = (y1 + y2) / 2;
      const dimText = dim.label || (dim.width ? `${dim.width}` : "");
      if (dimText) {
        const tw = fontRegular.widthOfTextAtSize(dimText, 7);
        page.drawRectangle({ x: mx - tw / 2 - 2, y: my - 3, width: tw + 4, height: 10, color: rgb(1, 1, 1) });
        page.drawText(dimText, { x: mx - tw / 2, y: my, size: 7, font: fontRegular, color: rgb(0.2, 0.2, 0.2) });
      }
    }
  }

  // Draw annotations
  for (const ann of annotations) {
    if (ann.x1 != null && ann.y1 != null && ann.label) {
      const x = toX((ann.x1 / 100) * realWidth);
      const y = toY((ann.y1 / 100) * realDepth);
      page.drawText(ann.label, { x, y, size: 6, font: fontItalic, color: rgb(0.35, 0.35, 0.35) });
    }
  }

  // ─── Scale Bar ────────────────────────────────────────────────────────────
  const scaleBarMm = getScaleBarLength(realWidth);
  const scaleBarPts = scaleBarMm * scale;
  const sbX = MARGIN + 20;
  const sbY = drawAreaY - 10;
  page.drawLine({ start: { x: sbX, y: sbY }, end: { x: sbX + scaleBarPts, y: sbY }, thickness: 1.5, color: rgb(0, 0, 0) });
  page.drawLine({ start: { x: sbX, y: sbY - 3 }, end: { x: sbX, y: sbY + 3 }, thickness: 1, color: rgb(0, 0, 0) });
  page.drawLine({ start: { x: sbX + scaleBarPts, y: sbY - 3 }, end: { x: sbX + scaleBarPts, y: sbY + 3 }, thickness: 1, color: rgb(0, 0, 0) });
  page.drawText(`${scaleBarMm}mm`, { x: sbX + scaleBarPts / 2 - 12, y: sbY - 12, size: 7, font: fontRegular, color: rgb(0, 0, 0) });
  page.drawText(`Scale: ${conversion.scale || "1:100"}`, { x: sbX, y: sbY + 8, size: 6, font: fontRegular, color: rgb(0.3, 0.3, 0.3) });

  // ─── North Point (floor plans) ────────────────────────────────────────────
  if (conversion.diagramType === "floor_plan") {
    const npX = A3_WIDTH - MARGIN - 30;
    const npY = A3_HEIGHT - MARGIN - 60;
    page.drawLine({ start: { x: npX, y: npY }, end: { x: npX, y: npY + 25 }, thickness: 1.5, color: rgb(0.2, 0.2, 0.2) });
    page.drawLine({ start: { x: npX - 4, y: npY + 20 }, end: { x: npX, y: npY + 25 }, thickness: 1.5, color: rgb(0.2, 0.2, 0.2) });
    page.drawLine({ start: { x: npX + 4, y: npY + 20 }, end: { x: npX, y: npY + 25 }, thickness: 1.5, color: rgb(0.2, 0.2, 0.2) });
    page.drawText("N", { x: npX - 3, y: npY - 12, size: 10, font: fontBold, color: rgb(0.2, 0.2, 0.2) });
  }

  // ─── Element Schedule ─────────────────────────────────────────────────────
  const scheduleElements = [...posts, ...beams];
  if (scheduleElements.length > 0) {
    let sy = MARGIN + 150;
    const colWidths = [35, 45, 70, 55, 70, 50, 65, 110];
    const headers = ["No.", "Type", "Size", "Material", "Colour", "Conn.", "Bracket", "Description"];
    const totalWidth = colWidths.reduce((a, b) => a + b, 0);

    page.drawText("ELEMENT SCHEDULE", { x: MARGIN + 10, y: sy + 15, size: 8, font: fontBold, color: rgb(0, 0, 0) });
    page.drawLine({ start: { x: MARGIN + 10, y: sy + 12 }, end: { x: MARGIN + 10 + totalWidth, y: sy + 12 }, thickness: 1, color: rgb(0, 0, 0) });

    let hx = MARGIN + 10;
    for (let i = 0; i < headers.length; i++) {
      page.drawRectangle({ x: hx, y: sy - 2, width: colWidths[i], height: 14, color: rgb(0.92, 0.92, 0.92), borderColor: rgb(0.6, 0.6, 0.6), borderWidth: 0.5 });
      page.drawText(headers[i], { x: hx + 3, y: sy + 2, size: 6, font: fontBold, color: rgb(0.1, 0.1, 0.1) });
      hx += colWidths[i];
    }
    sy -= 14;

    for (const el of scheduleElements) {
      if (sy < MARGIN + 20) break;
      const row = [
        el.elementNumber || "-",
        el.elementType === "post" ? "Post" : "Beam",
        el.size || "-",
        el.material || "Steel",
        el.colour || "-",
        el.connectionType || "-",
        el.bracketCode || "-",
        el.label || "-",
      ];
      let rx = MARGIN + 10;
      for (let i = 0; i < row.length; i++) {
        page.drawRectangle({ x: rx, y: sy - 2, width: colWidths[i], height: 12, borderColor: rgb(0.8, 0.8, 0.8), borderWidth: 0.3 });
        const cellText = row[i].substring(0, Math.floor(colWidths[i] / 4));
        page.drawText(cellText, { x: rx + 3, y: sy + 1, size: 6, font: fontRegular, color: rgb(0.15, 0.15, 0.15) });
        rx += colWidths[i];
      }
      sy -= 12;
    }
  }

  // ─── Materials Required Summary ──────────────────────────────────────────
  let materialsStartY = MARGIN + 150; // Default if no schedule was drawn
  if (scheduleElements.length > 0) {
    // sy was the last Y position from the element schedule loop above
    // We need to recalculate based on schedule size
    materialsStartY = MARGIN + 150 - 14 - (scheduleElements.length * 12);
  }
  const bracketCounts: Record<string, { code: string; name: string; count: number }> = {};
  const connectionCounts: Record<string, { code: string; name: string; count: number }> = {};

  for (const el of elements) {
    if (el.bracketCode) {
      const key = el.bracketCode;
      if (!bracketCounts[key]) {
        bracketCounts[key] = { code: el.bracketCode, name: el.bracketName || el.bracketCode, count: 0 };
      }
      bracketCounts[key].count++;
    }
    if (el.connectionType) {
      const key = el.connectionType;
      if (!connectionCounts[key]) {
        connectionCounts[key] = { code: el.connectionType, name: el.connectionType, count: 0 };
      }
      connectionCounts[key].count++;
    }
  }

  // Auto-add base plates and post connectors for posts
  const postCount = elements.filter(e => e.elementType === "post").length;
  if (postCount > 0) {
    if (!bracketCounts["BP-STD"]) bracketCounts["BP-STD"] = { code: "BP-STD", name: "Base Plate (Standard)", count: postCount };
    else bracketCounts["BP-STD"].count = Math.max(bracketCounts["BP-STD"].count, postCount);
    if (!bracketCounts["PC-ALU"]) bracketCounts["PC-ALU"] = { code: "PC-ALU", name: "Post Connector (Aluminium)", count: postCount };
    else bracketCounts["PC-ALU"].count = Math.max(bracketCounts["PC-ALU"].count, postCount);
  }

  const allBrackets = Object.values(bracketCounts).sort((a, b) => a.code.localeCompare(b.code));
  const allConnections = Object.values(connectionCounts).sort((a, b) => a.code.localeCompare(b.code));

  if (allBrackets.length > 0 || allConnections.length > 0) {
    let my = materialsStartY - 20;
    if (my < MARGIN + 20) my = MARGIN + 20;

    page.drawText("MATERIALS REQUIRED", { x: MARGIN + 10, y: my + 15, size: 8, font: fontBold, color: rgb(0, 0, 0) });
    page.drawLine({ start: { x: MARGIN + 10, y: my + 12 }, end: { x: MARGIN + 280, y: my + 12 }, thickness: 1, color: rgb(0, 0, 0) });

    if (allBrackets.length > 0) {
      my -= 4;
      page.drawText("Brackets & Components:", { x: MARGIN + 10, y: my, size: 6, font: fontBold, color: rgb(0.2, 0.2, 0.2) });
      my -= 12;

      const matColWidths = [25, 55, 130, 30];
      const matHeaders = ["Qty", "Code", "Description", "Check"];
      let mx = MARGIN + 10;
      for (let i = 0; i < matHeaders.length; i++) {
        page.drawRectangle({ x: mx, y: my - 2, width: matColWidths[i], height: 12, color: rgb(0.92, 0.92, 0.92), borderColor: rgb(0.6, 0.6, 0.6), borderWidth: 0.5 });
        page.drawText(matHeaders[i], { x: mx + 3, y: my + 2, size: 5.5, font: fontBold, color: rgb(0.1, 0.1, 0.1) });
        mx += matColWidths[i];
      }
      my -= 12;

      for (const item of allBrackets) {
        if (my < MARGIN + 20) break;
        const row = [`${item.count}x`, item.code, item.name, ""];
        mx = MARGIN + 10;
        for (let i = 0; i < row.length; i++) {
          page.drawRectangle({ x: mx, y: my - 2, width: matColWidths[i], height: 11, borderColor: rgb(0.8, 0.8, 0.8), borderWidth: 0.3 });
          page.drawText(row[i].substring(0, Math.floor(matColWidths[i] / 3.5)), { x: mx + 3, y: my + 1, size: 5.5, font: fontRegular, color: rgb(0.15, 0.15, 0.15) });
          mx += matColWidths[i];
        }
        my -= 11;
      }
    }

    if (allConnections.length > 0) {
      my -= 10;
      page.drawText("Connection Types:", { x: MARGIN + 10, y: my, size: 6, font: fontBold, color: rgb(0.2, 0.2, 0.2) });
      my -= 12;
      for (const conn of allConnections) {
        if (my < MARGIN + 20) break;
        page.drawText(`${conn.count}x ${conn.code}`, { x: MARGIN + 15, y: my, size: 6, font: fontRegular, color: rgb(0.2, 0.2, 0.2) });
        my -= 10;
      }
    }
  }

  // ─── Notes Section ────────────────────────────────────────────────────────
  if (conversion.notes) {
    const notesX = TB_X;
    const notesY = A3_HEIGHT - MARGIN - 60;
    page.drawText("NOTES & SPECIFICATIONS", { x: notesX, y: notesY, size: 7, font: fontBold, color: rgb(0, 0, 0) });
    page.drawLine({ start: { x: notesX, y: notesY - 3 }, end: { x: notesX + TB_WIDTH, y: notesY - 3 }, thickness: 0.5, color: rgb(0, 0, 0) });

    const noteLines = conversion.notes.split("\n");
    let ny = notesY - 14;
    for (const line of noteLines) {
      if (ny < TB_Y + TB_HEIGHT + 20) break;
      page.drawText(line.substring(0, 60), { x: notesX, y: ny, size: 6, font: fontRegular, color: rgb(0.2, 0.2, 0.2) });
      ny -= 10;
    }
  }

  // ─── Title Block ──────────────────────────────────────────────────────────
  const tbTop = TB_Y + TB_HEIGHT;
  page.drawRectangle({ x: TB_X, y: TB_Y, width: TB_WIDTH, height: TB_HEIGHT, borderColor: rgb(0.1, 0.1, 0.1), borderWidth: 1.5 });

  // Company header
  const compHeaderH = 28;
  page.drawRectangle({ x: TB_X, y: tbTop - compHeaderH, width: TB_WIDTH, height: compHeaderH, color: rgb(0.04, 0.075, 0.125) });
  const compText = companyName.toUpperCase();
  const compWidth = fontBold.widthOfTextAtSize(compText, 14);
  page.drawText(compText, { x: TB_X + TB_WIDTH / 2 - compWidth / 2, y: tbTop - compHeaderH + 9, size: 14, font: fontBold, color: rgb(0.76, 0.64, 0.34) });

  // Project title
  page.drawText(conversion.projectTitle || "Untitled Project", { x: TB_X + 8, y: tbTop - compHeaderH - 16, size: 10, font: fontBold, color: rgb(0.1, 0.1, 0.1) });

  const divY = tbTop - compHeaderH - 22;
  page.drawLine({ start: { x: TB_X, y: divY }, end: { x: TB_X + TB_WIDTH, y: divY }, thickness: 0.5, color: rgb(0.6, 0.6, 0.6) });

  // Client / Job
  const row1Y = divY - 14;
  drawTbCell(page, fontRegular, fontBold, "CLIENT", conversion.clientName || "-", TB_X + 8, row1Y);
  drawTbCell(page, fontRegular, fontBold, "JOB NO.", conversion.jobId ? String(conversion.jobId) : "-", TB_X + TB_WIDTH / 2, row1Y);

  // Address
  const row2Y = row1Y - 18;
  drawTbCell(page, fontRegular, fontBold, "SITE ADDRESS", conversion.siteAddress || "-", TB_X + 8, row2Y);

  // Scale / Date / Rev / Drawn
  const row3Y = row2Y - 18;
  const today = new Date().toLocaleDateString("en-AU", { day: "2-digit", month: "short", year: "numeric" });
  const colW = TB_WIDTH / 4;
  drawTbCell(page, fontRegular, fontBold, "SCALE", conversion.scale || "1:100", TB_X + 8, row3Y);
  drawTbCell(page, fontRegular, fontBold, "DATE", today, TB_X + colW, row3Y);
  drawTbCell(page, fontRegular, fontBold, "REV", conversion.revision || "A", TB_X + colW * 2, row3Y);
  drawTbCell(page, fontRegular, fontBold, "DRAWN", conversion.drawnBy || "-", TB_X + colW * 3, row3Y);

  // ─── Disclaimer ───────────────────────────────────────────────────────────
  const disclaimer = `FOR CONSTRUCTION PURPOSES ONLY — NOT FOR COUNCIL SUBMISSION — © ${companyName} ${new Date().getFullYear()}`;
  const discWidth = fontItalic.widthOfTextAtSize(disclaimer, 6);
  page.drawText(disclaimer, { x: A3_WIDTH / 2 - discWidth / 2, y: MARGIN - 15, size: 6, font: fontItalic, color: rgb(0.6, 0.6, 0.6) });

  const pdfBytes = await doc.save();
  return Buffer.from(pdfBytes);
}

function drawTbCell(page: PDFPage, fontRegular: PDFFont, fontBold: PDFFont, label: string, value: string, x: number, y: number) {
  page.drawText(label, { x, y: y + 6, size: 5, font: fontRegular, color: rgb(0.45, 0.45, 0.45) });
  page.drawText(value.substring(0, 30), { x, y: y - 4, size: 7, font: fontBold, color: rgb(0.1, 0.1, 0.1) });
}

function drawDashedLine(page: PDFPage, x1: number, y1: number, x2: number, y2: number, color: ReturnType<typeof rgb>, thickness: number, pattern: [number, number]) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const length = Math.sqrt(dx * dx + dy * dy);
  if (length === 0) return;
  const ux = dx / length;
  const uy = dy / length;
  const [dashLen, gapLen] = pattern;
  let pos = 0;
  let drawing = true;
  while (pos < length) {
    const segLen = drawing ? dashLen : gapLen;
    const end = Math.min(pos + segLen, length);
    if (drawing) {
      page.drawLine({
        start: { x: x1 + ux * pos, y: y1 + uy * pos },
        end: { x: x1 + ux * end, y: y1 + uy * end },
        thickness,
        color,
      });
    }
    pos = end;
    drawing = !drawing;
  }
}

function getScaleBarLength(overallWidthMm: number): number {
  if (overallWidthMm <= 3000) return 500;
  if (overallWidthMm <= 6000) return 1000;
  if (overallWidthMm <= 12000) return 2000;
  return 5000;
}
