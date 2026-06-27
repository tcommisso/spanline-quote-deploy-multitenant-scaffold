/**
 * Spec-to-Items Generation Engine
 * 
 * Evaluates admin-configured spec mappings against a quote's spec sheet fields
 * and generates quote line items with calculated quantities and pricing.
 */

export interface SpecMapping {
  id: number;
  name: string;
  tabName: string;
  specField: string;
  condition: string;
  productId: number | null;
  productMatch: string | null;
  qtyFormula: string;
  description: string | null;
  colourField: string | null;
  bottomColourField: string | null;
  uom: string | null;
  sortOrder: number | null;
  active: boolean | null;
}

export interface SpecValues {
  [key: string]: string | number | boolean | Record<string, any> | any[] | null | undefined;
}

export interface ProductLookup {
  id: number;
  name: string;
  tabName: string;
  subTab?: string | null;
  uom: string;
  baseCost: string;
  materials: string | null;
  installLabour: string | null;
  consumables: string | null;
  fixedSell: string | null;
  powderCoatSurcharge: string | null;
  markupCategory: string | null;
  coverageWidth: number | null;
}

export interface WindowDoorOptionModifier {
  id: number;
  productType: "window" | "door";
  optionGroup: "glass_type" | "tint" | "obscurity" | "etched" | "screen" | "pet_door" | "other";
  optionValue: string;
  adjustmentType: "percent" | "fixed";
  costAdjustmentValue: string | number;
  sellAdjustmentValue: string | number;
  appliesTo?: string | null;
  label?: string | null;
  notes?: string | null;
  sortOrder?: number | null;
  active?: boolean | null;
}

export interface GeneratedItem {
  specMappingId: number;
  productId: number | null;
  tabName: string;
  description: string;
  colour: string;
  bottomColour: string;
  uom: string;
  qty: number;
  costRate: number;
  sellRate: number;
  notes: string | null;
  source: "auto";
}

export interface MarkupRates {
  [category: string]: number; // e.g. { "standard": 2.2, "premium": 2.5 }
}

const FORMULA_FIELD_PATTERN = /\b(spec\w+|width|length|area|roofArea|perimeter|roofRunWidth|roofSheetLength|roofSheetQty|roofSheetLM|wallSheetQty|wallSheetLM|productCover|wasteFactor|workItemQty|workChecklistQty|checklistQty|workItemQuantity)\b/gi;
const WALL_SHEET_COVER_WIDTH_MM = 1140;
const WORK_CHECKLIST_SPEC_FIELDS = new Set([
  "specWallWorkItems",
  "specExistingChecks",
  "specPlumbChecks",
  "specStairsChecks",
  "specConcreteItemChecks",
  "specElecExtraWork",
  "specFloorWorkItems",
  "specDemolitionWorkItems",
]);

function formatTakeoffNumber(value: number): string {
  return value.toFixed(3).replace(/\.?0+$/, "");
}

function normalizeMatchValue(value: unknown): string {
  return String(value ?? "")
    .toLowerCase()
    .replace(/²/g, "2")
    .replace(/³/g, "3")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getProductTabName(value: string) {
  return normalizeMatchValue(value);
}

function productMatchesTargetTab(product: ProductLookup, tabName: string) {
  const target = getProductTabName(tabName);
  return getProductTabName(product.tabName) === target || getProductTabName(product.subTab || "") === target;
}

function formatSpecValueForDescription(value: unknown): string {
  if (value == null || Array.isArray(value) || typeof value === "object") return "";
  const text = String(value).trim();
  return text && text.toLowerCase() !== "none" ? text : "";
}

function splitOptionValues(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .flatMap(item => splitOptionValues(item))
      .filter(Boolean);
  }
  return String(value ?? "")
    .split(",")
    .map(part => part.trim())
    .filter(part => part && part.toLowerCase() !== "none" && part.toLowerCase() !== "n/a");
}

function findProductBySpecMatch(
  products: ProductLookup[],
  tabName: string,
  matchValue: unknown
): ProductLookup | null {
  const normalizedMatch = normalizeMatchValue(matchValue);
  if (!normalizedMatch) return null;

  const candidates = products.filter(p => productMatchesTargetTab(p, tabName));
  const exact = candidates.find(p => normalizeMatchValue(p.name) === normalizedMatch);
  if (exact) return exact;

  const containing = candidates.find(p => {
    const name = normalizeMatchValue(p.name);
    return name.includes(normalizedMatch) || normalizedMatch.includes(name);
  });
  if (containing) return containing;

  const tokens = normalizedMatch.split(" ").filter(token => token.length > 1);
  if (tokens.length === 0) return null;
  return candidates.find(p => {
    const name = normalizeMatchValue(p.name);
    const nameTokens = new Set(name.split(" ").filter(Boolean));
    return tokens.every(token => nameTokens.has(token) || name.includes(token));
  }) || null;
}

function isLinearMetreUom(value: string | null | undefined): boolean {
  return /^(lm|l\/m|linear metres?|linear meters?|metres?|meters?|m)$/i.test(String(value || "").trim());
}

interface BeamEntryGroup {
  type: string;
  size: string;
  qty: number;
}

function parseSpecArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string") return [];

  const trimmed = value.trim();
  if (!trimmed) return [];

  try {
    const parsed = JSON.parse(trimmed);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function readString(record: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = record[key];
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return String(value).trim();
    }
  }
  return "";
}

