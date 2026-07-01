export const CONSTRUCTION_CHECKLIST_TEMPLATES_SETTINGS_KEY = "constructionChecklistTemplates";

export const CONSTRUCTION_CHECKLIST_PRIORITIES = ["normal", "important", "urgent"] as const;
export const CONSTRUCTION_CHECKLIST_RESPONSE_TYPES = [
  "check",
  "yes_no",
  "dropdown",
  "multi_select",
  "short_text",
  "long_text",
  "number",
  "date",
  "image_upload",
  "file_upload",
  "client_lookup",
  "trade_user_lookup",
  "user_lookup",
] as const;

export type ConstructionChecklistPriority = (typeof CONSTRUCTION_CHECKLIST_PRIORITIES)[number];
export type ConstructionChecklistResponseType = (typeof CONSTRUCTION_CHECKLIST_RESPONSE_TYPES)[number];

export type ConstructionChecklistTemplateItem = {
  title: string;
  priority: ConstructionChecklistPriority;
  isBlocking: boolean;
  visibleToTrade: boolean;
  visibleToClient: boolean;
  sendToUserId: number | null;
  responseType: ConstructionChecklistResponseType;
  responseOptions: string[];
  responseRequired: boolean;
  responseHelpText: string | null;
  sortOrder: number;
};

export type ConstructionChecklistTemplates = {
  finalInspection: {
    items: ConstructionChecklistTemplateItem[];
  };
};

function checklistItem(
  title: string,
  priority: ConstructionChecklistPriority,
  isBlocking: boolean,
  visibleToTrade: boolean,
  sortOrder: number,
  responseType: ConstructionChecklistResponseType = "check",
): ConstructionChecklistTemplateItem {
  return {
    title,
    priority,
    isBlocking,
    visibleToTrade,
    visibleToClient: false,
    sendToUserId: null,
    responseType,
    responseOptions: [],
    responseRequired: false,
    responseHelpText: null,
    sortOrder,
  };
}

export const DEFAULT_FINAL_INSPECTION_TEMPLATE_ITEMS: ConstructionChecklistTemplateItem[] = [
  checklistItem("Final inspection booked", "normal", false, false, 0),
  checklistItem("Structure checked against approved specification", "normal", false, false, 1),
  checklistItem("Fixings and finishes inspected", "normal", false, false, 2),
  checklistItem("Drainage and downpipes checked", "normal", false, false, 3),
  checklistItem("Site cleaned and made safe", "normal", false, false, 4),
  checklistItem("Client walkthrough completed", "normal", false, false, 5, "yes_no"),
  checklistItem("Final photos uploaded", "important", false, false, 6, "image_upload"),
  checklistItem("Final inspection report uploaded", "important", true, false, 7, "file_upload"),
];

function cloneItem(item: ConstructionChecklistTemplateItem): ConstructionChecklistTemplateItem {
  return {
    title: item.title,
    priority: item.priority,
    isBlocking: item.isBlocking,
    visibleToTrade: item.visibleToTrade,
    visibleToClient: item.visibleToClient,
    sendToUserId: item.sendToUserId,
    responseType: item.responseType,
    responseOptions: [...item.responseOptions],
    responseRequired: item.responseRequired,
    responseHelpText: item.responseHelpText,
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

function isResponseType(value: unknown): value is ConstructionChecklistResponseType {
  return CONSTRUCTION_CHECKLIST_RESPONSE_TYPES.includes(value as ConstructionChecklistResponseType);
}

function normalizeOptions(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const options: string[] = [];
  for (const rawOption of value) {
    const option = String(rawOption ?? "").trim().slice(0, 120);
    const key = option.toLowerCase();
    if (!option || seen.has(key)) continue;
    seen.add(key);
    options.push(option);
    if (options.length >= 30) break;
  }
  return options;
}

function normalizeItem(value: unknown, index: number): ConstructionChecklistTemplateItem | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  const title = String(item.title ?? "").trim();
  if (!title) return null;
  const priority = isPriority(item.priority) ? item.priority : "normal";
  const responseType = isResponseType(item.responseType) ? item.responseType : "check";
  const sortOrder = Number(item.sortOrder);
  const sendToUserId = Number(item.sendToUserId);
  return {
    title,
    priority,
    isBlocking: Boolean(item.isBlocking),
    visibleToTrade: Boolean(item.visibleToTrade),
    visibleToClient: Boolean(item.visibleToClient),
    sendToUserId: Number.isInteger(sendToUserId) && sendToUserId > 0 ? sendToUserId : null,
    responseType,
    responseOptions: normalizeOptions(item.responseOptions),
    responseRequired: Boolean(item.responseRequired),
    responseHelpText: String(item.responseHelpText ?? "").trim().slice(0, 500) || null,
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
