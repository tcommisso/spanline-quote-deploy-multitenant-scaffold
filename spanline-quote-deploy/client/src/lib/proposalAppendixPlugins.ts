/**
 * Proposal Appendix Plugin Interface
 * 
 * Each quote type can register a plugin that generates appendix pages
 * for the consolidated master proposal PDF. This keeps the master PDF
 * renderer generic while allowing each section to contribute its own
 * detailed pages (materials lists, diagrams, photos, etc.).
 * 
 * Usage:
 *   1. Each quote type registers its plugin via registerAppendixPlugin()
 *   2. When generating the master PDF, call getAppendixPages() with the
 *      selected sections to collect all appendix content
 *   3. The PDF renderer iterates over the returned pages and renders them
 */

import type { jsPDF } from "jspdf";

// ─── Types ───────────────────────────────────────────────────────────────────

export type SectionType = "opq" | "deck" | "eclipse" | "blind" | "louvre" | "security_door";

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
  render: (doc: jsPDF, startY: number, pageWidth: number, margin: number) => number; // returns final Y
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

// ─── Batch fetch helper ─────────────────────────────────────────────────────

/**
 * Fetches appendix data for all sections in a single tRPC call via the
 * proposals.appendixData endpoint, then distributes results to each plugin.
 */
async function fetchAllAppendixData(
  sections: Array<{ type: SectionType; quoteId: number }>,
  trpcClient: any
): Promise<Record<string, Record<string, unknown>>> {
  try {
    const result = await trpcClient.proposals.appendixData.query({
      sections: sections.map(s => ({ type: s.type, quoteId: s.quoteId })),
    });
    return result || {};
  } catch (err) {
    console.warn("[AppendixPlugins] Failed to fetch appendix data:", err);
    return {};
  }
}

/**
 * Generate all appendix pages for the selected sections.
 * Uses batch fetch via tRPC to get all data in one call, then generates pages.
 * 
 * @param sections - The proposal sections
 * @param trpcClient - Optional vanilla tRPC client for batch fetching (if not provided, uses individual fetchData)
 */
export async function getAppendixPages(
  sections: Array<{ type: SectionType; quoteId: number; label: string; worksPrice: number }>,
  trpcClient?: any
): Promise<AppendixPage[]> {
  const allPages: AppendixPage[] = [];

  // Batch fetch all appendix data if trpcClient is provided
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

    // Use batch data if available, otherwise fall back to individual fetchData
    const key = `${section.type}_${section.quoteId}`;
    if (batchData[key]) {
      ctx.quoteData = batchData[key];
    } else if (plugin.fetchData) {
      ctx.quoteData = await plugin.fetchData(section.quoteId);
    }

    const pages = plugin.generatePages(ctx);
    allPages.push(...pages);
  }

  return allPages;
}

// ─── OPQ Plugin (Structure — Materials & Spec Items) ────────────────────────