function readNumber(record: Record<string, unknown>, keys: string[], fallback = 0): number {
  for (const key of keys) {
    const value = record[key];
    const numeric = typeof value === "number" ? value : parseFloat(String(value ?? ""));
    if (Number.isFinite(numeric) && numeric > 0) return numeric;
  }
  return fallback;
}

function isWorkChecklistSpecField(field: string): boolean {
  return WORK_CHECKLIST_SPEC_FIELDS.has(field);
}

function workChecklistRows(value: unknown): Record<string, unknown>[] {
  return parseSpecArray(value)
    .filter(entry => entry && typeof entry === "object" && !Array.isArray(entry)) as Record<string, unknown>[];
}

function workChecklistLabel(row: Record<string, unknown>): string {
  return readString(row, ["item", "task", "label", "name", "description"]);
}

function workChecklistProductMatch(row: Record<string, unknown>, label: string): string {
  return label || readString(row, ["productMatch", "product", "productName", "catalogueProduct", "match"]);
}

function workChecklistUnit(row: Record<string, unknown>, fallback: string | null | undefined): string {
  return readString(row, ["unit", "uom", "measureUnit"]) || fallback || "ea";
}

function workChecklistQty(row: Record<string, unknown>): number {
  const qty = readPositiveNumber(row, ["qty", "quantity", "workItemQty", "count", "amount"]);
  return qty > 0 ? qty : 1;
}

function shouldCostWorkChecklistRow(row: Record<string, unknown>): boolean {
  if (row.checked !== true) return false;
  const responsibility = readString(row, ["responsibility"]).toLowerCase();
  return responsibility !== "by client" && responsibility !== "client";
}

function numberTokens(value: unknown): number[] {
  return String(value ?? "")
    .match(/\d+(?:\.\d+)?/g)
    ?.map(token => Number(token))
    .filter(Number.isFinite) || [];
}

function hasApproxNumber(tokens: number[], target: number): boolean {
  return tokens.some(token => Math.abs(token - target) < 0.01);
}

function readBeamLm(record: Record<string, unknown>): number {
  const raw = record.lm
    ?? record.linealMetres
    ?? record.linealMeters
    ?? record.linearMetres
    ?? record.linearMeters
    ?? record.length
    ?? record.qty;
  const value = typeof raw === "number"
    ? raw
    : Number.parseFloat(String(raw ?? "").replace(/,/g, ""));
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function normalizeBeamSizeKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/(\d)\s*[x×]\s*(\d)/gi, "$1x$2")
    .replace(/\s+/g, " ")
    .trim();
}

function formatBeamSizeForMatch(value: string): string {
  return value
    .replace(/(\d)\s*[x×]\s*(\d)/gi, "$1 x $2")
    .replace(/\s+/g, " ")
    .trim();
}

function groupBeamEntries(value: unknown): BeamEntryGroup[] {
  const groups = new Map<string, BeamEntryGroup>();

  for (const entry of parseSpecArray(value)) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;

    const record = entry as Record<string, unknown>;
    const size = readString(record, ["size", "beamSize", "profile"]);
    if (!size) continue;

    const qty = readBeamLm(record);
    if (qty <= 0) continue;

    const type = readString(record, ["type", "material", "beamType"]) || "Beam";
    const key = `${normalizeMatchValue(type)}|${normalizeBeamSizeKey(size)}`;
    const existing = groups.get(key);
    if (existing) {
      existing.qty += qty;
    } else {
      groups.set(key, { type, size: formatBeamSizeForMatch(size), qty });
    }
  }

  return Array.from(groups.values()).filter(group => group.qty > 0);
}

function beamGroupLabel(group: BeamEntryGroup): string {
  return [group.type, group.size].filter(Boolean).join(" ").trim();
}

function readPositiveNumber(record: Record<string, unknown>, keys: string[], fallback: number = 0): number {
  for (const key of keys) {
    const raw = record[key];
    if (raw === undefined || raw === null || raw === "") continue;
    const value = typeof raw === "number"
      ? raw
      : Number.parseFloat(String(raw).replace(/,/g, ""));
    if (Number.isFinite(value) && value > 0) return value;
  }
  return fallback;
}

function firstWallEntryType(value: unknown): string {
  for (const entry of parseSpecArray(value)) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const type = readString(entry as Record<string, unknown>, ["type", "iwpType", "wallType", "product", "productName"]);
    if (type) return type;
  }
  return "";
}

function resolveProductMatchValue(mapping: SpecMapping, specValues: SpecValues, fieldValue: unknown) {
  if (!mapping.productMatch) return fieldValue || "";
  const directValue = specValues[mapping.productMatch];
  if (directValue !== undefined && directValue !== null && String(directValue).trim() !== "") {
    return directValue;
  }
  if (mapping.specField === "specIwpEntries") {
    return firstWallEntryType(fieldValue);
  }
  return fieldValue || "";
}

function mappingFallbackDescription(
  mapping: SpecMapping,
  product: ProductLookup | null,
  matchValue: unknown
): string {
  if (mapping.description) return mapping.description;
  if (product) return product.name;
  const selected = formatSpecValueForDescription(matchValue);
  return selected || mapping.name;
}

interface WallEntryTakeoff {
  product: ProductLookup | null;
  type: string;
  colour: string;
  bottomColour: string;
  widthMm: number;
  heightMm: number;
  coverWidthMm: number;
  sheetQty: number;
  lm: number;
}

