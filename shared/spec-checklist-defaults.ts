export type WorkChecklistResponsibility = "" | "By Builder" | "By Client";
export type WorkChecklistField = "item" | "task";

export type WorkChecklistDefaultItem = {
  item?: string;
  task?: string;
  checked: boolean;
  notes?: string;
  responsibility?: WorkChecklistResponsibility;
  qty?: string | number;
  unit?: string;
  productMatch?: string;
};

export type WorkChecklistSection = {
  id: string;
  label: string;
  field: WorkChecklistField;
};

export const WORK_CHECKLIST_UNITS = ["ea", "LM", "m", "m2", "m3", "hr", "day", "lump"] as const;

export const WORK_CHECKLIST_SECTIONS: WorkChecklistSection[] = [
  { id: "walls", label: "Walls", field: "item" },
  { id: "floor", label: "Internal Floor / Site Work", field: "task" },
  { id: "stairs", label: "Stairs", field: "item" },
  { id: "electrical", label: "Electrical", field: "task" },
  { id: "concreting", label: "Concreting", field: "item" },
  { id: "demolition", label: "Demolition Works", field: "item" },
  { id: "existingHouse", label: "Work on Existing House", field: "item" },
  { id: "plumbing", label: "Plumbing & Drainage", field: "item" },
];

const item = (label: string): WorkChecklistDefaultItem => ({
  item: label,
  checked: false,
  notes: "",
  responsibility: "",
});

const task = (label: string): WorkChecklistDefaultItem => ({
  task: label,
  checked: false,
  notes: "",
  responsibility: "",
});

export const BUILTIN_WORK_CHECKLIST_DEFAULTS: Record<string, WorkChecklistDefaultItem[]> = {
  walls: [
    item("Timber Stud wall"),
    item("Brick wall"),
    item("Plastering"),
    item("Painting"),
  ],
  floor: [
    task("Earthworks - ground preparation"),
    task("Landscaping"),
    task("Backfilling"),
    task("Dirt disposal"),
    task("Retaining walls"),
  ],
  stairs: [
    item("Timber Stairs"),
    item("Steel Stringers"),
    item("Spiral Staircase"),
    item("Landing/Platform"),
    item("Handrail"),
    item("Balustrade to Stairs"),
    item("Non-slip Nosing"),
    item("Under-stair Storage"),
  ],
  electrical: [
    task("Light cabling for future use"),
    task("Light cabling only (Connection by Owner)"),
    task("Make safe for works (usually required with Demolition of existing structures)"),
    task("Remove Solar Panels"),
    task("Reinstall Solar Panels"),
    task("Remove air conditioner"),
    task("Reinstall air conditioner"),
    task("Remove lights"),
    task("Reinstall lights"),
    task("Remove power points"),
    task("Reinstall power points"),
    task("Power Line within 1.5m of structure"),
  ],
  concreting: [
    item("Patio Slab"),
    item("Enclosure Slab"),
    item("Topper Slab"),
    item("Pier footings"),
    item("Strip footings"),
    item("Exposed aggregate"),
    item("Broom finish"),
    item("Coloured concrete"),
    item("Stamped concrete"),
    item("Rebate for tiles"),
    item("Step down"),
  ],
  demolition: [
    item("Demolish existing concrete slab"),
    item("Demolish existing steel structure"),
    item("Demolish existing timber structure"),
    item("Demolish existing brick structure"),
    item("Remove pavers"),
    item("Disposal of waste"),
    item("Repair/replace eaves, fascia"),
    item("Onsite storage of recovered materials"),
  ],
  existingHouse: [
    item("Eave cut back"),
    item("Stud Wall"),
    item("Batten and Gyprock House Wall"),
    item("Cut Brick Veneer Wall, install window/door with architrave"),
    item("Replace Eave Ceiling"),
    item("Replace Fascia"),
    item("Repoint roof hips"),
    item("Install Beams into Foam wall"),
  ],
  plumbing: [
    item("Stormwater connection"),
    item("Move hot water"),
    item("Move Gas"),
    item("Move or flash vent pipe"),
    item("Move ORG"),
    item("Move Tap"),
    item("Fit-off Kitchenette"),
    item("Fit-off Bathroom"),
    item("Strip Drain"),
  ],
};

export function getWorkChecklistSection(sectionId: string) {
  return WORK_CHECKLIST_SECTIONS.find((section) => section.id === sectionId);
}

export function getWorkChecklistLabel(row: WorkChecklistDefaultItem) {
  return row.item ?? row.task ?? "";
}

export function checklistDefaultFromLabel(
  sectionId: string,
  label: string,
  options: Partial<WorkChecklistDefaultItem> = {},
): WorkChecklistDefaultItem {
  const section = getWorkChecklistSection(sectionId);
  const base: WorkChecklistDefaultItem = {
    checked: false,
    notes: options.notes ?? "",
    responsibility: options.responsibility ?? "",
    qty: options.qty ?? "",
    unit: options.unit || "ea",
    productMatch: options.productMatch ?? "",
  };
  if (section?.field === "task") return { ...base, task: label };
  return { ...base, item: label };
}

export function getBuiltinWorkChecklistDefaults(sectionId: string): WorkChecklistDefaultItem[] {
  return (BUILTIN_WORK_CHECKLIST_DEFAULTS[sectionId] ?? []).map((row) => ({ ...row }));
}
