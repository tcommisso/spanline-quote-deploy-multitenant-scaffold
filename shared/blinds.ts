export const BLIND_PRODUCT_TYPES = [
  { value: "zipguideawnings", label: "Zip Guide Awnings" },
  { value: "fixedchannelscreens", label: "Fixed Channel Screens" },
  { value: "wireguideextremeawnings", label: "Wire Guide Extreme Awnings" },
  { value: "zipguideextremeawnings", label: "Zip Guide Extreme Awnings" },
  { value: "straightdropawnings", label: "Straight Drop Awnings" },
  { value: "wireguideawnings", label: "Wire Guide Awnings" },
] as const;

export const BLIND_FABRIC_CATEGORIES = [
  { value: "category1", label: "Category One", number: "1" },
  { value: "category2", label: "Category Two", number: "2" },
  { value: "category3", label: "Category Three", number: "3" },
  { value: "category4", label: "Category Four", number: "4" },
  { value: "category5", label: "Category Five", number: "5" },
] as const;

export const BLIND_OPTION_CATEGORIES = [
  { value: "accessory_boxsection", label: "Box Section" },
  { value: "accessory_crankoperation", label: "Crank Operation" },
  { value: "accessory_custompowdercoat", label: "Custom Powder Coat" },
  { value: "accessory_langle", label: "L-Angle" },
  { value: "accessory_locks", label: "Locks" },
  { value: "accessory_mountingbrackets", label: "Mounting Brackets" },
  { value: "accessory_reworks", label: "Reworks" },
  { value: "accessory_springoperated", label: "Spring Operated" },
  { value: "accessory_upgrades", label: "Upgrades" },
  { value: "motorisation_accessories", label: "Motorisation Accessories" },
  { value: "motorisation_motors", label: "Motors" },
  { value: "motorisation_remotes", label: "Remotes" },
] as const;

const WORD_NUMBERS: Record<string, string> = {
  one: "1",
  two: "2",
  three: "3",
  four: "4",
  five: "5",
};

export function compactBlindKey(value: unknown) {
  return String(value ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function blindProductTypeValue(value: unknown) {
  const key = compactBlindKey(value);
  return BLIND_PRODUCT_TYPES.find((type) => compactBlindKey(type.value) === key || compactBlindKey(type.label) === key)?.value || key;
}

export function blindProductTypeLabel(value: unknown) {
  const key = blindProductTypeValue(value);
  return BLIND_PRODUCT_TYPES.find((type) => type.value === key)?.label || String(value ?? "");
}

export function blindFabricCategoryValue(value: unknown) {
  const text = String(value ?? "").trim();
  const key = compactBlindKey(text);
  const numeric = text.match(/\d+/)?.[0] || WORD_NUMBERS[key.replace(/^fabriccategory|^category/, "")];
  if (numeric) {
    const category = BLIND_FABRIC_CATEGORIES.find((item) => item.number === String(Number(numeric)));
    if (category) return category.value;
  }
  return BLIND_FABRIC_CATEGORIES.find((item) => compactBlindKey(item.value) === key || compactBlindKey(item.label) === key)?.value || key;
}

export function blindFabricCategoryLabel(value: unknown) {
  const key = blindFabricCategoryValue(value);
  return BLIND_FABRIC_CATEGORIES.find((category) => category.value === key)?.label || String(value ?? "");
}

export function blindFabricCategoryNumber(value: unknown) {
  const key = blindFabricCategoryValue(value);
  return BLIND_FABRIC_CATEGORIES.find((category) => category.value === key)?.number || "";
}

export function blindOptionCategoryLabel(value: unknown) {
  const key = compactBlindKey(value);
  const category = BLIND_OPTION_CATEGORIES.find((item) => compactBlindKey(item.value) === key || compactBlindKey(item.label) === key);
  return category?.label || String(value ?? "").replace(/_/g, " ");
}
