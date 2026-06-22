/**
 * Proposal Appendix Plugin Interface
 *
 * Quote-type appendices for the consolidated proposal PDF. Each selected
 * proposal section can contribute detail pages, spec snapshots, and images.
 */

import type { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { SPEC_FIELDS } from "../../../shared/spec-field-catalogue";

// ─── Types ───────────────────────────────────────────────────────────────────

export type SectionType = "opq" | "deck" | "eclipse" | "blind" | "louvre" | "security_door" | "security_screen";

/** Context passed to each plugin when generating appendix pages */
export interface AppendixContext {
  quoteId: number;
  sectionType: SectionType;
  label: string;
  worksPrice: number;
  /** Any additional data the plugin needs (fetched from server before PDF generation) */
  quoteData?: Record<string, unknown>;
}

/** A single appendix page to be rendered */
export interface AppendixPage {
  title: string;
  sectionType: SectionType;
  sectionLabel: string;
  /** Render function that draws content onto the PDF at the given y position */
  render: (doc: jsPDF, startY: number, pageWidth: number, margin: number) => number;
}

/** Plugin registration interface */
export interface AppendixPlugin {
  sectionType: SectionType;
  /** Human-readable name for the plugin */
  name: string;
  /** Generate appendix pages for this section */
  generatePages: (ctx: AppendixContext) => AppendixPage[];
  /** Optional: fetch additional data needed for rendering (called before generatePages) */
  fetchData?: (quoteId: number) => Promise<Record<string, unknown>>;
}

type AppendixImage = {
  url?: string;
  caption?: string;
  dataUrl?: string;
  format?: "JPEG" | "PNG";
  width?: number;
  height?: number;
};

type SpecRow = {
  section: string;
  label: string;
  value: string;
  order: number;
};

// ─── Registry ────────────────────────────────────────────────────────────────

const pluginRegistry = new Map<SectionType, AppendixPlugin>();

/** Register an appendix plugin for a section type */
export function registerAppendixPlugin(plugin: AppendixPlugin): void {
  pluginRegistry.set(plugin.sectionType, plugin);
}

/** Get the registered plugin for a section type (if any) */
export function getPlugin(sectionType: SectionType): AppendixPlugin | undefined {
  return pluginRegistry.get(sectionType);
}

/** Check if a section type has a registered plugin */
export function hasPlugin(sectionType: SectionType): boolean {
  return pluginRegistry.has(sectionType);
}

// ─── Batch Fetch / Image Hydration ───────────────────────────────────────────

async function fetchAllAppendixData(
  sections: Array<{ type: SectionType; quoteId: number }>,
  trpcClient: any
): Promise<Record<string, Record<string, unknown>>> {
  try {
    const result = await trpcClient.proposals.appendixData.query({
      sections: sections.map((s) => ({ type: s.type, quoteId: s.quoteId })),
    });
    return result || {};
  } catch (err) {
    console.warn("[AppendixPlugins] Failed to fetch appendix data:", err);
    return {};
  }
}

function isSupportedImageMime(mime: string) {
  return ["image/jpeg", "image/jpg", "image/png", "image/webp"].includes(mime.toLowerCase());
}

function loadBrowserImage(src: string): Promise<HTMLImageElement | undefined> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(undefined);
    img.src = src;
  });
}

