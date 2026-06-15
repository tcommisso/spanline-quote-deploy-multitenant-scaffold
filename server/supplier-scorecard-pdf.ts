/**
 * Supplier Scorecard PDF Generation
 * Generates a branded A4 PDF report showing supplier performance metrics,
 * category breakdown, monthly trend, and recent review history.
 * Uses pdf-lib (already installed).
 */
import { PDFDocument, StandardFonts, rgb, PDFFont, PDFPage } from "pdf-lib";
import type { ScorecardData } from "./supplier-scorecard-db";

// ─── Layout Constants ───────────────────────────────────────────────────────
const A4_WIDTH = 595.28;
const A4_HEIGHT = 841.89;
const MARGIN_LEFT = 40;
const MARGIN_RIGHT = 40;
const MARGIN_TOP = 40;
const MARGIN_BOTTOM = 50;
const CONTENT_WIDTH = A4_WIDTH - MARGIN_LEFT - MARGIN_RIGHT;

// Brand colours
const BRAND_PRIMARY = rgb(0.12, 0.25, 0.45);
const BRAND_ACCENT = rgb(0.18, 0.42, 0.68);
const LIGHT_GREY = rgb(0.92, 0.92, 0.92);
const MID_GREY = rgb(0.6, 0.6, 0.6);
const DARK_TEXT = rgb(0.1, 0.1, 0.1);
const WHITE = rgb(1, 1, 1);
const AMBER = rgb(0.92, 0.7, 0.1);
const RED = rgb(0.85, 0.2, 0.2);
const GREEN = rgb(0.15, 0.65, 0.3);

// ─── Helpers ────────────────────────────────────────────────────────────────

function sanitize(text: string): string {
  if (!text) return "";
  return text
    .replace(/\u2014/g, "--")
    .replace(/\u2013/g, "-")
    .replace(/\u2018/g, "'")
    .replace(/\u2019/g, "'")
    .replace(/\u201c/g, '"')
    .replace(/\u201d/g, '"')
    .replace(/\u2026/g, "...")
    .replace(/[^\x00-\xff]/g, "?");
}

function truncateText(text: string, font: PDFFont, fontSize: number, maxWidth: number): string {
  if (!text) return "";
  const safe = sanitize(text);
  if (font.widthOfTextAtSize(safe, fontSize) <= maxWidth) return safe;
  let truncated = safe;
  while (truncated.length > 0 && font.widthOfTextAtSize(truncated + "...", fontSize) > maxWidth) {
    truncated = truncated.slice(0, -1);
  }
  return truncated + "...";
}

function formatDate(d: Date | string | null): string {
  if (!d) return "--";
  try {
    const date = typeof d === "string" ? new Date(d) : d;
    return date.toLocaleDateString("en-AU", { day: "2-digit", month: "short", year: "numeric" });
  } catch {
    return "--";
  }
}

function ratingColor(rating: number) {
  if (rating >= 4) return GREEN;
  if (rating >= 3) return AMBER;
  return RED;
}

function drawStars(page: PDFPage, x: number, y: number, rating: number, font: PDFFont, fontSize: number) {
  const filled = Math.round(rating);
  let starStr = "";
  for (let i = 1; i <= 5; i++) {
    starStr += i <= filled ? "* " : "- ";
  }
  page.drawText(starStr.trim(), { x, y, size: fontSize, font, color: AMBER });
}

// ─── Main PDF Generator ─────────────────────────────────────────────────────

