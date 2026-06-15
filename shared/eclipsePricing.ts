// Eclipse Opening Roof System - Pricing Data Defaults & Types
// These are the default prices from the original Excel workbook.
// In the Spanline app, these are stored in the eclipse_pricing DB table
// and can be edited via the admin UI.

import type { PricingData } from "./eclipseCalculations";

export interface LouvrePrice {
  size: number;
  white: number;
  powderCoated: number;
}

export interface EditablePrices {
  louvrePrices: LouvrePrice[];
  trackWhite: number;
  trackPC: number;
  lockAngleWhite: number;
  lockAnglePC: number;
  gutterColour: number;
  gutterStrap: number;
  motorCoverWhite: number;
  motorCoverPC: number;
  beam200_65White: number;
  beam200_65PC: number;
  beam250_65White: number;
  beam250_65PC: number;
  postHalf: number;
  motorAssembly: number;
  controlKitLights: number;
  controlKitNoLights: number;
  pileInsert: number;
  controlPin: number;
  motorPin: number;
  freeEndPin: number;
  remoteHandset: number;
  rainSensorAssembly: number;
  rainSensorChip: number;
  internalBrackets: number;
  postToBeam: number;
  downpipe: number;
  consumables: number;
  electrician: number;
  ledLightPer: number;
  flashings: number;
  freight: number;
  offsetBlockRatePerMetre: number;
  labourPerDay: number;
  defaultDiscount: number;
  commissionRate: number;
  margin: number;
  // Bracket pricing
  fasciaBracketPrice: number;
  extendaBracketPrice: number;
  gableBracketPrice: number;
  bracketCover1to5m: number;
  bracketCover6to10m: number;
  bracketCover11to15m: number;
  bracketCover16to20m: number;
}

export function getDefaultPrices(): EditablePrices {
  return {
    louvrePrices: [
      { size: 2400, white: 139.1, powderCoated: 148.6 },
      { size: 2700, white: 156.5, powderCoated: 167.2 },
      { size: 3000, white: 173.9, powderCoated: 185.8 },
      { size: 3300, white: 191.3, powderCoated: 204.3 },
      { size: 3600, white: 208.7, powderCoated: 222.9 },
      { size: 3900, white: 226.2, powderCoated: 241.5 },
      { size: 4200, white: 243.4, powderCoated: 260.0 },
    ],
    trackWhite: 43.0,
    trackPC: 46.0,
    lockAngleWhite: 87.6,
    lockAnglePC: 106.6,
    gutterColour: 451.4,
    gutterStrap: 11.0,
    motorCoverWhite: 39.0,
    motorCoverPC: 40.0,
    beam200_65White: 603.4,
    beam200_65PC: 683.0,
    beam250_65White: 822.0,
    beam250_65PC: 951.0,
    postHalf: 264.0,
    motorAssembly: 1416.0,
    controlKitLights: 1393.0,
    controlKitNoLights: 1074.0,
    pileInsert: 300.0,
    controlPin: 5.8,
    motorPin: 17.3,
    freeEndPin: 7.3,
    remoteHandset: 200.3,
    rainSensorAssembly: 127.5,
    rainSensorChip: 184.8,
    internalBrackets: 26.7,
    postToBeam: 23.0,
    downpipe: 100.0,
    consumables: 550.0,
    electrician: 700.0,
    ledLightPer: 73.617,
    flashings: 37.0,
    freight: 500.0,
    offsetBlockRatePerMetre: 25.0,
    labourPerDay: 1200.0,
    defaultDiscount: 40,
    commissionRate: 10.0,
    margin: 38.0,
    // Bracket pricing
    fasciaBracketPrice: 45.0,
    extendaBracketPrice: 65.0,
    gableBracketPrice: 55.0,
    bracketCover1to5m: 120.0,
    bracketCover6to10m: 200.0,
    bracketCover11to15m: 280.0,
    bracketCover16to20m: 360.0,
  };
}