async function imageUrlToPdfImage(url: string): Promise<Pick<AppendixImage, "dataUrl" | "format" | "width" | "height"> | undefined> {
  if (!url) return undefined;
  if (typeof document === "undefined") return undefined;

  let objectUrl: string | undefined;
  let source = url;

  try {
    if (url.startsWith("data:image/")) {
      const mime = url.match(/^data:([^;,]+)/i)?.[1] || "";
      if (!isSupportedImageMime(mime)) return undefined;
    } else {
      const response = await fetch(url, { mode: "cors" });
      if (!response.ok) return undefined;
      const contentType = response.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() || "";
      const blob = await response.blob();
      const mime = blob.type || contentType;
      if (!isSupportedImageMime(mime)) return undefined;
      objectUrl = URL.createObjectURL(blob);
      source = objectUrl;
    }

    const image = await loadBrowserImage(source);
    if (!image) return undefined;

    const sourceWidth = image.naturalWidth || image.width;
    const sourceHeight = image.naturalHeight || image.height;
    if (!sourceWidth || !sourceHeight) return undefined;

    const maxDimension = 1600;
    const scale = Math.min(1, maxDimension / Math.max(sourceWidth, sourceHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(sourceWidth * scale));
    canvas.height = Math.max(1, Math.round(sourceHeight * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) return undefined;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

    return {
      dataUrl: canvas.toDataURL("image/jpeg", 0.88),
      format: "JPEG",
      width: canvas.width,
      height: canvas.height,
    };
  } catch {
    return undefined;
  } finally {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  }
}

async function prepareImages(images: unknown): Promise<AppendixImage[]> {
  const rawImages = Array.isArray(images) ? images.slice(0, 8) : [];
  const prepared: AppendixImage[] = [];

  for (const raw of rawImages) {
    const item = raw as AppendixImage;
    const url = String(item.url || "").trim();
    if (!url) continue;

    const pdfImage = await imageUrlToPdfImage(url);
    prepared.push({
      ...item,
      url,
      dataUrl: pdfImage?.dataUrl,
      format: pdfImage?.format,
      width: pdfImage?.width,
      height: pdfImage?.height,
    });
  }

  return prepared;
}

/**
 * Generate all appendix pages for the selected sections.
 */
export async function getAppendixPages(
  sections: Array<{ type: SectionType; quoteId: number; label: string; worksPrice: number }>,
  trpcClient?: any
): Promise<AppendixPage[]> {
  const allPages: AppendixPage[] = [];

  let batchData: Record<string, Record<string, unknown>> = {};
  if (trpcClient) {
    batchData = await fetchAllAppendixData(sections, trpcClient);
  }

  for (const section of sections) {
    const plugin = pluginRegistry.get(section.type);
    if (!plugin) continue;

    const ctx: AppendixContext = {
      quoteId: section.quoteId,
      sectionType: section.type,
      label: section.label,
      worksPrice: section.worksPrice,
    };

    const key = `${section.type}_${section.quoteId}`;
    if (batchData[key]) {
      ctx.quoteData = batchData[key];
    } else if (plugin.fetchData) {
      ctx.quoteData = await plugin.fetchData(section.quoteId);
    }

    if (ctx.quoteData?.images) {
      ctx.quoteData.images = await prepareImages(ctx.quoteData.images);
    }

    allPages.push(...plugin.generatePages(ctx));
  }

  return allPages;
}

// ─── Shared Drawing Helpers ──────────────────────────────────────────────────

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    minimumFractionDigits: 2,
  }).format(amount || 0);
}

function textValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") return value ? "Yes" : "";
  if (Array.isArray(value)) return value.map(textValue).filter(Boolean).join(", ");
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => textValue(v))
      .map(([k, v]) => `${humanize(k)}: ${textValue(v)}`);
    return entries.join("; ");
  }
  return String(value).trim();
}

