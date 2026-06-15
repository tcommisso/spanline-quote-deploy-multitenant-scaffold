/**
 * Unified type exports
 * Import shared types from this single entry point.
 */

export type * from "../drizzle/schema";
export * from "./_core/errors";

// ─── Component Tab Names ────────────────────────────────────────────────────
export const COMPONENT_TABS = [
  "roof", "channel", "beam", "post", "gable", "cantilever",
  "carport", "glassroom", "screenroom", "lattice", "spacemaker",
  "trades", "extras", "windows", "awnings"
] as const;

export type ComponentTabName = typeof COMPONENT_TABS[number];

export const TAB_LABELS: Record<ComponentTabName, string> = {
  roof: "Roof",
  channel: "Channel",
  beam: "Beam",
  post: "Post",
  gable: "Gable",
  cantilever: "Cantilever",
  carport: "Carport",
  glassroom: "Glassroom",
  screenroom: "Screenroom",
  lattice: "Lattice & Handrails",
  spacemaker: "Spacemaker",
  trades: "Trades",
  extras: "Extras",
  windows: "Windows",
  awnings: "Awnings",
};

// ─── Line Item Shape ────────────────────────────────────────────────────────
export interface LineItem {
  component: string;
  colour: string;
  uom: string;
  qty: number;
  cmQty: number;
  sellRate: number;
  costRate: number;
  factoryY: boolean;
  notes: string;
}

// ─── Quote Status ───────────────────────────────────────────────────────────
export const QUOTE_STATUSES = ["draft", "sent", "accepted", "lost"] as const;
export type QuoteStatus = typeof QUOTE_STATUSES[number];

export const STATUS_LABELS: Record<QuoteStatus, string> = {
  draft: "Draft",
  sent: "Sent",
  accepted: "Accepted",
  lost: "Lost",
};

// ─── Regions ────────────────────────────────────────────────────────────────
export const REGIONS = ["Canberra", "ACT", "South Coast", "Riverina"] as const;
export type Region = typeof REGIONS[number];
