/**
 * SpecSheet Preferences Store
 * Persists section order and hidden sections per-user in localStorage.
 */

const SECTION_ORDER_KEY = "specsheet_section_order_v1";
const HIDDEN_SECTIONS_KEY = "specsheet_hidden_sections_v1";

// Default section order (matches SECTIONS array)
export const DEFAULT_SECTION_ORDER = [
  "client",
  "siteDetails",
  "dimensions",
  "demolition",
  "existingHouse",
  "brackets",
  "roof",
  "gutter",
  "beams",
  "posts",
  "sitePlan",
  "concreting",
  "stairs",
  "adjustments",
  "additionalCosts",
  "balustrade",
  "electrical",
  "plumbing",
  "walls",
  "windows",
  "floor",
  "history",
] as const;

export type SectionId = (typeof DEFAULT_SECTION_ORDER)[number];

export function ensureDefaultSections(order: readonly string[]): string[] {
  const defaultIds = new Set<string>(DEFAULT_SECTION_ORDER);
  const result = order.filter(id => defaultIds.has(id));

  DEFAULT_SECTION_ORDER.forEach((id, index) => {
    if (result.includes(id)) return;

    const previousDefault = DEFAULT_SECTION_ORDER
      .slice(0, index)
      .filter(prev => result.includes(prev));
    const previous = previousDefault[previousDefault.length - 1];
    if (previous) {
      result.splice(result.indexOf(previous) + 1, 0, id);
      return;
    }

    const next = DEFAULT_SECTION_ORDER
      .slice(index + 1)
      .find(nextId => result.includes(nextId));
    if (next) result.splice(result.indexOf(next), 0, id);
    else result.push(id);
  });

  return result;
}

export function loadSectionOrder(): string[] {
  try {
    const raw = localStorage.getItem(SECTION_ORDER_KEY);
    if (!raw) return [...DEFAULT_SECTION_ORDER];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return [...DEFAULT_SECTION_ORDER];
    return ensureDefaultSections(parsed);
  } catch {
    return [...DEFAULT_SECTION_ORDER];
  }
}

export function saveSectionOrder(order: string[]): void {
  localStorage.setItem(SECTION_ORDER_KEY, JSON.stringify(order));
}

export function resetSectionOrder(): void {
  localStorage.removeItem(SECTION_ORDER_KEY);
}

export function loadHiddenSections(): Set<string> {
  try {
    const raw = localStorage.getItem(HIDDEN_SECTIONS_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed);
  } catch {
    return new Set();
  }
}

export function saveHiddenSections(hidden: Set<string>): void {
  localStorage.setItem(HIDDEN_SECTIONS_KEY, JSON.stringify(Array.from(hidden)));
}

export function resetHiddenSections(): void {
  localStorage.removeItem(HIDDEN_SECTIONS_KEY);
}

export function resetAllPreferences(): void {
  resetSectionOrder();
  resetHiddenSections();
}