// Convert EditablePrices → the PricingData shape used by calculations
export function toPricingData(ep: EditablePrices): PricingData {
  const louvreWhite: Record<number, number> = {};
  const louvrePC: Record<number, number> = {};
  for (const lp of ep.louvrePrices) {
    louvreWhite[lp.size] = lp.white;
    louvrePC[lp.size] = lp.powderCoated;
  }

  return {
    louvreWhite,
    louvrePC,
    trackWhite: ep.trackWhite,
    trackPC: ep.trackPC,
    trackPCPremium: ep.trackWhite > 0 ? (ep.trackPC - ep.trackWhite) / ep.trackWhite : 0.0698,
    lockAngleWhite: ep.lockAngleWhite,
    lockAnglePC: ep.lockAnglePC,
    lockAnglePCPremium: ep.lockAngleWhite > 0 ? (ep.lockAnglePC - ep.lockAngleWhite) / ep.lockAngleWhite : 0.2169,
    gutterColour: ep.gutterColour,
    gutterStrap: ep.gutterStrap,
    motorCoverWhite: ep.motorCoverWhite,
    motorCoverPC: ep.motorCoverPC,
    motorCoverPCPremium: ep.motorCoverWhite > 0 ? (ep.motorCoverPC - ep.motorCoverWhite) / ep.motorCoverWhite : 0.0256,
    beam200_65White: ep.beam200_65White,
    beam200_65PC: ep.beam200_65PC,
    beam200PCPremium: ep.beam200_65White > 0 ? (ep.beam200_65PC - ep.beam200_65White) / ep.beam200_65White : 0.1319,
    beam250_65White: ep.beam250_65White,
    beam250_65PC: ep.beam250_65PC,
    beam250PCPremium: ep.beam250_65White > 0 ? (ep.beam250_65PC - ep.beam250_65White) / ep.beam250_65White : 0.1293,
    postHalf: ep.postHalf,
    postPCPremium: 0.22,
    motorAssembly: ep.motorAssembly,
    controlKitLights: ep.controlKitLights,
    controlKitNoLights: ep.controlKitNoLights,
    pileInsert: ep.pileInsert,
    controlPin: ep.controlPin,
    motorPin: ep.motorPin,
    freeEndPin: ep.freeEndPin,
    remoteHandset: ep.remoteHandset,
    rainSensorAssembly: ep.rainSensorAssembly,
    rainSensorChip: ep.rainSensorChip,
    internalBrackets: ep.internalBrackets,
    postToBeam: ep.postToBeam,
    downpipe: ep.downpipe,
    consumables: ep.consumables,
    electrician: ep.electrician,
    ledLightPer: ep.ledLightPer,
    flashings: ep.flashings,
    freight: ep.freight,
    offsetBlockRatePerMetre: ep.offsetBlockRatePerMetre,
    labourPerDay: ep.labourPerDay,
    defaultDiscount: ep.defaultDiscount,
    // Bracket pricing
    fasciaBracketPrice: ep.fasciaBracketPrice,
    extendaBracketPrice: ep.extendaBracketPrice,
    gableBracketPrice: ep.gableBracketPrice,
    bracketCover1to5m: ep.bracketCover1to5m,
    bracketCover6to10m: ep.bracketCover6to10m,
    bracketCover11to15m: ep.bracketCover11to15m,
    bracketCover16to20m: ep.bracketCover16to20m,
  };
}