function calculateWallEntryTakeoffs(
  value: unknown,
  products: ProductLookup[],
  mapping: SpecMapping
): WallEntryTakeoff[] {
  const takeoffs: WallEntryTakeoff[] = [];

  for (const entry of parseSpecArray(value)) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const record = entry as Record<string, unknown>;
    const widthMm = readPositiveNumber(record, ["width", "wallWidth", "widthMm", "widthMM"]);
    const heightMm = readPositiveNumber(record, ["height", "wallHeight", "heightMm", "heightMM"]);
    if (widthMm <= 0 || heightMm <= 0) continue;

    const type = readString(record, ["type", "iwpType", "wallType", "product", "productName"]) || "Wall panel";
    const product = findProductBySpecMatch(products, mapping.tabName, type)
      || (mapping.productId ? products.find(p => p.id === mapping.productId) || null : null);
    const coverWidthMm = product?.coverageWidth && product.coverageWidth > 0
      ? product.coverageWidth
      : WALL_SHEET_COVER_WIDTH_MM;
    const sheetQty = Math.ceil(widthMm / coverWidthMm);
    const lm = sheetQty * (heightMm / 1000);
    takeoffs.push({
      product,
      type,
      colour: readString(record, ["outsideColour", "colour", "wallColour"]),
      bottomColour: readString(record, ["insideColour", "bottomColour"]),
      widthMm,
      heightMm,
      coverWidthMm,
      sheetQty,
      lm,
    });
  }

  return takeoffs;
}

function groupWallEntryTakeoffs(takeoffs: WallEntryTakeoff[]) {
  const groups = new Map<string, WallEntryTakeoff & { details: string[] }>();

  for (const takeoff of takeoffs) {
    const description = takeoff.product?.name || takeoff.type;
    const key = [
      takeoff.product?.id || normalizeMatchValue(takeoff.type),
      normalizeMatchValue(takeoff.colour),
      normalizeMatchValue(takeoff.bottomColour),
    ].join("|");
    const detail = `${description}: ${takeoff.widthMm}x${takeoff.heightMm}mm / ${takeoff.coverWidthMm}mm cover = ${takeoff.sheetQty} sheet${takeoff.sheetQty === 1 ? "" : "s"} x ${formatTakeoffNumber(takeoff.heightMm / 1000)}m = ${formatTakeoffNumber(takeoff.lm)} LM`;
    const existing = groups.get(key);
    if (existing) {
      existing.sheetQty += takeoff.sheetQty;
      existing.lm += takeoff.lm;
      existing.details.push(detail);
    } else {
      groups.set(key, { ...takeoff, details: [detail] });
    }
  }

  return Array.from(groups.values()).filter(group => group.lm > 0);
}

function findProductForBeamGroup(
  products: ProductLookup[],
  mapping: SpecMapping,
  group: BeamEntryGroup
): ProductLookup | null {
  const compactSize = group.size.replace(/\s+/g, "");
  const label = beamGroupLabel(group);
  const matchValues = Array.from(new Set([
    label,
    `${group.size} ${group.type}`.trim(),
    `${group.type} ${compactSize}`.trim(),
    `${compactSize} ${group.type}`.trim(),
    group.size,
    compactSize,
  ].filter(Boolean)));

  for (const matchValue of matchValues) {
    const product = findProductBySpecMatch(products, mapping.tabName, matchValue);
    if (product) return product;
  }

  return mapping.productId
    ? products.find(p => p.id === mapping.productId) || null
    : null;
}

function getNumericSpecValue(specValues: SpecValues, key: string): number | null {
  const direct = specValues[key];
  if (direct !== undefined && direct !== null && direct !== "") {
    return parseFloat(String(direct)) || 0;
  }

  const lowerKey = key.toLowerCase();
  const matchingKey = Object.keys(specValues).find((specKey) => specKey.toLowerCase() === lowerKey);
  if (matchingKey) {
    const value = specValues[matchingKey];
    if (value !== undefined && value !== null && value !== "") {
      return parseFloat(String(value)) || 0;
    }
  }

  return null;
}

/**
 * Evaluate a condition expression against a spec field value.
 * Supports: "> 0", ">= 1", "!= ''", "= value", "!= value", "contains value", "any" (always true)
 */
