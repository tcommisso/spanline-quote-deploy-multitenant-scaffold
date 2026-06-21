export const COOKIE_NAME = "app_session_id";
export const IMPERSONATE_COOKIE_NAME = "app_impersonate_id";
export const ONE_YEAR_MS = 1000 * 60 * 60 * 24 * 365;
export const EIGHT_HOURS_MS = 1000 * 60 * 60 * 8;
export const AXIOS_TIMEOUT_MS = 30_000;
export const UNAUTHED_ERR_MSG = 'Please login (10001)';
export const NOT_ADMIN_ERR_MSG = 'You do not have required permission (10002)';

// ─── Role System ────────────────────────────────────────────────────────────
export type UserRole = 'user' | 'admin' | 'super_admin' | 'design_adviser' | 'office_user' | 'construction_user' | 'driver' | 'warehouse';
export type PermissionKey =
  | 'app_central'
  | 'inbox'
  | 'crm'
  | 'sales'
  | 'quotes'
  | 'proposals'
  | 'construction'
  | 'construction_financials'
  | 'approvals'
  | 'hbcf'
  | 'da_tracker'
  | 'manufacturing'
  | 'manufacturing_purchase_orders'
  | 'inventory'
  | 'tasks'
  | 'finance'
  | 'reporting'
  | 'admin'
  | 'master_data'
  | 'user_management'
  | 'permissions_admin'
  | 'xero'
  | 'support';

export type PermissionMatrix = Record<PermissionKey, boolean>;
export type PermissionOverrideInput = {
  role: string;
  permissionKey: string;
  allowed: boolean;
};

export const ROLE_LABELS: Record<UserRole, string> = {
  user: 'Unassigned',
  admin: 'Admin (Legacy)',
  super_admin: 'Super Admin',
  design_adviser: 'Design Adviser',
  office_user: 'Office User',
  construction_user: 'Construction User',
  driver: 'Driver',
  warehouse: 'Warehouse',
};

export const ADMIN_ROLES: UserRole[] = ['admin', 'super_admin'];
export const APP_ROLES: UserRole[] = ['super_admin', 'admin', 'design_adviser', 'office_user', 'construction_user', 'driver', 'warehouse'];