// All pricing keys for DB storage (flat key-value pairs)
// Louvre prices are stored as "louvre_white_2400", "louvre_pc_2400", etc.
export function editablePricesToDbRows(ep: EditablePrices): Array<{ key: string; value: number; label: string; category: string }> {
  const rows: Array<{ key: string; value: number; label: string; category: string }> = [];

  // Louvre prices
  for (const lp of ep.louvrePrices) {
    rows.push({ key: `louvre_white_${lp.size}`, value: lp.white, label: `Louvre White ${lp.size}mm`, category: "louvre" });
    rows.push({ key: `louvre_pc_${lp.size}`, value: lp.powderCoated, label: `Louvre PC ${lp.size}mm`, category: "louvre" });
  }

  // Structural
  rows.push({ key: "trackWhite", value: ep.trackWhite, label: "Track 5.5m White", category: "structural" });
  rows.push({ key: "trackPC", value: ep.trackPC, label: "Track 5.5m PC", category: "structural" });
  rows.push({ key: "lockAngleWhite", value: ep.lockAngleWhite, label: "Locking Angle White", category: "structural" });
  rows.push({ key: "lockAnglePC", value: ep.lockAnglePC, label: "Locking Angle PC", category: "structural" });
  rows.push({ key: "gutterColour", value: ep.gutterColour, label: "Gutter 6.0m", category: "structural" });
  rows.push({ key: "gutterStrap", value: ep.gutterStrap, label: "Gutter Strap/Joiner", category: "structural" });
  rows.push({ key: "motorCoverWhite", value: ep.motorCoverWhite, label: "Motor Cover White", category: "structural" });
  rows.push({ key: "motorCoverPC", value: ep.motorCoverPC, label: "Motor Cover PC", category: "structural" });
  rows.push({ key: "beam200_65White", value: ep.beam200_65White, label: "Beam 200x50 White", category: "structural" });
  rows.push({ key: "beam200_65PC", value: ep.beam200_65PC, label: "Beam 200x50 PC", category: "structural" });
  rows.push({ key: "beam250_65White", value: ep.beam250_65White, label: "Beam 250x50 White", category: "structural" });
  rows.push({ key: "beam250_65PC", value: ep.beam250_65PC, label: "Beam 250x50 PC", category: "structural" });
  rows.push({ key: "postHalf", value: ep.postHalf, label: "Post 100x100", category: "structural" });

  // Electrical & Controls
  rows.push({ key: "motorAssembly", value: ep.motorAssembly, label: "Motor Assembly 24VDC", category: "electrical" });
  rows.push({ key: "controlKitLights", value: ep.controlKitLights, label: "Control Kit with Lights", category: "electrical" });
  rows.push({ key: "controlKitNoLights", value: ep.controlKitNoLights, label: "Control Kit no Lights", category: "electrical" });
  rows.push({ key: "remoteHandset", value: ep.remoteHandset, label: "Remote Handset", category: "electrical" });
  rows.push({ key: "rainSensorAssembly", value: ep.rainSensorAssembly, label: "Rain Sensor Assembly", category: "electrical" });
  rows.push({ key: "rainSensorChip", value: ep.rainSensorChip, label: "Rain Sensor Chip", category: "electrical" });
  rows.push({ key: "electrician", value: ep.electrician, label: "Electrician", category: "electrical" });
  rows.push({ key: "ledLightPer", value: ep.ledLightPer, label: "LED Light (each)", category: "electrical" });

  // Hardware
  rows.push({ key: "pileInsert", value: ep.pileInsert, label: "Pile Insert", category: "hardware" });
  rows.push({ key: "controlPin", value: ep.controlPin, label: "Pin - Control Alum", category: "hardware" });
  rows.push({ key: "motorPin", value: ep.motorPin, label: "Pin - Motor End Pivot SS", category: "hardware" });
  rows.push({ key: "freeEndPin", value: ep.freeEndPin, label: "Pin - Free End Alum", category: "hardware" });
  rows.push({ key: "internalBrackets", value: ep.internalBrackets, label: "Internal Brackets", category: "hardware" });
  rows.push({ key: "postToBeam", value: ep.postToBeam, label: "Post to Beam Connector", category: "hardware" });

  // Installation & Delivery
  rows.push({ key: "downpipe", value: ep.downpipe, label: "Downpipes", category: "installation" });
  rows.push({ key: "consumables", value: ep.consumables, label: "Consumables", category: "installation" });
  rows.push({ key: "flashings", value: ep.flashings, label: "Flashings", category: "installation" });
  rows.push({ key: "freight", value: ep.freight, label: "Freight", category: "installation" });
  rows.push({ key: "offsetBlockRatePerMetre", value: ep.offsetBlockRatePerMetre, label: "Offset Block Rate ($/m)", category: "installation" });
  rows.push({ key: "labourPerDay", value: ep.labourPerDay, label: "Labour per Day", category: "installation" });
  rows.push({ key: "defaultDiscount", value: ep.defaultDiscount, label: "Default Discount %", category: "installation" });

  // Margin & Commission
  rows.push({ key: "commissionRate", value: ep.commissionRate, label: "Commission Rate %", category: "margin_commission" });
  rows.push({ key: "margin", value: ep.margin, label: "Margin %", category: "margin_commission" });

  // Bracket Pricing
  rows.push({ key: "fasciaBracketPrice", value: ep.fasciaBracketPrice, label: "Fascia Bracket (each)", category: "brackets" });
  rows.push({ key: "extendaBracketPrice", value: ep.extendaBracketPrice, label: "Extenda Bracket (each)", category: "brackets" });
  rows.push({ key: "gableBracketPrice", value: ep.gableBracketPrice, label: "Gable Bracket (each)", category: "brackets" });
  rows.push({ key: "bracketCover1to5m", value: ep.bracketCover1to5m, label: "Bracket Cover 1-5m", category: "brackets" });
  rows.push({ key: "bracketCover6to10m", value: ep.bracketCover6to10m, label: "Bracket Cover 6-10m", category: "brackets" });
  rows.push({ key: "bracketCover11to15m", value: ep.bracketCover11to15m, label: "Bracket Cover 11-15m", category: "brackets" });
  rows.push({ key: "bracketCover16to20m", value: ep.bracketCover16to20m, label: "Bracket Cover 16-20m", category: "brackets" });

  return rows;
}