export function evaluateCondition(fieldValue: unknown, condition: string): boolean {
  if (!condition || condition.trim().toLowerCase() === "any") return true;
  
  const val = fieldValue ?? "";
  const strVal = Array.isArray(val)
    ? (val.length > 0 ? JSON.stringify(val) : "")
    : (typeof val === "object" && val !== null ? JSON.stringify(val) : String(val)).trim();
  const numVal = parseFloat(strVal);
  const cond = condition.trim();

  // Numeric comparisons
  if (cond.startsWith(">=")) {
    const threshold = parseFloat(cond.slice(2).trim());
    return !isNaN(numVal) && numVal >= threshold;
  }
  if (cond.startsWith(">")) {
    const threshold = parseFloat(cond.slice(1).trim());
    return !isNaN(numVal) && numVal > threshold;
  }
  if (cond.startsWith("<=")) {
    const threshold = parseFloat(cond.slice(2).trim());
    return !isNaN(numVal) && numVal <= threshold;
  }
  if (cond.startsWith("<")) {
    const threshold = parseFloat(cond.slice(1).trim());
    return !isNaN(numVal) && numVal < threshold;
  }

  // Not-empty check
  if (cond === "!= ''" || cond === '!= ""' || cond === "notEmpty") {
    return strVal !== "";
  }

  // Equality / inequality
  if (cond.startsWith("!=")) {
    const target = cond.slice(2).trim().replace(/^['"]|['"]$/g, "");
    return strVal.toLowerCase() !== target.toLowerCase();
  }
  if (cond.startsWith("=")) {
    const target = cond.slice(1).trim().replace(/^['"]|['"]$/g, "");
    return strVal.toLowerCase() === target.toLowerCase();
  }

  // Contains
  if (cond.toLowerCase().startsWith("contains ")) {
    const target = cond.slice(9).trim().replace(/^['"]|['"]$/g, "");
    return strVal.toLowerCase().includes(target.toLowerCase());
  }

  return false;
}

/**
 * Evaluate a quantity formula expression against spec values.
 * Supports: field references, arithmetic (+, -, *, /), constants, Math.ceil/floor/round.
 * Examples:
 *   "specPostsNumber" → value of that field
 *   "specWidth * specLength / 0.762" → calculated area / coverage
 *   "Math.ceil(specWidth * specLength / 5.4)" → rounded up
 *   "2" → constant
 */
export function evaluateFormula(formula: string, specValues: SpecValues): number {
  if (!formula || !formula.trim()) return 0;

  let expr = formula.trim();

  // Replace spec field references with their numeric values
  // Match field names that start with "spec" or common computed variables
  expr = expr.replace(FORMULA_FIELD_PATTERN, (match) => {
    const key = match;
    const directValue = getNumericSpecValue(specValues, key);
    if (directValue !== null) {
      return String(directValue);
    }
    // Try with "spec" prefix if not already prefixed
    if (!key.toLowerCase().startsWith("spec")) {
      const prefixed = "spec" + key.charAt(0).toUpperCase() + key.slice(1);
      const prefixedValue = getNumericSpecValue(specValues, prefixed);
      if (prefixedValue !== null) {
        return String(prefixedValue);
      }
    }
    return "0";
  });

  // Safely evaluate the mathematical expression
  try {
    // Only allow safe characters: digits, operators, parentheses, dots, Math functions
    const safeExpr = expr.replace(/Math\.(ceil|floor|round|max|min|abs)/g, "Math.$1");
    if (!/^[\d\s+\-*/().Math,ceilflooroundmaxinabs]+$/.test(safeExpr.replace(/Math\.\w+/g, ""))) {
      // Fallback: try to parse as a simple number
      const num = parseFloat(expr);
      return isNaN(num) ? 0 : num;
    }
    // eslint-disable-next-line no-eval
    const result = new Function("Math", `return ${safeExpr}`)(Math);
    return typeof result === "number" && !isNaN(result) ? Math.max(0, result) : 0;
  } catch {
    // Fallback: try to parse as a simple number
    const num = parseFloat(expr);
    return isNaN(num) ? 0 : num;
  }
}

/**
 * Calculate cost and sell rates for a product.
 */
export function calculateRates(
  product: ProductLookup | null,
  markupRates: MarkupRates,
  defaultMarkup: number = 2.2
): { costRate: number; sellRate: number } {
  if (!product) return { costRate: 0, sellRate: 0 };

  // Cost Amount = sum of breakdown fields (Materials + Install + Consumables)
  const materials = parseFloat(product.materials || "0") || 0;
  const installLabour = parseFloat(product.installLabour || "0") || 0;
  const consumables = parseFloat(product.consumables || "0") || 0;
  const breakdownCost = materials + installLabour + consumables;
  const baseCost = parseFloat(product.baseCost || "0") || 0;
  const costRate = breakdownCost > 0 ? breakdownCost : baseCost;

  // If product has a fixed sell price, use it
  if (product.fixedSell && parseFloat(product.fixedSell) > 0) {
    return { costRate, sellRate: parseFloat(product.fixedSell) };
  }

  // Otherwise apply markup
  const markup = product.markupCategory
    ? (markupRates[product.markupCategory] || defaultMarkup)
    : defaultMarkup;

  return { costRate, sellRate: costRate * markup };
}

type WindowDoorOptionSelection = {
  group: WindowDoorOptionModifier["optionGroup"];
  value: string;
  sourceField: string;
};

function optionGroupLabel(group: WindowDoorOptionModifier["optionGroup"]): string {
  return {
    glass_type: "Glass type",
    tint: "Tint",
    obscurity: "Obscurity",
    etched: "Etched glass",
    screen: "Screen",
    pet_door: "Pet door",
    other: "Option",
  }[group];
}

function getWindowDoorOptionSelections(
  productType: "window" | "door",
  specValues: SpecValues,
  entry?: Record<string, unknown>
): WindowDoorOptionSelection[] {
  const selections: WindowDoorOptionSelection[] = [];
  const addSelections = (group: WindowDoorOptionModifier["optionGroup"], sourceField: string) => {
    for (const value of splitOptionValues(specValues[sourceField])) {
      selections.push({ group, value, sourceField });
    }
  };
  const addEntryScreen = (sourceField: string) => {
    if (!entry) return;
    const screen = readString(entry, ["screen", "screenType"]);
    if (screen) selections.push({ group: "screen", value: screen, sourceField });
  };

  if (productType === "window") {
    addSelections("glass_type", "specWindowGlassType");
    addSelections("tint", "specWindowsTint");
    if (entry) {
      addEntryScreen("specWindowEntries.screen");
    } else {
      for (const windowEntry of parseSpecArray(specValues.specWindowEntries)) {
        if (!windowEntry || typeof windowEntry !== "object" || Array.isArray(windowEntry)) continue;
        const screen = readString(windowEntry as Record<string, unknown>, ["screen", "screenType"]);
        if (screen) selections.push({ group: "screen", value: screen, sourceField: "specWindowEntries.screen" });
      }
    }
  } else {
    addSelections("glass_type", "specDoorGlassType");
    addSelections("tint", "specDoorsTint");
    if (entry) {
      addEntryScreen("specDoorEntries.screen");
    } else {
      for (const doorEntry of parseSpecArray(specValues.specDoorEntries)) {
        if (!doorEntry || typeof doorEntry !== "object" || Array.isArray(doorEntry)) continue;
        const screen = readString(doorEntry as Record<string, unknown>, ["screen", "screenType"]);
        if (screen) selections.push({ group: "screen", value: screen, sourceField: "specDoorEntries.screen" });
      }
    }
  }

  addSelections("tint", "specGlassTint");
  addSelections("obscurity", "specGlassObscurity");
  addSelections("etched", "specGlassEtched");
  addSelections("pet_door", "specGlassPetDoor");

  const seen = new Set<string>();
  return selections.filter((selection) => {
    const key = `${selection.group}|${normalizeMatchValue(selection.value)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function findWindowDoorOptionModifiers(
  optionModifiers: WindowDoorOptionModifier[],
  productType: "window" | "door",
  selection: WindowDoorOptionSelection
): WindowDoorOptionModifier[] {
  const selectedValue = normalizeMatchValue(selection.value);
  if (!selectedValue) return [];
  return optionModifiers
    .filter(modifier => modifier.active !== false)
    .filter(modifier => modifier.productType === productType)
    .filter(modifier => modifier.optionGroup === selection.group)
    .filter((modifier) => {
      const modifierValue = normalizeMatchValue(modifier.optionValue);
      return modifierValue === selectedValue || modifierValue.includes(selectedValue) || selectedValue.includes(modifierValue);
    })
    .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
}

function buildWindowDoorModifierItems(
  mapping: SpecMapping,
  baseItem: GeneratedItem,
  specValues: SpecValues,
  optionModifiers: WindowDoorOptionModifier[],
  entry?: Record<string, unknown>
): GeneratedItem[] {
  const productType = getProductTabName(mapping.tabName).includes("door") ? "door" : getProductTabName(mapping.tabName).includes("window") ? "window" : null;
  if (!productType) return [];

  const baseQty = Number(baseItem.qty || 0);
  const baseCostTotal = baseQty * Number(baseItem.costRate || 0);
  const baseSellTotal = baseQty * Number(baseItem.sellRate || 0);
  if (baseQty <= 0 || (baseCostTotal <= 0 && baseSellTotal <= 0)) return [];

  const items: GeneratedItem[] = [];
  for (const selection of getWindowDoorOptionSelections(productType, specValues, entry)) {
    for (const modifier of findWindowDoorOptionModifiers(optionModifiers, productType, selection)) {
      const costAdjustmentValue = Number(modifier.costAdjustmentValue || 0);
      const sellAdjustmentValue = Number(modifier.sellAdjustmentValue || 0);
      if (costAdjustmentValue === 0 && sellAdjustmentValue === 0) continue;

      const isPercent = modifier.adjustmentType === "percent";
      const qty = isPercent ? 1 : baseQty;
      const costRate = isPercent ? baseCostTotal * (costAdjustmentValue / 100) : costAdjustmentValue;
      const sellRate = isPercent ? baseSellTotal * (sellAdjustmentValue / 100) : sellAdjustmentValue;
      const adjustmentLabel = modifier.label || `${optionGroupLabel(selection.group)}: ${selection.value}`;
      const notes = [
        `${optionGroupLabel(selection.group)} modifier from ${selection.sourceField}`,
        isPercent
          ? `cost ${formatTakeoffNumber(costAdjustmentValue)}%, sell ${formatTakeoffNumber(sellAdjustmentValue)}% of base ${productType} line`
          : `fixed cost $${formatTakeoffNumber(costAdjustmentValue)}, sell $${formatTakeoffNumber(sellAdjustmentValue)} per ${productType}`,
        modifier.notes || "",
      ].filter(Boolean).join("; ");

      items.push({
        specMappingId: mapping.id,
        productId: null,
        tabName: mapping.tabName,
        description: `${baseItem.description} - ${adjustmentLabel}`,
        colour: baseItem.colour,
        bottomColour: baseItem.bottomColour,
        uom: isPercent ? "adj" : baseItem.uom,
        qty: Math.round(qty * 1000) / 1000,
        costRate: Math.round(costRate * 100) / 100,
        sellRate: Math.round(sellRate * 100) / 100,
        notes,
        source: "auto",
      });
    }
  }

  return items;
}

function getWindowDoorScheduleProductType(mapping: SpecMapping): "window" | "door" | null {
  const tabName = getProductTabName(mapping.tabName);
  if (mapping.specField === "specWindowEntries" && tabName.includes("window")) return "window";
  if (mapping.specField === "specDoorEntries" && tabName.includes("door")) return "door";
  return null;
}

function windowDoorEntryLabel(productType: "window" | "door", entry: Record<string, unknown>): string {
  const style = readString(entry, ["style", "type"]) || (productType === "window" ? "Window" : "Door");
  const width = readNumber(entry, ["width", "widthMm", "w"]);
  const height = readNumber(entry, ["height", "heightMm", "h"]);
  const panels = readNumber(entry, ["panels", "panelCount"]);
  const panelText = productType === "door" && panels > 0 ? ` ${formatTakeoffNumber(panels)} panel` : "";
  const dimensionText = width > 0 && height > 0 ? ` ${formatTakeoffNumber(width)}x${formatTakeoffNumber(height)}mm` : "";
  return `${style}${panelText} ${productType}${dimensionText}`.replace(/\s+/g, " ").trim();
}

function findProductForWindowDoorEntry(
  products: ProductLookup[],
  mapping: SpecMapping,
  productType: "window" | "door",
  entry: Record<string, unknown>,
  fallbackMatchValue: unknown
): ProductLookup | null {
  const candidates = products.filter(product => productMatchesTargetTab(product, mapping.tabName));
  const style = normalizeMatchValue(readString(entry, ["style", "type"]));
  const width = readNumber(entry, ["width", "widthMm", "w"]);
  const height = readNumber(entry, ["height", "heightMm", "h"]);
  const panels = readNumber(entry, ["panels", "panelCount"]);
  const entryLabel = normalizeMatchValue(windowDoorEntryLabel(productType, entry));

  const withDimensions = candidates.filter((product) => {
    const numbers = numberTokens(product.name);
    return (!width || hasApproxNumber(numbers, width)) && (!height || hasApproxNumber(numbers, height));
  });

  const styleAndDimensions = withDimensions.find((product) => {
    const name = normalizeMatchValue(product.name);
    const panelMatch = panels <= 0 || name.includes(String(panels)) || numberTokens(product.name).some(value => value === panels);
    return (!style || name.includes(style)) && panelMatch;
  });
  if (styleAndDimensions) return styleAndDimensions;

  const exactLabel = candidates.find(product => normalizeMatchValue(product.name) === entryLabel);
  if (exactLabel) return exactLabel;

  const dimensionOnly = withDimensions[0];
  if (dimensionOnly) return dimensionOnly;

  const styleOnly = candidates.find((product) => {
    const name = normalizeMatchValue(product.name);
    return style && name.includes(style) && name.includes(productType);
  });
  if (styleOnly) return styleOnly;

  return findProductBySpecMatch(products, mapping.tabName, fallbackMatchValue || readString(entry, ["style", "type"]));
}

function buildWindowDoorScheduleItems(
  mapping: SpecMapping,
  specValues: SpecValues,
  fieldValue: unknown,
  products: ProductLookup[],
  markupRates: MarkupRates,
  defaultMarkup: number,
  optionModifiers: WindowDoorOptionModifier[]
): GeneratedItem[] | null {
  const productType = getWindowDoorScheduleProductType(mapping);
  if (!productType) return null;

  const fallbackMatchValue = resolveProductMatchValue(mapping, specValues, fieldValue);
  const colour = mapping.colourField ? String(specValues[mapping.colourField] || "") : "";
  const bottomColour = mapping.bottomColourField ? String(specValues[mapping.bottomColourField] || "") : "";
  const entries = parseSpecArray(fieldValue)
    .filter(entry => entry && typeof entry === "object" && !Array.isArray(entry)) as Record<string, unknown>[];

  const items: GeneratedItem[] = [];
  for (const entry of entries) {
    const qty = readNumber(entry, ["qty", "quantity"], 1);
    if (qty <= 0) continue;

    const product = findProductForWindowDoorEntry(products, mapping, productType, entry, fallbackMatchValue);
    const { costRate, sellRate } = calculateRates(product, markupRates, defaultMarkup);
    const resolvedUom = mapping.uom || product?.uom || "ea";
    const label = windowDoorEntryLabel(productType, entry);
    const description = product
      ? `${product.name} - ${label}`
      : (mapping.description ? `${mapping.description} - ${label}` : label);
    const screen = readString(entry, ["screen", "screenType"]);
    const notes = [
      `${productType === "window" ? "Window" : "Door"} schedule takeoff: ${formatTakeoffNumber(qty)} x ${label}`,
      screen && screen.toLowerCase() !== "n/a" ? `screen: ${screen}` : "",
      product ? `matched product: ${product.name}` : "no matching product found",
    ].filter(Boolean).join("; ");

    const baseItem: GeneratedItem = {
      specMappingId: mapping.id,
      productId: product?.id || null,
      tabName: mapping.tabName,
      description,
      colour,
      bottomColour,
      uom: resolvedUom,
      qty: Math.round(qty * 1000) / 1000,
      costRate,
      sellRate,
      notes,
      source: "auto",
    };

    items.push(baseItem);
    items.push(...buildWindowDoorModifierItems(mapping, baseItem, specValues, optionModifiers, entry));
  }

  return items;
}

function buildWorkChecklistItems(
  mapping: SpecMapping,
  specValues: SpecValues,
  fieldValue: unknown,
  products: ProductLookup[],
  markupRates: MarkupRates,
  defaultMarkup: number
): GeneratedItem[] | null {
  if (!isWorkChecklistSpecField(mapping.specField)) return null;

  const items: GeneratedItem[] = [];
  for (const row of workChecklistRows(fieldValue)) {
    if (!shouldCostWorkChecklistRow(row)) continue;

    const label = workChecklistLabel(row);
    const productMatchValue = workChecklistProductMatch(row, label);
    const rowQty = workChecklistQty(row);
    const rowUnit = workChecklistUnit(row, mapping.uom);
    const rowSpecValues: SpecValues = {
      ...specValues,
      workItemQty: rowQty,
      workChecklistQty: rowQty,
      checklistQty: rowQty,
      workItemQuantity: rowQty,
      workItemProduct: productMatchValue,
      workItemLabel: label,
      workItemNotes: readString(row, ["notes", "note"]),
      workItemUnit: rowUnit,
    };

    const product = mapping.productId
      ? products.find(p => p.id === mapping.productId) || null
      : findProductBySpecMatch(products, mapping.tabName, mapping.productMatch ? rowSpecValues[mapping.productMatch] : productMatchValue);
    const qty = evaluateFormula(mapping.qtyFormula || "workItemQty", rowSpecValues);
    if (qty <= 0) continue;

    const { costRate, sellRate } = calculateRates(product, markupRates, defaultMarkup);
    const description = mapping.description
      ? `${mapping.description} - ${label || productMatchValue || mapping.name}`.trim()
      : (product?.name || label || mapping.name);
    const colour = mapping.colourField ? String(specValues[mapping.colourField] || "") : "";
    const bottomColour = mapping.bottomColourField ? String(specValues[mapping.bottomColourField] || "") : "";
    const notes = [
      `Work checklist takeoff: ${label || mapping.name}`,
      `qty ${formatTakeoffNumber(rowQty)} ${rowUnit}`,
      product ? `matched product: ${product.name}` : `product match: ${productMatchValue || "none"}`,
      rowSpecValues.workItemNotes ? `notes: ${rowSpecValues.workItemNotes}` : "",
    ].filter(Boolean).join("; ");

    items.push({
      specMappingId: mapping.id,
      productId: product?.id || null,
      tabName: mapping.tabName,
      description,
      colour,
      bottomColour,
      uom: rowUnit,
      qty: Math.round(qty * 1000) / 1000,
      costRate,
      sellRate,
      notes,
      source: "auto",
    });
  }

  return items;
}

/**
 * Main generation function: evaluates all active mappings against spec values
 * and produces quote line items.
 */
export function generateItemsFromSpec(
  mappings: SpecMapping[],
  specValues: SpecValues,
  products: ProductLookup[],
  markupRates: MarkupRates,
  defaultMarkup: number = 2.2,
  optionModifiers: WindowDoorOptionModifier[] = []
): GeneratedItem[] {
  const items: GeneratedItem[] = [];

  const activeMappings = mappings
    .filter(m => m.active !== false)
    .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));

  for (const mapping of activeMappings) {
    // Get the spec field value
    const fieldValue = specValues[mapping.specField];

    // Evaluate condition
    if (!evaluateCondition(fieldValue, mapping.condition)) {
      continue; // Condition not met, skip this mapping
    }

    const windowDoorScheduleItems = buildWindowDoorScheduleItems(
      mapping,
      specValues,
      fieldValue,
      products,
      markupRates,
      defaultMarkup,
      optionModifiers,
    );
    if (windowDoorScheduleItems) {
      items.push(...windowDoorScheduleItems);
      continue;
    }

    const workChecklistItems = buildWorkChecklistItems(
      mapping,
      specValues,
      fieldValue,
      products,
      markupRates,
      defaultMarkup,
    );
    if (workChecklistItems) {
      items.push(...workChecklistItems);
      continue;
    }

    if (mapping.specField === "specBeamEntries") {
      for (const group of groupBeamEntries(fieldValue)) {
        const product = findProductForBeamGroup(products, mapping, group);
        const { costRate, sellRate } = calculateRates(product, markupRates, defaultMarkup);
        const resolvedUom = mapping.uom || product?.uom || "LM";
        const roundedQty = Math.round(group.qty * 1000) / 1000;
        const label = beamGroupLabel(group);
        const colour = mapping.colourField
          ? String(specValues[mapping.colourField] || "")
          : "";
        const bottomColour = mapping.bottomColourField
          ? String(specValues[mapping.bottomColourField] || "")
          : "";
        const description = mapping.description
          ? `${mapping.description} - ${label}`
          : (product ? product.name : `${mapping.name} - ${label}`);

        items.push({
          specMappingId: mapping.id,
          productId: product?.id || null,
          tabName: mapping.tabName,
          description,
          colour,
          bottomColour,
          uom: resolvedUom,
          qty: roundedQty,
          costRate,
          sellRate,
          notes: `Beam entries takeoff: ${label} = ${formatTakeoffNumber(roundedQty)} LM`,
          source: "auto",
        });
      }
      continue;
    }

    if (mapping.specField === "specIwpEntries") {
      for (const group of groupWallEntryTakeoffs(calculateWallEntryTakeoffs(fieldValue, products, mapping))) {
        const groupSpecValues = {
          ...specValues,
          wallSheetQty: group.sheetQty,
          wallSheetLM: group.lm,
          specWallPanels: group.sheetQty,
          specWallLM: group.lm,
        };
        const legacyAreaFormula = /\b(specArea|area)\b/i.test(mapping.qtyFormula) && !/\bwallSheet(LM|Qty)\b/i.test(mapping.qtyFormula);
        const qty = legacyAreaFormula
          ? group.lm
          : evaluateFormula(mapping.qtyFormula, groupSpecValues);
        if (qty <= 0) continue;

        const { costRate, sellRate } = calculateRates(group.product, markupRates, defaultMarkup);
        const resolvedUom = legacyAreaFormula ? "LM" : (mapping.uom || group.product?.uom || "LM");
        const colour = group.colour || (mapping.colourField ? String(specValues[mapping.colourField] || "") : "");
        const bottomColour = group.bottomColour || (mapping.bottomColourField ? String(specValues[mapping.bottomColourField] || "") : "");
        const description = mappingFallbackDescription(mapping, group.product, group.type);
        const roundedQty = Math.round(qty * 1000) / 1000;

        items.push({
          specMappingId: mapping.id,
          productId: group.product?.id || null,
          tabName: mapping.tabName,
          description,
          colour,
          bottomColour,
          uom: resolvedUom,
          qty: roundedQty,
          costRate,
          sellRate,
          notes: `Wall panel takeoff: ${group.details.join("; ")}`,
          source: "auto",
        });
      }
      continue;
    }

    // Find the product FIRST so we can inject its cover width into formula evaluation
    let product: ProductLookup | null = null;
    const matchValue = resolveProductMatchValue(mapping, specValues, fieldValue);
    if (mapping.productMatch) {
      // Match product by name using the spec field value
      product = findProductBySpecMatch(products, mapping.tabName, matchValue);
    } else if (mapping.productId) {
      product = products.find(p => p.id === mapping.productId) || null;
    }

    // Build per-mapping spec values with product-specific variables injected
    const mappingSpecValues = { ...specValues };
    if (product?.coverageWidth) {
      mappingSpecValues.productCover = product.coverageWidth;
      // roofSheetLM is the pricing quantity: roof area divided by product cover.
      // Sheet count is still retained for takeoff/display notes.
      const runWidth = getNumericSpecValue(specValues, "roofRunWidth") || 0;
      const sheetLength = getNumericSpecValue(specValues, "roofSheetLength") || 0;
      const roofArea =
        getNumericSpecValue(specValues, "specRoofArea")
        ?? getNumericSpecValue(specValues, "roofArea")
        ?? (runWidth > 0 && sheetLength > 0 ? runWidth * sheetLength : 0);
      const coverM = product.coverageWidth / 1000;
      if (roofArea > 0 && coverM > 0) {
        const roofSheetLM = roofArea / coverM;
        const sheetQty = sheetLength > 0
          ? Math.ceil(roofSheetLM / sheetLength)
          : (runWidth > 0 ? Math.ceil(runWidth / coverM) : 0);
        mappingSpecValues.roofSheetQty = sheetQty;
        mappingSpecValues.specRoofSheetQty = sheetQty;
        mappingSpecValues.roofSheetLM = roofSheetLM;
      }
    }

    // Calculate quantity (now with product cover available)
    const resolvedUom = mapping.uom || product?.uom || "ea";
    let qty = evaluateFormula(mapping.qtyFormula, mappingSpecValues);
    const formulaUsesSheetCount = /\broofSheetQty\b/i.test(mapping.qtyFormula);
    const roofSheetLMValue = Number(mappingSpecValues.roofSheetLM || 0);
    if (
      formulaUsesSheetCount
      && roofSheetLMValue > 0
      && mapping.tabName === "roof"
      && product?.coverageWidth
      && isLinearMetreUom(resolvedUom)
    ) {
      qty = roofSheetLMValue;
    }
    if (qty <= 0) continue; // No quantity, skip

    // Calculate rates
    const { costRate, sellRate } = calculateRates(product, markupRates, defaultMarkup);

    const roofSheetQty = Number(mappingSpecValues.roofSheetQty || 0);
    const roofSheetLength = Number(mappingSpecValues.roofSheetLength || 0);
    const roofSheetLM = Number(mappingSpecValues.roofSheetLM || 0);
    const roofArea = Number(mappingSpecValues.specRoofArea || mappingSpecValues.roofArea || 0);
    const isRoofSheetTakeoff = mapping.tabName === "roof"
      && !!product?.coverageWidth
      && /\broofSheet(LM|Qty|Length)\b/i.test(mapping.qtyFormula);
    const notes = isRoofSheetTakeoff && roofSheetQty > 0 && roofSheetLength > 0 && roofSheetLM > 0
      ? `Roof sheet takeoff: ${roofSheetQty} sheet${roofSheetQty === 1 ? "" : "s"} x ${formatTakeoffNumber(roofSheetLength)}m nominal; ${formatTakeoffNumber(roofArea)}m² / ${product!.coverageWidth}mm cover = ${formatTakeoffNumber(roofSheetLM)} LM`
      : null;

    // Get colour from spec
    const colour = mapping.colourField
      ? String(specValues[mapping.colourField] || "")
      : "";
    const bottomColour = mapping.bottomColourField
      ? String(specValues[mapping.bottomColourField] || "")
      : "";

    // Build description
    const description = mappingFallbackDescription(mapping, product, matchValue);

    const baseItem: GeneratedItem = {
      specMappingId: mapping.id,
      productId: product?.id || null,
      tabName: mapping.tabName,
      description,
      colour,
      bottomColour,
      uom: resolvedUom,
      qty: Math.round(qty * 1000) / 1000, // Round to 3dp
      costRate,
      sellRate,
      notes,
      source: "auto",
    };

    items.push(baseItem);
    items.push(...buildWindowDoorModifierItems(mapping, baseItem, specValues, optionModifiers));
  }

  return items;
}