registerAppendixPlugin({
  sectionType: "opq",
  name: "Structure (OPQ) Appendix",
  generatePages: (ctx) => {
    const pages: AppendixPage[] = [];

    pages.push({
      title: `${ctx.label} — Works Detail`,
      sectionType: ctx.sectionType,
      sectionLabel: ctx.label,
      render: (doc, startY, pageWidth, margin) => {
        let y = startY;
        const contentWidth = pageWidth - margin * 2;

        // Section header
        doc.setFontSize(14);
        doc.setFont("helvetica", "bold");
        doc.text(ctx.label, margin, y);
        y += 8;

        doc.setFontSize(10);
        doc.setFont("helvetica", "normal");
        doc.text(`Works Price (ex GST): $${ctx.worksPrice.toLocaleString("en-AU", { minimumFractionDigits: 2 })}`, margin, y);
        y += 8;

        // Description of works
        if (ctx.quoteData?.descriptionOfWorks) {
          doc.setFontSize(11);
          doc.setFont("helvetica", "bold");
          doc.text("Description of Works:", margin, y);
          y += 6;

          doc.setFontSize(9);
          doc.setFont("helvetica", "normal");
          const lines = doc.splitTextToSize(String(ctx.quoteData.descriptionOfWorks), contentWidth - 8);
          doc.text(lines, margin + 4, y);
          y += lines.length * 4.5 + 4;
        }

        // Dimensions
        if (ctx.quoteData?.specWidth || ctx.quoteData?.specLength) {
          doc.setFontSize(10);
          doc.setFont("helvetica", "normal");
          const dims: string[] = [];
          if (ctx.quoteData.specWidth) dims.push(`Width: ${ctx.quoteData.specWidth}m`);
          if (ctx.quoteData.specLength) dims.push(`Length: ${ctx.quoteData.specLength}m`);
          doc.text(`Dimensions: ${dims.join(" × ")}`, margin, y);
          y += 7;
        }

        // Materials table
        if (ctx.quoteData?.materials && Array.isArray(ctx.quoteData.materials) && ctx.quoteData.materials.length > 0) {
          doc.setFontSize(11);
          doc.setFont("helvetica", "bold");
          doc.text("Materials Included:", margin, y);
          y += 7;

          // Table header
          doc.setFontSize(8);
          doc.setFont("helvetica", "bold");
          doc.setFillColor(240, 240, 240);
          doc.rect(margin, y - 3, contentWidth, 5, "F");
          doc.text("Item", margin + 2, y);
          doc.text("Qty", margin + contentWidth * 0.7, y);
          doc.text("Unit", margin + contentWidth * 0.82, y);
          doc.text("Category", margin + contentWidth * 0.9, y);
          y += 6;

          doc.setFont("helvetica", "normal");
          const materials = ctx.quoteData.materials as Array<{ name: string; qty: number; unit: string; tab: string }>;
          for (const item of materials) {
            if (y > 270) {
              doc.setFontSize(8);
              doc.text("... continued on next page", margin + 4, y);
              break;
            }
            doc.text(item.name.substring(0, 55), margin + 2, y);
            doc.text(String(item.qty), margin + contentWidth * 0.7, y);
            doc.text(item.unit, margin + contentWidth * 0.82, y);
            doc.text((item.tab || "").substring(0, 12), margin + contentWidth * 0.9, y);
            y += 4.5;
          }
          y += 4;
        }

        // Spec items
        if (ctx.quoteData?.specItems && Array.isArray(ctx.quoteData.specItems) && ctx.quoteData.specItems.length > 0) {
          if (y > 250) return y; // skip if near page end
          doc.setFontSize(11);
          doc.setFont("helvetica", "bold");
          doc.text("Specification Items:", margin, y);
          y += 7;

          doc.setFontSize(8);
          doc.setFont("helvetica", "normal");
          const specItems = ctx.quoteData.specItems as Array<{ description: string; qty: number; uom: string }>;
          for (const item of specItems) {
            if (y > 270) break;
            doc.text(`• ${item.description} — ${item.qty} ${item.uom}`, margin + 4, y);
            y += 4.5;
          }
        }

        return y;
      },
    });

    return pages;
  },
});

// ─── Eclipse Plugin (Louvre — Unit Configs & Additional Costs) ───────────────

registerAppendixPlugin({
  sectionType: "eclipse",
  name: "Eclipse Louvre Appendix",
  generatePages: (ctx) => {
    const pages: AppendixPage[] = [];

    pages.push({
      title: `${ctx.label} — Unit Configuration`,
      sectionType: ctx.sectionType,
      sectionLabel: ctx.label,
      render: (doc, startY, pageWidth, margin) => {
        let y = startY;
        const contentWidth = pageWidth - margin * 2;

        doc.setFontSize(14);
        doc.setFont("helvetica", "bold");
        doc.text(ctx.label, margin, y);
        y += 8;

        doc.setFontSize(10);
        doc.setFont("helvetica", "normal");
        doc.text(`Works Price (ex GST): $${ctx.worksPrice.toLocaleString("en-AU", { minimumFractionDigits: 2 })}`, margin, y);
        y += 8;

        // Total area
        if (ctx.quoteData?.totalSqm) {
          doc.text(`Total Area: ${ctx.quoteData.totalSqm}m²`, margin, y);
          y += 7;
        }

        // Unit configuration table
        if (ctx.quoteData?.units && Array.isArray(ctx.quoteData.units) && ctx.quoteData.units.length > 0) {
          doc.setFontSize(11);
          doc.setFont("helvetica", "bold");
          doc.text("Unit Configuration:", margin, y);
          y += 7;

          // Table header
          doc.setFontSize(8);
          doc.setFont("helvetica", "bold");
          doc.setFillColor(240, 240, 240);
          doc.rect(margin, y - 3, contentWidth, 5, "F");
          doc.text("Unit", margin + 2, y);
          doc.text("Width (mm)", margin + contentWidth * 0.4, y);
          doc.text("Projection (mm)", margin + contentWidth * 0.6, y);
          doc.text("Colour", margin + contentWidth * 0.82, y);
          y += 6;

          doc.setFont("helvetica", "normal");
          const units = ctx.quoteData.units as Array<{ name: string; width: number; projection: number; colour: string }>;
          for (const unit of units) {
            if (y > 260) break;
            doc.text(unit.name, margin + 2, y);
            doc.text(String(unit.width), margin + contentWidth * 0.4, y);
            doc.text(String(unit.projection), margin + contentWidth * 0.6, y);
            doc.text(unit.colour || "—", margin + contentWidth * 0.82, y);
            y += 5;
          }
          y += 6;
        }

        // Additional costs breakdown
        if (ctx.quoteData?.additionalCosts) {
          const costs = ctx.quoteData.additionalCosts as Record<string, string>;
          const hasCosts = Object.values(costs).some(v => parseFloat(v || "0") > 0);
          if (hasCosts) {
            doc.setFontSize(11);
            doc.setFont("helvetica", "bold");
            doc.text("Additional Costs (per section):", margin, y);
            y += 6;

            doc.setFontSize(9);
            doc.setFont("helvetica", "normal");
            const labels: Record<string, string> = {
              footings: "Footings",
              plumbing: "Plumbing",
              electrical: "Electrical",
              concrete: "Concrete",
            };
            for (const [key, label] of Object.entries(labels)) {
              const val = parseFloat(costs[key] || "0");
              if (val > 0) {
                doc.text(`• ${label}: $${val.toLocaleString("en-AU", { minimumFractionDigits: 2 })}`, margin + 4, y);
                y += 5;
              }
            }
            y += 4;
          }
        }

        // Material lines
        if (ctx.quoteData?.materialLines && Array.isArray(ctx.quoteData.materialLines) && ctx.quoteData.materialLines.length > 0) {
          doc.setFontSize(11);
          doc.setFont("helvetica", "bold");
          doc.text("Materials:", margin, y);
          y += 6;

          doc.setFontSize(8);
          doc.setFont("helvetica", "normal");
          const lines = ctx.quoteData.materialLines as Array<{ description: string; qty: number }>;
          for (const line of lines) {
            if (y > 270) break;
            doc.text(`• ${line.description} × ${line.qty}`, margin + 4, y);
            y += 4.5;
          }
        }

        return y;
      },
    });

    return pages;
  },
});

