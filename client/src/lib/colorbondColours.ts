// Colorbond colour palette with hex values for rendering
export type ColorbondColour = keyof typeof COLORBOND_HEX;

export const COLORBOND_HEX: Record<string, string> = {
  "Surfmist": "#e8e4df",
  "Classic Cream": "#e8dbb5",
  "Paperbark": "#c5b9a0",
  "Evening Haze": "#c4b8a3",
  "Dune": "#b3a68c",
  "Jasper": "#6b5d4f",
  "Terrain": "#5c4e3e",
  "Cove": "#7a8b8a",
  "Shale Grey": "#b0b3ab",
  "Windspray": "#8a9090",
  "Pale Eucalypt": "#6b7d6b",
  "Wilderness": "#4a5e4a",
  "Cottage Green": "#2d4a3a",
  "Manor Red": "#6b2828",
  "Headland": "#5a3e2e",
  "Ironstone": "#4a3530",
  "Basalt": "#4a4a4a",
  "Woodland Grey": "#4c4c44",
  "Monument": "#3a3a38",
  "Night Sky": "#2a2a2e",
  "Colorbond Matt Basalt": "#4a4a4a",
  "Colorbond Matt Monument": "#3a3a38",
  "Colorbond Matt Surfmist": "#e8e4df",
  "Colorbond Matt Dune": "#b3a68c",
};

export const COLORBOND_COLOURS = Object.keys(COLORBOND_HEX) as ColorbondColour[];

export function getColorbondHex(colour: string): string {
  return COLORBOND_HEX[colour] || "#cccccc";
}