// Reconstruct EditablePrices from DB rows
export function dbRowsToEditablePrices(rows: Array<{ key: string; value: string | number }>): EditablePrices {
  const defaults = getDefaultPrices();
  const map = new Map<string, number>();
  for (const row of rows) {
    map.set(row.key, typeof row.value === "string" ? parseFloat(row.value) : row.value);
  }

  // Reconstruct louvre prices
  const louvrePrices: LouvrePrice[] = defaults.louvrePrices.map(lp => ({
    size: lp.size,
    white: map.get(`louvre_white_${lp.size}`) ?? lp.white,
    powderCoated: map.get(`louvre_pc_${lp.size}`) ?? lp.powderCoated,
  }));

  return {
    louvrePrices,
    trackWhite: map.get("trackWhite") ?? defaults.trackWhite,
    trackPC: map.get("trackPC") ?? defaults.trackPC,
    lockAngleWhite: map.get("lockAngleWhite") ?? defaults.lockAngleWhite,
    lockAnglePC: map.get("lockAnglePC") ?? defaults.lockAnglePC,
    gutterColour: map.get("gutterColour") ?? defaults.gutterColour,
    gutterStrap: map.get("gutterStrap") ?? defaults.gutterStrap,
    motorCoverWhite: map.get("motorCoverWhite") ?? defaults.motorCoverWhite,
    motorCoverPC: map.get("motorCoverPC") ?? defaults.motorCoverPC,
    beam200_65White: map.get("beam200_65White") ?? defaults.beam200_65White,
    beam200_65PC: map.get("beam200_65PC") ?? defaults.beam200_65PC,
    beam250_65White: map.get("beam250_65White") ?? defaults.beam250_65White,
    beam250_65PC: map.get("beam250_65PC") ?? defaults.beam250_65PC,
    postHalf: map.get("postHalf") ?? defaults.postHalf,
    motorAssembly: map.get("motorAssembly") ?? defaults.motorAssembly,
    controlKitLights: map.get("controlKitLights") ?? defaults.controlKitLights,
    controlKitNoLights: map.get("controlKitNoLights") ?? defaults.controlKitNoLights,
    pileInsert: map.get("pileInsert") ?? defaults.pileInsert,
    controlPin: map.get("controlPin") ?? defaults.controlPin,
    motorPin: map.get("motorPin") ?? defaults.motorPin,
    freeEndPin: map.get("freeEndPin") ?? defaults.freeEndPin,
    remoteHandset: map.get("remoteHandset") ?? defaults.remoteHandset,
    rainSensorAssembly: map.get("rainSensorAssembly") ?? defaults.rainSensorAssembly,
    rainSensorChip: map.get("rainSensorChip") ?? defaults.rainSensorChip,
    internalBrackets: map.get("internalBrackets") ?? defaults.internalBrackets,
    postToBeam: map.get("postToBeam") ?? defaults.postToBeam,
    downpipe: map.get("downpipe") ?? defaults.downpipe,
    consumables: map.get("consumables") ?? defaults.consumables,
    electrician: map.get("electrician") ?? defaults.electrician,
    ledLightPer: map.get("ledLightPer") ?? defaults.ledLightPer,
    flashings: map.get("flashings") ?? defaults.flashings,
    freight: map.get("freight") ?? defaults.freight,
    offsetBlockRatePerMetre: map.get("offsetBlockRatePerMetre") ?? defaults.offsetBlockRatePerMetre,
    labourPerDay: map.get("labourPerDay") ?? defaults.labourPerDay,
    defaultDiscount: map.get("defaultDiscount") ?? defaults.defaultDiscount,
    commissionRate: map.get("commissionRate") ?? defaults.commissionRate,
    margin: map.get("margin") ?? defaults.margin,
    // Bracket pricing
    fasciaBracketPrice: map.get("fasciaBracketPrice") ?? defaults.fasciaBracketPrice,
    extendaBracketPrice: map.get("extendaBracketPrice") ?? defaults.extendaBracketPrice,
    gableBracketPrice: map.get("gableBracketPrice") ?? defaults.gableBracketPrice,
    bracketCover1to5m: map.get("bracketCover1to5m") ?? defaults.bracketCover1to5m,
    bracketCover6to10m: map.get("bracketCover6to10m") ?? defaults.bracketCover6to10m,
    bracketCover11to15m: map.get("bracketCover11to15m") ?? defaults.bracketCover11to15m,
    bracketCover16to20m: map.get("bracketCover16to20m") ?? defaults.bracketCover16to20m,
  };
}
