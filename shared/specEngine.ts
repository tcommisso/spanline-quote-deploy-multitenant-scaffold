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

const FORMULA_FIELD_PATTERN = /\b(spec\w+|width|length|area|roofArea|perimeter|roofRunWidth|roofSheetLength|roofSheetQty|roofSheetLM|productCover|wasteFactor)\b/gi;

function formatTakeoffNumber(value: number): string {
  return value.toFixed(3).replace(/\.?0+$/, "");
}

function normalizeMatchValue(value: unknown): string {
  return String(value ?? "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getProductTabName(value: string) {
  return normalizeMatchValue(value);
}

function findProductBySpecMatch(
  products: ProductLookup[],
  tabName: string,
  matchValue: unknown
): ProductLookup | null {
  const normalizedMatch = normalizeMatchValue(matchValue);
  if (!normalizedMatch) return null;

  const candidates = products.filter(p => getProductTabName(p.tabName) === getProductTabName(tabName));
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
    return tokens.every(token => name.includes(token));
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
  const costRate = materials + installLabour + consumables;

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

/**
 * Main generation function: evaluates all active mappings against spec values
 * and produces quote line items.
 */
export function generateItemsFromSpec(
  mappings: SpecMapping[],
  specValues: SpecValues,
  products: ProductLookup[],
  markupRates: MarkupRates,
  defaultMarkup: number = 2.2
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

    // Find the product FIRST so we can inject its cover width into formula evaluation
    let product: ProductLookup | null = null;
    if (mapping.productMatch) {
      // Match product by name using the spec field value
      const matchValue = specValues[mapping.productMatch] || fieldValue || "";
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
    const description = mapping.description
      || (product ? product.name : mapping.name);

    items.push({
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
    });
  }

  return items;
}
