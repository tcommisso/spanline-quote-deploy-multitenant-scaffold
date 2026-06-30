export const CONSTRUCTION_CHECKLIST_TEMPLATES_SETTINGS_KEY = "constructionChecklistTemplates";

export const CONSTRUCTION_CHECKLIST_PRIORITIES = ["normal", "important", "urgent"] as const;

export type ConstructionChecklistPriority = (typeof CONSTRUCTION_CHECKLIST_PRIORITIES)[number];

export type ConstructionChecklistTemplateItem = {
  title: string;
  priority: ConstructionChecklistPriority;
  isBlocking: boolean;
  visibleToTrade: boolean;
  sortOrder: number;
};

export type ConstructionChecklistTemplates = {
  finalInspection: {
    items: ConstructionChecklistTemplateItem[];
  };
};

export const DEFAULT_FINAL_INSPECTION_TEMPLATE_ITEMS: ConstructionChecklistTemplateItem[] = [
  { title: "Final inspection booked", priority: "normal", isBlocking: false, visibleToTrade: false, sortOrder: 0 },
  { title: "Structure checked against approved specification", priority: "normal", isBlocking: false, visibleToTrade: false, sortOrder: 1 },
  { title: "Fixings and finishes inspected", priority: "normal", isBlocking: false, visibleToTrade: false, sortOrder: 2 },
  { title: "Drainage and downpipes checked", priority: "normal", isBlocking: false, visibleToTrade: false, sortOrder: 3 },
  { title: "Site cleaned and made safe", priority: "normal", isBlocking: false, visibleToTrade: false, sortOrder: 4 },
  { title: "Client walkthrough completed", priority: "normal", isBlocking: false, visibleToTrade: false, sortOrder: 5 },
  { title: "Final photos uploaded", priority: "important", isBlocking: false, visibleToTrade: false, sortOrder: 6 },
  { title: "Final inspection report uploaded", priority: "important", isBlocking: true, visibleToTrade: false, sortOrder: 7 },
];

function cloneItem(item: ConstructionChecklistTemplateItem): ConstructionChecklistTemplateItem {
  return {
    title: item.title,
    priority: item.priority,
    isBlocking: item.isBlocking,
    visibleToTrade: item.visibleToTrade,
    sortOrder: item.sortOrder,
  };
}

export function getDefaultConstructionChecklistTemplates(): ConstructionChecklistTemplates {
  return {
    finalInspection: {
      items: DEFAULT_FINAL_INSPECTION_TEMPLATE_ITEMS.map(cloneItem),
    },
  };
}

function isPriority(value: unknown): value is ConstructionChecklistPriority {
  return CONSTRUCTION_CHECKLIST_PRIORITIES.includes(value as ConstructionChecklistPriority);
}

function normalizeItem(value: unknown, index: number): ConstructionChecklistTemplateItem | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  const title = String(item.title ?? "").trim();
  if (!title) return null;
  const priority = isPriority(item.priority) ? item.priority : "normal";
  const sortOrder = Number(item.sortOrder);
  return {
    title,
    priority,
    isBlocking: Boolean(item.isBlocking),
    visibleToTrade: Boolean(item.visibleToTrade),
    sortOrder: Number.isFinite(sortOrder) ? sortOrder : index,
  };
}

function normalizeItems(value: unknown): ConstructionChecklistTemplateItem[] {
  const rawItems = Array.isArray(value) ? value : [];
  return rawItems
    .map(normalizeItem)
    .filter((item): item is ConstructionChecklistTemplateItem => Boolean(item))
    .sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title))
    .map((item, index) => ({ ...item, sortOrder: index }));
}

export function normalizeConstructionChecklistTemplates(value: unknown): ConstructionChecklistTemplates {
  const defaults = getDefaultConstructionChecklistTemplates();
  if (!value || typeof value !== "object") return defaults;
  const record = value as Record<string, any>;
  const finalInspectionItems = normalizeItems(record.finalInspection?.items);
  return {
    finalInspection: {
      items: finalInspectionItems.length > 0 ? finalInspectionItems : defaults.finalInspection.items,
    },
  };
}