// ─── Deck Plugin (Board Type, Area, Addons) ─────────────────────────────────

registerAppendixPlugin({
  sectionType: "deck",
  name: "Deck Appendix",
  generatePages: (ctx) => {
    const pages: AppendixPage[] = [];

    pages.push({
      title: `${ctx.label} — Deck Specification`,
      sectionType: ctx.sectionType,
      sectionLabel: ctx.label,
      render: (doc, startY, pageWidth, margin) => {
        let y = startY;

        doc.setFontSize(14);
        doc.setFont("helvetica", "bold");
        doc.text(ctx.label, margin, y);
        y += 8;

        doc.setFontSize(10);
        doc.setFont("helvetica", "normal");
        doc.text(`Works Price (ex GST): $${ctx.worksPrice.toLocaleString("en-AU", { minimumFractionDigits: 2 })}`, margin, y);
        y += 8;

        // Deck specifications
        doc.setFontSize(11);
        doc.setFont("helvetica", "bold");
        doc.text("Deck Specification:", margin, y);
        y += 7;

        doc.setFontSize(9);
        doc.setFont("helvetica", "normal");

        const specs: Array<[string, string | number | null | undefined]> = [
          ["Board Type", ctx.quoteData?.boardType as string | undefined],
          ["Frame Type", ctx.quoteData?.frameType as string | undefined],
          ["Colour", ctx.quoteData?.colour as string | undefined],
          ["Shape", ctx.quoteData?.shape as string | undefined],
          ["Area", ctx.quoteData?.area ? `${ctx.quoteData.area}m²` : null],
          ["Width", ctx.quoteData?.width ? `${ctx.quoteData.width}m` : null],
          ["Projection", ctx.quoteData?.projection ? `${ctx.quoteData.projection}m` : null],
        ];

        for (const [label, value] of specs) {
          if (value) {
            doc.text(`${label}: ${value}`, margin + 4, y);
            y += 5;
          }
        }
        y += 4;

        // Addons
        if (ctx.quoteData?.addons) {
          const addons = ctx.quoteData.addons as Record<string, boolean>;
          const activeAddons = Object.entries(addons)
            .filter(([, v]) => v)
            .map(([k]) => k.charAt(0).toUpperCase() + k.slice(1));

          if (activeAddons.length > 0) {
            doc.setFontSize(11);
            doc.setFont("helvetica", "bold");
            doc.text("Included Add-ons:", margin, y);
            y += 6;

            doc.setFontSize(9);
            doc.setFont("helvetica", "normal");
            for (const addon of activeAddons) {
              doc.text(`✓ ${addon}`, margin + 4, y);
              y += 5;
            }
          }
        }

        return y;
      },
    });

    return pages;
  },
});
