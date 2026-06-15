/**
 * CSV BOM Export for Deck Subfloor
 *
 * Generates a downloadable CSV containing:
 * - Project metadata (date, option, dimensions)
 * - Bill of Materials (joists, bearers with quantities and costs)
 * - Decking Boards (stock boards, linear metres, waste, picture frame, fascia)
 * - Stair Materials (stringers, treads, risers, handrail, balusters)
 * - Post Schedule (label, bearer, X/Y offsets, height range)
 *
 * Adapted from Decksmith standalone app.
 */

import type { SubfloorInputs, OptionResult } from "./subfloor-calc";
import type { BoardCutPlan } from "./boardCutPlan";
import type { StairBOM } from "./stairCalc";

export interface StairBomCsvData {
  stringerCount: number;
  stringerLengthMm: number;
  treadBoards: number;
  treadCutLength: number;
  riserBoards: number;
  riserCutLength: number;
  handrailLength: number;
  balustradePosts: number;
  landingBoards: number;
  stairWidth?: number;
  treadMaterial?: string;
  stringerMaterial?: string;
  riserStyle?: string;
  handrailStyle?: string;
}

export interface CsvExportOptions {
  inputs: SubfloorInputs;
  option: OptionResult;
  framingSystemLabel?: string;
  quoteNumber?: string;
  clientName?: string;
  siteAddress?: string;
  boardCutPlan?: BoardCutPlan;
  stairBom?: StairBomCsvData;
}

function q(s: string | number): string {
  return `"${String(s).replace(/"/g, '""')}"`;
}

