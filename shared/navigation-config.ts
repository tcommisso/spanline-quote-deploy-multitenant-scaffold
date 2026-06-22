import { PERMISSION_MATRIX_ROLES, type UserRole } from "./const";

export const NAVIGATION_SETTINGS_KEY = "navigationSettings";

export const APP_CENTRAL_SECTION_IDS = [
  "inbox",
  "chat",
  "crm",
  "sales",
  "construction",
  "proposals",
  "manufacturing",
  "inventory",
  "approvals",
  "da_tracker",
  "finance",
  "reporting",
  "admin",
] as const;

export const MOBILE_NAV_ITEM_IDS = [
  "app_central",
  ...APP_CENTRAL_SECTION_IDS,
  "support",
] as const;

export type AppCentralSectionId = typeof APP_CENTRAL_SECTION_IDS[number];
export type MobileNavItemId = typeof MOBILE_NAV_ITEM_IDS[number];

export type RoleNavigationSettings = {
  appCentralSectionIds: AppCentralSectionId[];
  mobileBottomNavIds: MobileNavItemId[];
};

export type NavigationSettings = {
  roles: Record<UserRole, RoleNavigationSettings>;
};

const ALL_APP_SECTIONS = [...APP_CENTRAL_SECTION_IDS];

const DEFAULT_APP_CENTRAL_BY_ROLE: Record<UserRole, AppCentralSectionId[]> = {
  super_admin: ALL_APP_SECTIONS,
  admin: ALL_APP_SECTIONS,
  design_adviser: ["inbox", "chat", "crm", "sales", "proposals", "da_tracker"],
  office_user: [
    "inbox",
    "chat",
    "crm",
    "sales",
    "construction",
    "proposals",
    "approvals",
    "da_tracker",
    "manufacturing",
    "inventory",
    "finance",
    "reporting",
  ],
  construction_user: ["inbox", "chat", "construction", "approvals"],
  driver: ["chat", "manufacturing"],
  warehouse: ["inbox", "chat", "manufacturing", "inventory"],
  user: [],
};

const DEFAULT_MOBILE_NAV_BY_ROLE: Record<UserRole, MobileNavItemId[]> = {
  super_admin: ["app_central", "chat", "sales", "admin"],
  admin: ["app_central", "chat", "sales", "admin"],
  design_adviser: ["app_central", "chat", "crm", "sales"],
  office_user: ["app_central", "chat", "crm", "construction"],
  construction_user: ["app_central", "chat", "construction", "approvals"],
  driver: ["app_central", "chat", "manufacturing"],
  warehouse: ["app_central", "chat", "inventory", "manufacturing"],
  user: ["app_central", "support"],
};

function uniqueValid<T extends string>(values: unknown, validIds: readonly T[], fallback: T[], limit?: number): T[] {
  if (!Array.isArray(values)) return [...fallback];
  const valid = new Set(validIds);
  const next: T[] = [];
  for (const value of values) {
    if (typeof value !== "string" || !valid.has(value as T) || next.includes(value as T)) continue;
    next.push(value as T);
    if (limit && next.length >= limit) break;
  }
  return next.length > 0 ? next : [...fallback];
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export function getDefaultNavigationSettings(): NavigationSettings {
  return {
    roles: PERMISSION_MATRIX_ROLES.reduce((acc, role) => {
      acc[role] = {
        appCentralSectionIds: [...DEFAULT_APP_CENTRAL_BY_ROLE[role]],
        mobileBottomNavIds: [...DEFAULT_MOBILE_NAV_BY_ROLE[role]],
      };
      return acc;
    }, {} as Record<UserRole, RoleNavigationSettings>),
  };
}

export function normalizeNavigationSettings(input: unknown): NavigationSettings {
  const defaults = getDefaultNavigationSettings();
  const sourceRoles = asRecord(asRecord(input).roles);

  return {
    roles: PERMISSION_MATRIX_ROLES.reduce((acc, role) => {
      const roleSettings = asRecord(sourceRoles[role]);
      acc[role] = {
        appCentralSectionIds: uniqueValid(
          roleSettings.appCentralSectionIds,
          APP_CENTRAL_SECTION_IDS,
          defaults.roles[role].appCentralSectionIds,
        ),
        mobileBottomNavIds: uniqueValid(
          roleSettings.mobileBottomNavIds,
          MOBILE_NAV_ITEM_IDS,
          defaults.roles[role].mobileBottomNavIds,
          4,
        ),
      };
      return acc;
    }, {} as Record<UserRole, RoleNavigationSettings>),
  };
}