export async function generateScorecardPdf(data: ScorecardData): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const regular = await doc.embedFont(StandardFonts.Helvetica);

  let page = doc.addPage([A4_WIDTH, A4_HEIGHT]);
  let y = A4_HEIGHT - MARGIN_TOP;

  // ─── Header ─────────────────────────────────────────────────────────────────
  // Title bar
  page.drawRectangle({
    x: MARGIN_LEFT,
    y: y - 30,
    width: CONTENT_WIDTH,
    height: 35,
    color: BRAND_PRIMARY,
  });
  page.drawText("SUPPLIER SCORECARD", {
    x: MARGIN_LEFT + 10,
    y: y - 22,
    size: 16,
    font: bold,
    color: WHITE,
  });
  page.drawText("AltaSpan", {
    x: A4_WIDTH - MARGIN_RIGHT - bold.widthOfTextAtSize("AltaSpan", 12) - 10,
    y: y - 20,
    size: 12,
    font: bold,
    color: WHITE,
  });
  y -= 50;

  // Supplier info
  page.drawText(sanitize(data.supplier.name), {
    x: MARGIN_LEFT,
    y,
    size: 14,
    font: bold,
    color: BRAND_PRIMARY,
  });
  y -= 18;

  if (data.supplier.email) {
    page.drawText(`Email: ${sanitize(data.supplier.email)}`, { x: MARGIN_LEFT, y, size: 9, font: regular, color: MID_GREY });
    y -= 14;
  }
  if (data.supplier.phone) {
    page.drawText(`Phone: ${sanitize(data.supplier.phone)}`, { x: MARGIN_LEFT, y, size: 9, font: regular, color: MID_GREY });
    y -= 14;
  }

  page.drawText(`Report generated: ${formatDate(new Date())}`, {
    x: MARGIN_LEFT,
    y,
    size: 8,
    font: regular,
    color: MID_GREY,
  });
  y -= 25;

  // ─── Overall Rating Section ─────────────────────────────────────────────────
  page.drawRectangle({
    x: MARGIN_LEFT,
    y: y - 55,
    width: CONTENT_WIDTH,
    height: 60,
    color: LIGHT_GREY,
  });

  page.drawText("OVERALL RATING", { x: MARGIN_LEFT + 10, y: y - 15, size: 10, font: bold, color: BRAND_PRIMARY });
  page.drawText(`${data.summary.avgOverall.toFixed(1)} / 5.0`, {
    x: MARGIN_LEFT + 10,
    y: y - 35,
    size: 20,
    font: bold,
    color: ratingColor(data.summary.avgOverall),
  });
  drawStars(page, MARGIN_LEFT + 100, y - 35, data.summary.avgOverall, bold, 18);

  page.drawText(`Based on ${data.summary.totalReviews} review${data.summary.totalReviews !== 1 ? "s" : ""}`, {
    x: MARGIN_LEFT + 10,
    y: y - 50,
    size: 9,
    font: regular,
    color: MID_GREY,
  });

  y -= 75;

  // ─── Category Breakdown ─────────────────────────────────────────────────────
  page.drawText("CATEGORY BREAKDOWN", { x: MARGIN_LEFT, y, size: 10, font: bold, color: BRAND_PRIMARY });
  y -= 20;

  const categories = [
    { label: "Delivery Timeliness", value: data.summary.avgTimeliness },
    { label: "Product Quality", value: data.summary.avgQuality },
    { label: "Communication", value: data.summary.avgCommunication },
    { label: "Pricing Accuracy", value: data.summary.avgPricing },
  ];

  const barMaxWidth = 200;
  const barHeight = 14;
  const labelWidth = 130;

  for (const cat of categories) {
    // Label
    page.drawText(sanitize(cat.label), { x: MARGIN_LEFT, y: y - 2, size: 9, font: regular, color: DARK_TEXT });

    // Background bar
    const barX = MARGIN_LEFT + labelWidth;
    page.drawRectangle({ x: barX, y: y - 4, width: barMaxWidth, height: barHeight, color: LIGHT_GREY });

    // Filled bar
    const fillWidth = (cat.value / 5) * barMaxWidth;
    page.drawRectangle({ x: barX, y: y - 4, width: fillWidth, height: barHeight, color: ratingColor(cat.value) });

    // Value text
    page.drawText(`${cat.value.toFixed(1)}`, {
      x: barX + barMaxWidth + 8,
      y: y - 2,
      size: 9,
      font: bold,
      color: DARK_TEXT,
    });

    y -= 24;
  }

  y -= 15;

  // ─── Monthly Trend ──────────────────────────────────────────────────────────
  if (data.monthlyTrend.length > 0) {
    page.drawText("MONTHLY TREND", { x: MARGIN_LEFT, y, size: 10, font: bold, color: BRAND_PRIMARY });
    y -= 18;

    // Table header
    const colMonth = MARGIN_LEFT;
    const colRating = MARGIN_LEFT + 120;
    const colCount = MARGIN_LEFT + 220;

    page.drawRectangle({ x: MARGIN_LEFT, y: y - 3, width: 300, height: 14, color: BRAND_ACCENT });
    page.drawText("Month", { x: colMonth + 5, y: y, size: 8, font: bold, color: WHITE });
    page.drawText("Avg Rating", { x: colRating + 5, y: y, size: 8, font: bold, color: WHITE });
    page.drawText("Reviews", { x: colCount + 5, y: y, size: 8, font: bold, color: WHITE });
    y -= 16;

    for (const row of data.monthlyTrend.slice(-12)) {
      if (y < MARGIN_BOTTOM + 30) {
        page = doc.addPage([A4_WIDTH, A4_HEIGHT]);
        y = A4_HEIGHT - MARGIN_TOP;
        page.drawText("SUPPLIER SCORECARD (continued)", { x: MARGIN_LEFT, y, size: 9, font: bold, color: MID_GREY });
        y -= 20;
      }
      page.drawText(row.month, { x: colMonth + 5, y, size: 8, font: regular, color: DARK_TEXT });
      page.drawText(row.avgOverall.toFixed(2), { x: colRating + 5, y, size: 8, font: regular, color: ratingColor(row.avgOverall) });
      page.drawText(String(row.reviewCount), { x: colCount + 5, y, size: 8, font: regular, color: DARK_TEXT });
      y -= 14;
    }

    y -= 15;
  }

  // ─── Recent Reviews ─────────────────────────────────────────────────────────
  if (data.recentReviews.length > 0) {
    if (y < MARGIN_BOTTOM + 100) {
      page = doc.addPage([A4_WIDTH, A4_HEIGHT]);
      y = A4_HEIGHT - MARGIN_TOP;
    }

    page.drawText("RECENT REVIEWS", { x: MARGIN_LEFT, y, size: 10, font: bold, color: BRAND_PRIMARY });
    y -= 18;

    // Table header
    const cols = { date: MARGIN_LEFT, reviewer: MARGIN_LEFT + 75, t: MARGIN_LEFT + 200, q: MARGIN_LEFT + 230, c: MARGIN_LEFT + 260, p: MARGIN_LEFT + 290, overall: MARGIN_LEFT + 320 };

    page.drawRectangle({ x: MARGIN_LEFT, y: y - 3, width: CONTENT_WIDTH, height: 14, color: BRAND_ACCENT });
    page.drawText("Date", { x: cols.date + 3, y, size: 7, font: bold, color: WHITE });
    page.drawText("Reviewer", { x: cols.reviewer + 3, y, size: 7, font: bold, color: WHITE });
    page.drawText("T", { x: cols.t + 3, y, size: 7, font: bold, color: WHITE });
    page.drawText("Q", { x: cols.q + 3, y, size: 7, font: bold, color: WHITE });
    page.drawText("C", { x: cols.c + 3, y, size: 7, font: bold, color: WHITE });
    page.drawText("P", { x: cols.p + 3, y, size: 7, font: bold, color: WHITE });
    page.drawText("Overall", { x: cols.overall + 3, y, size: 7, font: bold, color: WHITE });
    y -= 16;

    for (const review of data.recentReviews) {
      if (y < MARGIN_BOTTOM + 30) {
        page = doc.addPage([A4_WIDTH, A4_HEIGHT]);
        y = A4_HEIGHT - MARGIN_TOP;
        page.drawText("SUPPLIER SCORECARD (continued)", { x: MARGIN_LEFT, y, size: 9, font: bold, color: MID_GREY });
        y -= 20;
      }

      const rowBg = data.recentReviews.indexOf(review) % 2 === 0 ? LIGHT_GREY : WHITE;
      page.drawRectangle({ x: MARGIN_LEFT, y: y - 3, width: CONTENT_WIDTH, height: 13, color: rowBg });

      page.drawText(formatDate(review.createdAt), { x: cols.date + 3, y, size: 7, font: regular, color: DARK_TEXT });
      page.drawText(truncateText(review.userName || "Unknown", regular, 7, 120), { x: cols.reviewer + 3, y, size: 7, font: regular, color: DARK_TEXT });
      page.drawText(String(review.timeliness), { x: cols.t + 3, y, size: 7, font: regular, color: DARK_TEXT });
      page.drawText(String(review.quality), { x: cols.q + 3, y, size: 7, font: regular, color: DARK_TEXT });
      page.drawText(String(review.communication), { x: cols.c + 3, y, size: 7, font: regular, color: DARK_TEXT });
      page.drawText(String(review.pricing), { x: cols.p + 3, y, size: 7, font: regular, color: DARK_TEXT });
      page.drawText(Number(review.overallRating).toFixed(1), { x: cols.overall + 3, y, size: 7, font: bold, color: ratingColor(Number(review.overallRating)) });
      y -= 14;

      // Notes below row if present
      if (review.notes) {
        const noteText = truncateText(review.notes, regular, 7, CONTENT_WIDTH - 20);
        page.drawText(`  "${noteText}"`, { x: MARGIN_LEFT + 10, y, size: 7, font: regular, color: MID_GREY });
        y -= 12;
      }
    }
  }

  // ─── Footer ─────────────────────────────────────────────────────────────────
  const pages = doc.getPages();
  for (let i = 0; i < pages.length; i++) {
    const p = pages[i];
    p.drawText(`Page ${i + 1} of ${pages.length}`, {
      x: A4_WIDTH - MARGIN_RIGHT - 60,
      y: 25,
      size: 7,
      font: regular,
      color: MID_GREY,
    });
    p.drawText("Confidential - AltaSpan Supplier Scorecard", {
      x: MARGIN_LEFT,
      y: 25,
      size: 7,
      font: regular,
      color: MID_GREY,
    });
  }

  const pdfBytes = await doc.save();
  return Buffer.from(pdfBytes);
}