export function normalizeUserRole(role: string | null | undefined): string {
  return String(role || '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
}

export function isAdminRole(role: string | null | undefined): boolean {
  return ADMIN_ROLES.includes(normalizeUserRole(role) as UserRole);
}

export const PERMISSION_LABELS: Record<PermissionKey, string> = {
  app_central: 'App Central',
  inbox: 'Inbox',
  crm: 'CRM',
  sales: 'Sales',
  quotes: 'Quotes',
  proposals: 'Proposals',
  construction: 'Construction',
  construction_financials: 'Construction Financials',
  approvals: 'Approvals',
  hbcf: 'HBCF',
  da_tracker: 'DA Tracker',
  manufacturing: 'Manufacturing',
  manufacturing_purchase_orders: 'Manufacturing POs',
  inventory: 'Inventory',
  tasks: 'Master Tasks',
  finance: 'Finance',
  reporting: 'Reporting',
  admin: 'Admin',
  master_data: 'Master Data',
  user_management: 'People & Users',
  permissions_admin: 'Permission Matrix',
  xero: 'Xero',
  support: 'Support',
};

export const PERMISSION_KEYS = Object.keys(PERMISSION_LABELS) as PermissionKey[];

export const DEFAULT_PERMISSION_MATRIX: Record<UserRole, Record<PermissionKey, boolean>> = {
  super_admin: Object.fromEntries(Object.keys(PERMISSION_LABELS).map(key => [key, true])) as Record<PermissionKey, boolean>,
  admin: {
    app_central: true,
    inbox: true,
    crm: true,
    sales: true,
    quotes: true,
    proposals: true,
    construction: true,
    construction_financials: true,
    approvals: true,
    hbcf: true,
    da_tracker: true,
    manufacturing: true,
    manufacturing_purchase_orders: true,
    inventory: true,
    tasks: true,
    finance: true,
    reporting: true,
    admin: true,
    master_data: true,
    user_management: true,
    permissions_admin: false,
    xero: true,
    support: true,
  },
  design_adviser: {
    app_central: true,
    inbox: true,
    crm: true,
    sales: true,
    quotes: true,
    proposals: true,
    construction: false,
    construction_financials: false,
    approvals: false,
    hbcf: false,
    da_tracker: true,
    manufacturing: false,
    manufacturing_purchase_orders: false,
    inventory: false,
    tasks: true,
    finance: false,
    reporting: false,
    admin: false,
    master_data: false,
    user_management: false,
    permissions_admin: false,
    xero: false,
    support: true,
  },
  office_user: {
    app_central: true,
    inbox: true,
    crm: true,
    sales: true,
    quotes: true,
    proposals: true,
    construction: true,
    construction_financials: true,
    approvals: true,
    hbcf: true,
    da_tracker: true,
    manufacturing: true,
    manufacturing_purchase_orders: true,
    inventory: true,
    tasks: true,
    finance: true,
    reporting: true,
    admin: false,
    master_data: false,
    user_management: false,
    permissions_admin: false,
    xero: false,
    support: true,
  },
  construction_user: {
    app_central: true,
    inbox: true,
    crm: false,
    sales: false,
    quotes: false,
    proposals: false,
    construction: true,
    construction_financials: false,
    approvals: true,
    hbcf: false,
    da_tracker: false,
    manufacturing: false,
    manufacturing_purchase_orders: false,
    inventory: false,
    tasks: true,
    finance: false,
    reporting: false,
    admin: false,
    master_data: false,
    user_management: false,
    permissions_admin: false,
    xero: false,
    support: true,
  },
  driver: {
    app_central: true,
    inbox: false,
    crm: false,
    sales: false,
    quotes: false,
    proposals: false,
    construction: false,
    construction_financials: false,
    approvals: false,
    hbcf: false,
    da_tracker: false,
    manufacturing: true,
    manufacturing_purchase_orders: false,
    inventory: false,
    tasks: true,
    finance: false,
    reporting: false,
    admin: false,
    master_data: false,
    user_management: false,
    permissions_admin: false,
    xero: false,
    support: true,
  },
  warehouse: {
    app_central: true,
    inbox: true,
    crm: false,
    sales: false,
    quotes: false,
    proposals: false,
    construction: false,
    construction_financials: false,
    approvals: false,
    hbcf: false,
    da_tracker: false,
    manufacturing: true,
    manufacturing_purchase_orders: true,
    inventory: true,
    tasks: true,
    finance: false,
    reporting: false,
    admin: false,
    master_data: false,
    user_management: false,
    permissions_admin: false,
    xero: false,
    support: true,
  },
  user: Object.fromEntries(Object.keys(PERMISSION_LABELS).map(key => [key, key === 'app_central' || key === 'support'])) as Record<PermissionKey, boolean>,
};

export const PERMISSION_MATRIX_ROLES = Object.keys(DEFAULT_PERMISSION_MATRIX) as UserRole[];

const PATH_PERMISSION_RULES: Array<{ prefix: string; permission: PermissionKey }> = [
  { prefix: '/admin/permissions', permission: 'permissions_admin' },
  { prefix: '/admin/people', permission: 'user_management' },
  { prefix: '/admin/user-settings', permission: 'user_management' },
  { prefix: '/admin/master-data', permission: 'master_data' },
  { prefix: '/admin/component-catalogue', permission: 'master_data' },
  { prefix: '/admin/order-templates', permission: 'master_data' },
  { prefix: '/admin/import-history', permission: 'master_data' },
  { prefix: '/xero-settings', permission: 'xero' },
  { prefix: '/api/xero/callback', permission: 'xero' },
  { prefix: '/admin/da-commissions', permission: 'finance' },
  { prefix: '/admin/da-invoices', permission: 'finance' },
  { prefix: '/admin/invoice-review', permission: 'finance' },
  { prefix: '/admin/subscriptions', permission: 'finance' },
  { prefix: '/admin/saas-billing', permission: 'finance' },
  { prefix: '/admin/render-costs', permission: 'finance' },
  { prefix: '/admin/suppliers', permission: 'finance' },
  { prefix: '/admin/supplier-feedback', permission: 'finance' },
  { prefix: '/construction/financials', permission: 'construction_financials' },
  { prefix: '/construction/analytics', permission: 'reporting' },
  { prefix: '/manufacturing/kpi', permission: 'reporting' },
  { prefix: '/crm/reports', permission: 'reporting' },
  { prefix: '/analytics', permission: 'reporting' },
  { prefix: '/manufacturing/purchase-orders', permission: 'manufacturing_purchase_orders' },
  { prefix: '/manufacturing/procurement', permission: 'manufacturing_purchase_orders' },
  { prefix: '/manufacturing/stocktake', permission: 'inventory' },
  { prefix: '/manufacturing', permission: 'manufacturing' },
  { prefix: '/inventory', permission: 'inventory' },
  { prefix: '/approvals/hbcf', permission: 'hbcf' },
  { prefix: '/approvals', permission: 'approvals' },
  { prefix: '/da-tracker', permission: 'da_tracker' },
  { prefix: '/tasks', permission: 'tasks' },
  { prefix: '/crm', permission: 'crm' },
  { prefix: '/calls', permission: 'crm' },
  { prefix: '/proposals', permission: 'proposals' },
  { prefix: '/quotes', permission: 'quotes' },
  { prefix: '/deck-quotes', permission: 'quotes' },
  { prefix: '/eclipse-quotes', permission: 'quotes' },
  { prefix: '/security-screens', permission: 'quotes' },
  { prefix: '/blinds', permission: 'quotes' },
  { prefix: '/patio-planner', permission: 'quotes' },
  { prefix: '/sales', permission: 'sales' },
  { prefix: '/construction', permission: 'construction' },
  { prefix: '/calendar-availability', permission: 'construction' },
  { prefix: '/plan-converter', permission: 'construction' },
  { prefix: '/inbox', permission: 'inbox' },
  { prefix: '/admin', permission: 'admin' },
  { prefix: '/support', permission: 'support' },
  { prefix: '/help', permission: 'support' },
  { prefix: '/process-flows', permission: 'support' },
  { prefix: '/', permission: 'app_central' },
];

export function getPermissionForPath(path: string): PermissionKey {
  const match = PATH_PERMISSION_RULES.find(rule => path === rule.prefix || (rule.prefix !== '/' && path.startsWith(rule.prefix)));
  return match?.permission ?? 'app_central';
}

export function hasPermission(role: string, permission: PermissionKey | keyof typeof PERMISSION_LABELS): boolean {
  return DEFAULT_PERMISSION_MATRIX[(role as UserRole) || 'user']?.[permission as PermissionKey] ?? false;
}

export function canAccessPath(role: string, path: string): boolean {
  return hasPermission(role, getPermissionForPath(path));
}

export function defaultPermissionsForRole(role: string | null | undefined): PermissionMatrix {
  const normalized = normalizeUserRole(role) as UserRole;
  return {
    ...(DEFAULT_PERMISSION_MATRIX[normalized] ?? DEFAULT_PERMISSION_MATRIX.user),
  };
}

export function isPermissionKey(value: string | null | undefined): value is PermissionKey {
  return PERMISSION_KEYS.includes(value as PermissionKey);
}

export function isPermissionMatrixRole(value: string | null | undefined): value is UserRole {
  return PERMISSION_MATRIX_ROLES.includes(normalizeUserRole(value) as UserRole);
}

export function applyPermissionOverrides(
  role: string | null | undefined,
  overrides: PermissionOverrideInput[] = [],
): PermissionMatrix {
  const normalized = normalizeUserRole(role);
  const permissions = defaultPermissionsForRole(normalized);

  // Platform super admins stay fully enabled so a tenant-level override cannot
  // lock out the owner/admin rescue path.
  if (normalized === 'super_admin') return permissions;

  for (const override of overrides) {
    if (normalizeUserRole(override.role) !== normalized) continue;
    if (!isPermissionKey(override.permissionKey)) continue;
    permissions[override.permissionKey] = Boolean(override.allowed);
  }

  return permissions;
}

export function hasEffectivePermission(
  permissions: PermissionMatrix | null | undefined,
  permission: PermissionKey,
): boolean {
  return Boolean(permissions?.[permission]);
}

export function canAccessPathWithPermissions(
  permissions: PermissionMatrix | null | undefined,
  path: string,
): boolean {
  return hasEffectivePermission(permissions, getPermissionForPath(path));
}
