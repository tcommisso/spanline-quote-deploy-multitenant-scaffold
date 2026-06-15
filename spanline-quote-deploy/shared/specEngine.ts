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
  [key: string]: string | number | null | undefined;
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
  source: "auto";
}

export interface MarkupRates {
  [category: string]: number; // e.g. { "standard": 2.2, "premium": 2.5 }
}

/**
 * Evaluate a condition expression against a spec field value.
 * Supports: "> 0", ">= 1", "!= ''", "= value", "!= value", "contains value", "any" (always true)
 */
export function evaluateCondition(fieldValue: string | number | null | undefined, condition: string): boolean {
  if (!condition || condition.trim().toLowerCase() === "any") return true;
  
  const val = fieldValue ?? "";
  const strVal = String(val).trim();
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
  const fieldPattern = /\b(spec\w+|width|length|area|perimeter|roofRunWidth|roofSheetLength|roofSheetLM|productCover|wasteFactor)\b/gi;
  expr = expr.replace(fieldPattern, (match) => {
    const key = match;
    // Try exact match first
    if (specValues[key] !== undefined && specValues[key] !== null && specValues[key] !== "") {
      return String(parseFloat(String(specValues[key])) || 0);
    }
    // Try with "spec" prefix if not already prefixed
    if (!key.startsWith("spec")) {
      const prefixed = "spec" + key.charAt(0).toUpperCase() + key.slice(1);
      if (specValues[prefixed] !== undefined && specValues[prefixed] !== null && specValues[prefixed] !== "") {
        return String(parseFloat(String(specValues[prefixed])) || 0);
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

    // Find the product FIRST so we can inject its cover width into formula evaluation
    let product: ProductLookup | null = null;
    if (mapping.productId) {
      product = products.find(p => p.id === mapping.productId) || null;
    } else if (mapping.productMatch) {
      // Match product by name using the spec field value
      const matchValue = String(specValues[mapping.productMatch] || fieldValue || "").toLowerCase();
      product = products.find(p =>
        p.tabName === mapping.tabName &&
        p.name.toLowerCase().includes(matchValue)
      ) || null;
    }

    // Build per-mapping spec values with product-specific variables injected
    const mappingSpecValues = { ...specValues };
    if (product?.coverageWidth) {
      mappingSpecValues.productCover = product.coverageWidth;
      // roofSheetLM = Math.ceil(roofRunWidth / (coverMM / 1000)) * roofSheetLength
      const runWidth = parseFloat(String(specValues.roofRunWidth || 0));
      const sheetLength = parseFloat(String(specValues.roofSheetLength || 0));
      const coverM = product.coverageWidth / 1000;
      if (runWidth > 0 && sheetLength > 0 && coverM > 0) {
        mappingSpecValues.roofSheetLM = Math.ceil(runWidth / coverM) * sheetLength;
      }
    }

    // Calculate quantity (now with product cover available)
    const qty = evaluateFormula(mapping.qtyFormula, mappingSpecValues);
    if (qty <= 0) continue; // No quantity, skip

    // Calculate rates
    const { costRate, sellRate } = calculateRates(product, markupRates, defaultMarkup);

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
      uom: mapping.uom || product?.uom || "ea",
      qty: Math.round(qty * 1000) / 1000, // Round to 3dp
      costRate,
      sellRate,
      source: "auto",
    });
  }

  return items;
}