function humanize(key: string): string {
  return key
    .replace(/^spec/, "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase())
    .trim();
}

function specMeta(key: string) {
  return SPEC_FIELDS.find((field) => field.value === key);
}

const OMIT_SPEC_KEYS = new Set([
  "specDiagramAnnotations",
  "specRevisionHistory",
  "specChecklistSelections",
  "specFloorWorkItems",
]);

function buildSpecRows(specSheet: unknown): SpecRow[] {
  const spec = (specSheet || {}) as Record<string, unknown>;
  const fieldOrder = new Map(SPEC_FIELDS.map((field, index) => [field.value, index]));

  return Object.entries(spec)
    .filter(([key]) => !OMIT_SPEC_KEYS.has(key))
    .map(([key, value]) => {
      const valueText = textValue(value);
      if (!valueText) return null;
      const meta = specMeta(key);
      return {
        section: meta?.section || "Specification",
        label: meta?.label || humanize(key),
        value: valueText,
        order: fieldOrder.get(key) ?? 10_000,
      };
    })
    .filter((row): row is SpecRow => !!row)
    .sort((a, b) => a.order - b.order || a.section.localeCompare(b.section) || a.label.localeCompare(b.label));
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

function drawSectionIntro(
  doc: jsPDF,
  ctx: AppendixContext,
  startY: number,
  pageWidth: number,
  margin: number,
  summaryRows: Array<[string, string | number | null | undefined]> = []
) {
  let y = startY;
  const contentWidth = pageWidth - margin * 2;

  doc.setFillColor(247, 248, 250);
  doc.setDrawColor(225, 228, 232);
  doc.roundedRect(margin, y, contentWidth, 26, 2, 2, "FD");

  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(20, 35, 45);
  doc.text(ctx.label, margin + 4, y + 8);

  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(95, 105, 115);
  doc.text(`Works price ex GST: ${formatCurrency(ctx.worksPrice)}`, margin + 4, y + 15);

  if (summaryRows.length > 0) {
    const summary = summaryRows
      .filter(([, value]) => textValue(value))
      .slice(0, 3)
      .map(([label, value]) => `${label}: ${textValue(value)}`)
      .join("   |   ");
    if (summary) doc.text(summary, margin + 4, y + 21);
  }

  doc.setTextColor(0, 0, 0);
  return y + 34;
}

function drawParagraphBlock(doc: jsPDF, title: string, body: unknown, y: number, pageWidth: number, margin: number) {
  const value = textValue(body);
  if (!value) return y;

  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text(title, margin, y);
  y += 5;

  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  const lines = doc.splitTextToSize(value, pageWidth - margin * 2);
  doc.text(lines, margin, y);
  return y + lines.length * 3.7 + 7;
}

function drawSpecTable(doc: jsPDF, rows: SpecRow[], y: number, pageWidth: number, margin: number) {
  if (rows.length === 0) return y;
  const contentWidth = pageWidth - margin * 2;

  autoTable(doc, {
    startY: y,
    head: [["Spec Section", "Field", "Selection"]],
    body: rows.map((row) => [row.section, row.label, row.value]),
    margin: { left: margin, right: margin },
    theme: "grid",
    styles: { fontSize: 7.5, cellPadding: 1.7, valign: "top" },
    headStyles: { fillColor: [36, 48, 62], textColor: [255, 255, 255], fontSize: 8 },
    columnStyles: {
      0: { cellWidth: 42 },
      1: { cellWidth: 48 },
      2: { cellWidth: contentWidth - 90 },
    },
  });

  return ((doc as any).lastAutoTable?.finalY || y) + 6;
}

function drawSimpleTable(
  doc: jsPDF,
  y: number,
  pageWidth: number,
  margin: number,
  head: string[],
  body: string[][],
  columnWidths?: Record<number, number>
) {
  if (body.length === 0) return y;
  autoTable(doc, {
    startY: y,
    head: [head],
    body,
    margin: { left: margin, right: margin },
    theme: "grid",
    styles: { fontSize: 7.5, cellPadding: 1.7, valign: "top" },
    headStyles: { fillColor: [36, 48, 62], textColor: [255, 255, 255], fontSize: 8 },
    columnStyles: columnWidths
      ? Object.fromEntries(Object.entries(columnWidths).map(([key, width]) => [key, { cellWidth: width }]))
      : undefined,
  });
  return ((doc as any).lastAutoTable?.finalY || y) + 6;
}

function drawImageGallery(doc: jsPDF, images: AppendixImage[], startY: number, pageWidth: number, margin: number) {
  let y = startY;
  const contentWidth = pageWidth - margin * 2;
  const gap = 6;
  const tileW = (contentWidth - gap) / 2;
  const tileH = 70;

  images.forEach((image, index) => {
    const col = index % 2;
    const row = Math.floor(index / 2);
    const x = margin + col * (tileW + gap);
    const top = y + row * (tileH + 14);

    doc.setDrawColor(225, 228, 232);
    doc.setFillColor(250, 250, 250);
    doc.roundedRect(x, top, tileW, tileH, 2, 2, "FD");

    if (image.dataUrl) {
      try {
        const maxW = tileW - 8;
        const maxH = tileH - 18;
        const ratio = image.width && image.height ? image.width / image.height : 1.4;
        let drawW = maxW;
        let drawH = drawW / ratio;
        if (drawH > maxH) {
          drawH = maxH;
          drawW = drawH * ratio;
        }
        const format = image.format || "JPEG";
        doc.addImage(image.dataUrl, format, x + (tileW - drawW) / 2, top + 4, drawW, drawH);
      } catch {
        drawImageFallback(doc, image, x, top, tileW);
      }
    } else {
      drawImageFallback(doc, image, x, top, tileW);
    }

    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(75, 85, 99);
    const caption = image.caption || `Image ${index + 1}`;
    doc.text(doc.splitTextToSize(caption, tileW - 8), x + 4, top + tileH - 7);
    doc.setTextColor(0, 0, 0);
  });

  return y + Math.ceil(images.length / 2) * (tileH + 14);
}

function drawImageFallback(doc: jsPDF, image: AppendixImage, x: number, y: number, width: number) {
  doc.setFontSize(7);
  doc.setFont("helvetica", "italic");
  doc.setTextColor(120, 120, 120);
  const lines = doc.splitTextToSize(`Image attached: ${image.url || "unavailable"}`, width - 12);
  doc.text(lines.slice(0, 4), x + 6, y + 16);
  doc.setTextColor(0, 0, 0);
}

function makeSpecPages(ctx: AppendixContext, titlePrefix: string): AppendixPage[] {
  const rows = buildSpecRows(ctx.quoteData?.specSheet);
  if (rows.length === 0) return [];

  return chunk(rows, 28).map((rowChunk, index) => ({
    title: `${titlePrefix} - Spec Sheet${index > 0 ? ` (${index + 1})` : ""}`,
    sectionType: ctx.sectionType,
    sectionLabel: ctx.label,
    render: (doc, startY, pageWidth, margin) => {
      let y = drawSectionIntro(doc, ctx, startY, pageWidth, margin);
      doc.setFontSize(12);
      doc.setFont("helvetica", "bold");
      doc.text("Specification Snapshot", margin, y);
      y += 7;
      return drawSpecTable(doc, rowChunk, y, pageWidth, margin);
    },
  }));
}

function makeImagePages(ctx: AppendixContext, titlePrefix: string): AppendixPage[] {
  const images = Array.isArray(ctx.quoteData?.images) ? (ctx.quoteData.images as AppendixImage[]) : [];
  const usableImages = images.filter((image) => image.url || image.dataUrl);
  if (usableImages.length === 0) return [];

  return chunk(usableImages, 4).map((imageChunk, index) => ({
    title: `${titlePrefix} - Images${index > 0 ? ` (${index + 1})` : ""}`,
    sectionType: ctx.sectionType,
    sectionLabel: ctx.label,
    render: (doc, startY, pageWidth, margin) => {
      let y = drawSectionIntro(doc, ctx, startY, pageWidth, margin);
      doc.setFontSize(12);
      doc.setFont("helvetica", "bold");
      doc.text("Images and Site References", margin, y);
      y += 7;
      return drawImageGallery(doc, imageChunk, y, pageWidth, margin);
    },
  }));
}

function sharedPages(ctx: AppendixContext, titlePrefix: string): AppendixPage[] {
  return [...makeSpecPages(ctx, titlePrefix), ...makeImagePages(ctx, titlePrefix)];
}

// ─── OPQ Plugin (Structure) ─────────────────────────────────────────────────

registerAppendixPlugin({
  sectionType: "opq",
  name: "Structure Appendix",
  generatePages: (ctx) => {
    const pages: AppendixPage[] = [];

    pages.push({
      title: `${ctx.label} - Scope and Items`,
      sectionType: ctx.sectionType,
      sectionLabel: ctx.label,
      render: (doc, startY, pageWidth, margin) => {
        let y = drawSectionIntro(doc, ctx, startY, pageWidth, margin, [
          ["Width", ctx.quoteData?.specWidth ? `${ctx.quoteData.specWidth}m` : ""],
          ["Length", ctx.quoteData?.specLength ? `${ctx.quoteData.specLength}m` : ""],
        ]);

        y = drawParagraphBlock(doc, "Description of Works", ctx.quoteData?.descriptionOfWorks, y, pageWidth, margin);
        y = drawParagraphBlock(doc, "Notes", ctx.quoteData?.notes, y, pageWidth, margin);

        const materials = Array.isArray(ctx.quoteData?.materials) ? ctx.quoteData.materials as any[] : [];
        if (materials.length > 0) {
          doc.setFontSize(11);
          doc.setFont("helvetica", "bold");
          doc.text("Included Materials", margin, y);
          y += 6;
          y = drawSimpleTable(
            doc,
            y,
            pageWidth,
            margin,
            ["Category", "Item", "Qty", "Unit"],
            materials.map((item) => [
              textValue(item.tab),
              textValue(item.name),
              textValue(item.qty),
              textValue(item.unit),
            ]),
            { 0: 34, 2: 20, 3: 20 }
          );
        }

        const specItems = Array.isArray(ctx.quoteData?.specItems) ? ctx.quoteData.specItems as any[] : [];
        if (specItems.length > 0) {
          doc.setFontSize(11);
          doc.setFont("helvetica", "bold");
          doc.text("Generated Quote Items", margin, y);
          y += 6;
          y = drawSimpleTable(
            doc,
            y,
            pageWidth,
            margin,
            ["Section", "Description", "Qty", "UOM"],
            specItems.map((item) => [
              textValue(item.tab),
              textValue(item.description),
              textValue(item.qty),
              textValue(item.uom),
            ]),
            { 0: 34, 2: 20, 3: 20 }
          );
        }

        return y;
      },
    });

    return [...pages, ...sharedPages(ctx, "Structure")];
  },
});

// ─── Eclipse Plugin ─────────────────────────────────────────────────────────

registerAppendixPlugin({
  sectionType: "eclipse",
  name: "Eclipse Louvre Appendix",
  generatePages: (ctx) => {
    const pages: AppendixPage[] = [];

    pages.push({
      title: `${ctx.label} - Unit Configuration`,
      sectionType: ctx.sectionType,
      sectionLabel: ctx.label,
      render: (doc, startY, pageWidth, margin) => {
        let y = drawSectionIntro(doc, ctx, startY, pageWidth, margin, [
          ["Total area", ctx.quoteData?.totalSqm ? `${ctx.quoteData.totalSqm}m2` : ""],
        ]);

        y = drawParagraphBlock(doc, "Description of Works", ctx.quoteData?.descriptionOfWorks, y, pageWidth, margin);

        const units = Array.isArray(ctx.quoteData?.units) ? ctx.quoteData.units as any[] : [];
        if (units.length > 0) {
          doc.setFontSize(11);
          doc.setFont("helvetica", "bold");
          doc.text("Unit Configuration", margin, y);
          y += 6;
          y = drawSimpleTable(
            doc,
            y,
            pageWidth,
            margin,
            ["Unit", "Width", "Projection", "Colour"],
            units.map((unit) => [
              textValue(unit.name),
              textValue(unit.width),
              textValue(unit.projection),
              textValue(unit.colour),
            ]),
            { 0: 42, 1: 28, 2: 34 }
          );
        }

        const materialLines = Array.isArray(ctx.quoteData?.materialLines) ? ctx.quoteData.materialLines as any[] : [];
        if (materialLines.length > 0) {
          doc.setFontSize(11);
          doc.setFont("helvetica", "bold");
          doc.text("Material Lines", margin, y);
          y += 6;
          y = drawSimpleTable(
            doc,
            y,
            pageWidth,
            margin,
            ["Description", "Qty"],
            materialLines.map((line) => [textValue(line.description), textValue(line.qty)]),
            { 1: 24 }
          );
        }

        y = drawParagraphBlock(doc, "Notes", ctx.quoteData?.notes, y, pageWidth, margin);
        return y;
      },
    });

    return [...pages, ...sharedPages(ctx, "Eclipse")];
  },
});

// ─── Deck Plugin ────────────────────────────────────────────────────────────

registerAppendixPlugin({
  sectionType: "deck",
  name: "Deck Appendix",
  generatePages: (ctx) => {
    const pages: AppendixPage[] = [];

    pages.push({
      title: `${ctx.label} - Deck Specification`,
      sectionType: ctx.sectionType,
      sectionLabel: ctx.label,
      render: (doc, startY, pageWidth, margin) => {
        let y = drawSectionIntro(doc, ctx, startY, pageWidth, margin, [
          ["Area", ctx.quoteData?.area ? `${ctx.quoteData.area}m2` : ""],
          ["Width", ctx.quoteData?.width ? `${ctx.quoteData.width}m` : ""],
          ["Projection", ctx.quoteData?.projection ? `${ctx.quoteData.projection}m` : ""],
        ]);

        y = drawParagraphBlock(doc, "Description of Works", ctx.quoteData?.descriptionOfWorks, y, pageWidth, margin);

        const rows: string[][] = [
          ["Board Type", textValue(ctx.quoteData?.boardType)],
          ["Frame Type", textValue(ctx.quoteData?.frameType)],
          ["Colour", textValue(ctx.quoteData?.colour)],
          ["Shape", textValue(ctx.quoteData?.shape)],
        ].filter(([, value]) => !!value);

        if (rows.length > 0) {
          doc.setFontSize(11);
          doc.setFont("helvetica", "bold");
          doc.text("Deck Selection", margin, y);
          y += 6;
          y = drawSimpleTable(doc, y, pageWidth, margin, ["Field", "Selection"], rows, { 0: 45 });
        }

        const addons = (ctx.quoteData?.addons || {}) as Record<string, boolean>;
        const activeAddons = Object.entries(addons)
          .filter(([, active]) => active)
          .map(([key]) => humanize(key));
        if (activeAddons.length > 0) {
          y = drawParagraphBlock(doc, "Included Add-ons", activeAddons.join(", "), y, pageWidth, margin);
        }

        y = drawParagraphBlock(doc, "Notes", ctx.quoteData?.notes, y, pageWidth, margin);
        return y;
      },
    });

    return [...pages, ...sharedPages(ctx, "Deck")];
  },
});

// ─── Blind and Security Screen Plugins ──────────────────────────────────────

function screenLikePlugin(sectionType: "blind" | "security_screen", name: string, titlePrefix: string): AppendixPlugin {
  return {
    sectionType,
    name,
    generatePages: (ctx) => {
      const pages: AppendixPage[] = [{
        title: `${ctx.label} - Item Schedule`,
        sectionType: ctx.sectionType,
        sectionLabel: ctx.label,
        render: (doc, startY, pageWidth, margin) => {
          let y = drawSectionIntro(doc, ctx, startY, pageWidth, margin);

          const items = Array.isArray(ctx.quoteData?.items) ? ctx.quoteData.items as any[] : [];
          if (items.length > 0) {
            doc.setFontSize(11);
            doc.setFont("helvetica", "bold");
            doc.text("Item Schedule", margin, y);
            y += 6;
            y = drawSimpleTable(
              doc,
              y,
              pageWidth,
              margin,
              ["#", "Product", "Size / Qty", "Colour", "Details"],
              items.map((item) => [
                textValue(item.itemNumber),
                [item.brand, item.productType].map(textValue).filter(Boolean).join(" "),
                `${textValue(item.widthMm)} x ${textValue(item.heightMm)} mm / Qty ${textValue(item.quantity)}`,
                textValue(item.fabricColourName || item.colourName),
                [
                  item.handleSide && `Handle ${item.handleSide}`,
                  item.hingeSide && `Hinge ${item.hingeSide}`,
                  item.openingDirection,
                  item.notes,
                ].map(textValue).filter(Boolean).join("; "),
              ]),
              { 0: 12, 2: 42, 3: 34 }
            );
          }

          y = drawParagraphBlock(doc, "Notes", ctx.quoteData?.notes, y, pageWidth, margin);
          return y;
        },
      }];

      return [...pages, ...makeImagePages(ctx, titlePrefix)];
    },
  };
}

registerAppendixPlugin(screenLikePlugin("blind", "Blind Appendix", "Blinds"));
registerAppendixPlugin(screenLikePlugin("security_screen", "Security Screen Appendix", "Security Screens"));

// ─── Generic Fallbacks ──────────────────────────────────────────────────────

function genericPlugin(sectionType: "louvre" | "security_door", label: string): AppendixPlugin {
  return {
    sectionType,
    name: `${label} Appendix`,
    generatePages: (ctx) => [{
      title: `${ctx.label} - Detail`,
      sectionType: ctx.sectionType,
      sectionLabel: ctx.label,
      render: (doc, startY, pageWidth, margin) => {
        let y = drawSectionIntro(doc, ctx, startY, pageWidth, margin);
        doc.setFontSize(9);
        doc.setFont("helvetica", "normal");
        doc.text("This section is included in the proposal summary.", margin, y);
        return y + 8;
      },
    }],
  };
}

registerAppendixPlugin(genericPlugin("louvre", "Louvre"));
registerAppendixPlugin(genericPlugin("security_door", "Security Door"));