export function generateDeckBomCsv(opts: CsvExportOptions): string {
  const { inputs, option, framingSystemLabel, quoteNumber, clientName, siteAddress, boardCutPlan, stairBom } = opts;
  const date = new Date().toLocaleDateString("en-AU");
  const lines: string[] = [];

  // Header
  lines.push(`"Spanline — Subfloor Spec Sheet"`);
  lines.push(`"Generated",${q(date)}`);
  if (quoteNumber) lines.push(`"Quote",${q(quoteNumber)}`);
  if (clientName) lines.push(`"Client",${q(clientName)}`);
  if (siteAddress) lines.push(`"Site",${q(siteAddress)}`);
  lines.push(`"Option",${q(option.label + " — " + option.profile.label)}`);
  if (framingSystemLabel) lines.push(`"Framing System",${q(framingSystemLabel)}`);
  lines.push(`"Length (mm)",${q(inputs.length)},"Width (mm)",${q(inputs.width)}`);
  lines.push(`"Min height (mm)",${q(inputs.minHeight)},"Max height (mm)",${q(inputs.maxHeight)}`);
  lines.push(`"Wall config",${q(inputs.wall)},"Joist centres (mm)",${q(option.joistCentres)}`);
  lines.push("");

  // Bill of Materials (Framing)
  lines.push('"BILL OF MATERIALS — FRAMING"');
  lines.push('"Item","Qty","Length (mm)","Unit rate ($/m)","Total (AUD)"');

  if (option.sections && option.sections.length > 0) {
    for (const sec of option.sections) {
      lines.push([
        q(`Joist — ${option.profile.label} (${sec.label})`),
        q(sec.joistCount),
        q(sec.joistLength),
        q(option.profile.pricePerMetre.toFixed(2)),
        q(sec.joistsCost.toFixed(2)),
      ].join(","));
      lines.push([
        q(`Bearer — ${option.bearerProfile.label} (${sec.label})`),
        q(sec.bearerCount),
        q(sec.bearerLength),
        q(option.bearerProfile.pricePerMetre.toFixed(2)),
        q(sec.bearersCost.toFixed(2)),
      ].join(","));
    }
  } else {
    lines.push([
      q(`Joist — ${option.profile.label}`),
      q(option.joistCount),
      q(option.joistLength),
      q(option.profile.pricePerMetre.toFixed(2)),
      q(option.joistsCost.toFixed(2)),
    ].join(","));
    lines.push([
      q(`Bearer — ${option.bearerProfile.label}`),
      q(option.bearerCount),
      q(option.bearerLength),
      q(option.bearerProfile.pricePerMetre.toFixed(2)),
      q(option.bearersCost.toFixed(2)),
    ].join(","));
  }

  lines.push([q("TOTAL"), q(""), q(""), q(""), q(option.totalCost.toFixed(2))].join(","));
  lines.push("");

  // Decking Boards
  if (boardCutPlan) {
    lines.push('"DECKING BOARDS"');
    lines.push('"Item","Qty","Length (mm)","Notes"');

    const boardLen = inputs.boardLayout?.boardLength || 5400;
    lines.push([
      q("Deck Boards (stock)"),
      q(boardCutPlan.totalStockBoards),
      q(boardLen),
      q(`${boardCutPlan.totalLinearM.toFixed(1)} LM total, ${(boardCutPlan.wastePercent * 100).toFixed(1)}% waste`),
    ].join(","));

    if (boardCutPlan.pictureFrameBoards > 0) {
      lines.push([
        q("Picture Frame Boards"),
        q(boardCutPlan.pictureFrameBoards),
        q(boardLen),
        q("Border boards"),
      ].join(","));
    }

    if (boardCutPlan.breakerBoardPieces > 0) {
      lines.push([
        q("Breaker Board Pieces"),
        q(boardCutPlan.breakerBoardPieces),
        q("-"),
        q("Cut from stock"),
      ].join(","));
    }

    if (boardCutPlan.fasciaBoardStockBoards > 0) {
      lines.push([
        q("Fascia Boards"),
        q(boardCutPlan.fasciaBoardStockBoards),
        q(boardLen),
        q(`${boardCutPlan.fasciaBoardLinearM.toFixed(1)} LM`),
      ].join(","));
    }

    if (boardCutPlan.infillBoardStockBoards > 0) {
      lines.push([
        q("Infill Boards"),
        q(boardCutPlan.infillBoardStockBoards),
        q(boardLen),
        q(`${boardCutPlan.infillBoardLinearM.toFixed(1)} LM`),
      ].join(","));
    }

    lines.push("");
  }

  // Stair Materials
  if (stairBom && (stairBom.stringerCount > 0 || stairBom.treadBoards > 0)) {
    lines.push('"STAIR MATERIALS"');
    lines.push('"Item","Qty","Length (mm)","Notes"');

    if (stairBom.stringerCount > 0) {
      lines.push([
        q("Stringers"),
        q(stairBom.stringerCount),
        q(stairBom.stringerLengthMm),
        q(stairBom.stringerMaterial || ""),
      ].join(","));
    }

    if (stairBom.treadBoards > 0) {
      lines.push([
        q("Tread Boards"),
        q(stairBom.treadBoards),
        q(stairBom.treadCutLength),
        q(stairBom.treadMaterial || ""),
      ].join(","));
    }

    if (stairBom.riserBoards > 0) {
      lines.push([
        q("Riser Boards"),
        q(stairBom.riserBoards),
        q(stairBom.riserCutLength),
        q(stairBom.riserStyle === "closed" ? "Closed riser" : ""),
      ].join(","));
    }

    if (stairBom.landingBoards > 0) {
      lines.push([
        q("Landing Boards"),
        q(stairBom.landingBoards),
        q("-"),
        q(""),
      ].join(","));
    }

    if (stairBom.handrailLength > 0) {
      lines.push([
        q("Handrail"),
        q(stairBom.handrailStyle === "both-sides" ? 2 : 1),
        q(Math.round(stairBom.handrailLength)),
        q(stairBom.handrailStyle === "both-sides" ? "Both sides" : "One side"),
      ].join(","));
    }

    if (stairBom.balustradePosts > 0) {
      lines.push([
        q("Balustrade Posts"),
        q(stairBom.balustradePosts),
        q("-"),
        q(""),
      ].join(","));
    }

    lines.push("");
  }

  // Post Schedule
  lines.push('"POST SCHEDULE"');
  lines.push('"Post","Bearer","X offset (mm)","Y offset (mm)","Height range (mm)"');

  const allPosts = option.bearerLines.flatMap((bl) => bl.posts);
  for (const post of allPosts) {
    lines.push([
      q(post.label),
      q(post.label.split("-")[0]),
      q(post.x),
      q(post.y),
      q(`${inputs.minHeight}–${inputs.maxHeight}`),
    ].join(","));
  }

  // Multi-section posts
  if (option.sections && option.sections.length > 1) {
    for (const sec of option.sections.slice(1)) {
      for (const bl of sec.bearerLines) {
        for (const post of bl.posts) {
          lines.push([
            q(post.label),
            q(post.label.split("-")[0]),
            q(post.x),
            q(post.y),
            q(`${inputs.minHeight}–${inputs.maxHeight}`),
          ].join(","));
        }
      }
    }
  }

  lines.push("");
  lines.push('"Estimates are indicative only. Confirm spans and pricing with your supplier."');

  return lines.join("\r\n");
}

/** Trigger a CSV download in the browser */
export function downloadCsv(csvContent: string, filename: string): void {
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
