/**
 * SpecSheet Preferences Store
 * Persists section order and hidden sections per-user in localStorage.
 */

const SECTION_ORDER_KEY = "specsheet_section_order_v1";
const HIDDEN_SECTIONS_KEY = "specsheet_hidden_sections_v1";

// Default section order (matches SECTIONS array)
export const DEFAULT_SECTION_ORDER = [
  "client",
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

export function loadSectionOrder(): string[] {
  try {
    const raw = localStorage.getItem(SECTION_ORDER_KEY);
    if (!raw) return [...DEFAULT_SECTION_ORDER];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return [...DEFAULT_SECTION_ORDER];
    // Ensure all default sections are present (in case new ones were added)
    const existing = new Set(parsed);
    const result = [...parsed];
    for (const id of DEFAULT_SECTION_ORDER) {
      if (!existing.has(id)) result.push(id);
    }
    return result;
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
