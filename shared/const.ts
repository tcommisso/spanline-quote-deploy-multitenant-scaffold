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
  | 'chat'
  | 'crm'
  | 'sales'
  | 'quotes'
  | 'proposals'
  | 'construction'
  | 'construction_clients'
  | 'construction_schedule'
  | 'construction_calendar_availability'
  | 'construction_project_plan'
  | 'construction_purchase_orders'
  | 'construction_suppliers'
  | 'construction_weather_history'
  | 'construction_rain_days'
  | 'construction_invoice_review'
  | 'construction_component_orders'
  | 'construction_flashing_orders'
  | 'construction_live_tracking'
  | 'construction_plan_converter'
  | 'construction_financials'
  | 'construction_analytics'
  | 'approvals'
  | 'hbcf'
  | 'da_tracker'
  | 'manufacturing'
  | 'manufacturing_orders'
  | 'manufacturing_calendar'
  | 'manufacturing_reports'
  | 'manufacturing_kpi'
  | 'manufacturing_purchase_orders'
  | 'manufacturing_procurement'
  | 'manufacturing_suppliers'
  | 'manufacturing_dispatch'
  | 'manufacturing_drivers'
  | 'manufacturing_delivery_calendar'
  | 'manufacturing_qr_codes'
  | 'inventory'
  | 'tasks'
  | 'finance'
  | 'reporting'
  | 'admin'
  | 'master_data'
  | 'user_management'
  | 'permissions_admin'
  | 'xero'
  | 'support'
  | 'support_help'
  | 'support_process_flows'
  | 'support_bug'
  | 'support_suggestion'
  | 'support_submissions';

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
  chat: 'Chat',
  crm: 'CRM',
  sales: 'Sales',
  quotes: 'Quotes',
  proposals: 'Proposals',
  construction: 'Construction Dashboard',
  construction_clients: 'Active Jobs',
  construction_schedule: 'Work Schedule',
  construction_calendar_availability: 'Calendar Availability',
  construction_project_plan: 'Project Plan',
  construction_purchase_orders: 'Purchase Orders',
  construction_suppliers: 'Construction Suppliers',
  construction_weather_history: 'Weather History',
  construction_rain_days: 'Rain Days',
  construction_invoice_review: 'Invoice Review',
  construction_component_orders: 'Component Orders',
  construction_flashing_orders: 'Flashing Orders',
  construction_live_tracking: 'Construction Live Tracking',
  construction_plan_converter: 'Plan Converter',
  construction_financials: 'Construction Financials',
  construction_analytics: 'Construction Analytics',
  approvals: 'Approvals',
  hbcf: 'HBCF',
  da_tracker: 'DA Tracker',
  manufacturing: 'Manufacturing Dashboard',
  manufacturing_orders: 'Manufacturing Orders',
  manufacturing_calendar: 'Manufacturing Calendar',
  manufacturing_reports: 'Manufacturing Reports',
  manufacturing_kpi: 'Manufacturing KPIs',
  manufacturing_purchase_orders: 'Manufacturing POs',
  manufacturing_procurement: 'Manufacturing Procurement',
  manufacturing_suppliers: 'Manufacturing Suppliers',
  manufacturing_dispatch: 'Manufacturing Dispatch',
  manufacturing_drivers: 'Manufacturing Drivers',
  manufacturing_delivery_calendar: 'Manufacturing Delivery Calendar',
  manufacturing_qr_codes: 'Manufacturing QR Codes',
  inventory: 'Inventory',
  tasks: 'Master Tasks',
  finance: 'Finance',
  reporting: 'Reporting',
  admin: 'Admin',
  master_data: 'Master Data',
  user_management: 'People & Users',
  permissions_admin: 'Permission Matrix',
  xero: 'Xero',
  support: 'Support Section',
  support_help: 'Help Guide',
  support_process_flows: 'Process Flows',
  support_bug: 'Report a Bug',
  support_suggestion: 'Make a Suggestion',
  support_submissions: 'Manage Support Submissions',
};

export const PERMISSION_KEYS = Object.keys(PERMISSION_LABELS) as PermissionKey[];

export const DEFAULT_PERMISSION_MATRIX: Record<UserRole, Record<PermissionKey, boolean>> = {
  super_admin: Object.fromEntries(Object.keys(PERMISSION_LABELS).map(key => [key, true])) as Record<PermissionKey, boolean>,
  admin: {
    app_central: true,
    inbox: true,
    chat: true,
    crm: true,
    sales: true,
    quotes: true,
    proposals: true,
    construction: true,
    construction_clients: true,
    construction_schedule: true,
    construction_calendar_availability: true,
    construction_project_plan: true,
    construction_purchase_orders: true,
    construction_suppliers: true,
    construction_weather_history: true,
    construction_rain_days: true,
    construction_invoice_review: true,
    construction_component_orders: true,
    construction_flashing_orders: true,
    construction_live_tracking: true,
    construction_plan_converter: true,
    construction_financials: true,
    construction_analytics: true,
    approvals: true,
    hbcf: true,
    da_tracker: true,
    manufacturing: true,
    manufacturing_orders: true,
    manufacturing_calendar: true,
    manufacturing_reports: true,
    manufacturing_kpi: true,
    manufacturing_purchase_orders: true,
    manufacturing_procurement: true,
    manufacturing_suppliers: true,
    manufacturing_dispatch: true,
    manufacturing_drivers: true,
    manufacturing_delivery_calendar: true,
    manufacturing_qr_codes: true,
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
    support_help: true,
    support_process_flows: true,
    support_bug: true,
    support_suggestion: true,
    support_submissions: true,
  },
  design_adviser: {
    app_central: true,
    inbox: true,
    chat: true,
    crm: true,
    sales: true,
    quotes: true,
    proposals: true,
    construction: false,
    construction_clients: false,
    construction_schedule: false,
    construction_calendar_availability: false,
    construction_project_plan: false,
    construction_purchase_orders: false,
    construction_suppliers: false,
    construction_weather_history: false,
    construction_rain_days: false,
    construction_invoice_review: false,
    construction_component_orders: false,
    construction_flashing_orders: false,
    construction_live_tracking: false,
    construction_plan_converter: false,
    construction_financials: false,
    construction_analytics: false,
    approvals: false,
    hbcf: false,
    da_tracker: true,
    manufacturing: false,
    manufacturing_orders: false,
    manufacturing_calendar: false,
    manufacturing_reports: false,
    manufacturing_kpi: false,
    manufacturing_purchase_orders: false,
    manufacturing_procurement: false,
    manufacturing_suppliers: false,
    manufacturing_dispatch: false,
    manufacturing_drivers: false,
    manufacturing_delivery_calendar: false,
    manufacturing_qr_codes: false,
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
    support_help: true,
    support_process_flows: true,
    support_bug: true,
    support_suggestion: true,
    support_submissions: false,
  },
  office_user: {
    app_central: true,
    inbox: true,
    chat: true,
    crm: true,
    sales: true,
    quotes: true,
    proposals: true,
    construction: true,
    construction_clients: true,
    construction_schedule: true,
    construction_calendar_availability: true,
    construction_project_plan: true,
    construction_purchase_orders: true,
    construction_suppliers: true,
    construction_weather_history: true,
    construction_rain_days: true,
    construction_invoice_review: true,
    construction_component_orders: true,
    construction_flashing_orders: true,
    construction_live_tracking: true,
    construction_plan_converter: true,
    construction_financials: true,
    construction_analytics: true,
    approvals: true,
    hbcf: true,
    da_tracker: true,
    manufacturing: true,
    manufacturing_orders: true,
    manufacturing_calendar: true,
    manufacturing_reports: true,
    manufacturing_kpi: true,
    manufacturing_purchase_orders: true,
    manufacturing_procurement: true,
    manufacturing_suppliers: true,
    manufacturing_dispatch: true,
    manufacturing_drivers: true,
    manufacturing_delivery_calendar: true,
    manufacturing_qr_codes: true,
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
    support_help: true,
    support_process_flows: true,
    support_bug: true,
    support_suggestion: true,
    support_submissions: false,
  },
  construction_user: {
    app_central: true,
    inbox: true,
    chat: true,
    crm: false,
    sales: false,
    quotes: false,
    proposals: false,
    construction: true,
    construction_clients: true,
    construction_schedule: true,
    construction_calendar_availability: true,
    construction_project_plan: true,
    construction_purchase_orders: true,
    construction_suppliers: true,
    construction_weather_history: true,
    construction_rain_days: true,
    construction_invoice_review: false,
    construction_component_orders: true,
    construction_flashing_orders: true,
    construction_live_tracking: true,
    construction_plan_converter: true,
    construction_financials: false,
    construction_analytics: false,
    approvals: true,
    hbcf: false,
    da_tracker: false,
    manufacturing: false,
    manufacturing_orders: false,
    manufacturing_calendar: false,
    manufacturing_reports: false,
    manufacturing_kpi: false,
    manufacturing_purchase_orders: false,
    manufacturing_procurement: false,
    manufacturing_suppliers: false,
    manufacturing_dispatch: false,
    manufacturing_drivers: false,
    manufacturing_delivery_calendar: false,
    manufacturing_qr_codes: false,
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
    support_help: true,
    support_process_flows: true,
    support_bug: true,
    support_suggestion: true,
    support_submissions: false,
  },
  driver: {
    app_central: true,
    inbox: false,
    chat: true,
    crm: false,
    sales: false,
    quotes: false,
    proposals: false,
    construction: false,
    construction_clients: false,
    construction_schedule: false,
    construction_calendar_availability: false,
    construction_project_plan: false,
    construction_purchase_orders: false,
    construction_suppliers: false,
    construction_weather_history: false,
    construction_rain_days: false,
    construction_invoice_review: false,
    construction_component_orders: false,
    construction_flashing_orders: false,
    construction_live_tracking: false,
    construction_plan_converter: false,
    construction_financials: false,
    construction_analytics: false,
    approvals: false,
    hbcf: false,
    da_tracker: false,
    manufacturing: false,
    manufacturing_orders: false,
    manufacturing_calendar: true,
    manufacturing_reports: false,
    manufacturing_kpi: false,
    manufacturing_purchase_orders: false,
    manufacturing_procurement: false,
    manufacturing_suppliers: false,
    manufacturing_dispatch: true,
    manufacturing_drivers: false,
    manufacturing_delivery_calendar: true,
    manufacturing_qr_codes: false,
    inventory: false,
    tasks: true,
    finance: false,
    reporting: false,
    admin: false,
    master_data: false,
    user_management: false,
    permissions_admin: false,
    xero: false,
    support: false,
    support_help: false,
    support_process_flows: false,
    support_bug: false,
    support_suggestion: false,
    support_submissions: false,
  },
  warehouse: {
    app_central: true,
    inbox: true,
    chat: true,
    crm: false,
    sales: false,
    quotes: false,
    proposals: false,
    construction: false,
    construction_clients: false,
    construction_schedule: false,
    construction_calendar_availability: false,
    construction_project_plan: false,
    construction_purchase_orders: false,
    construction_suppliers: false,
    construction_weather_history: false,
    construction_rain_days: false,
    construction_invoice_review: false,
    construction_component_orders: false,
    construction_flashing_orders: false,
    construction_live_tracking: false,
    construction_plan_converter: false,
    construction_financials: false,
    construction_analytics: false,
    approvals: false,
    hbcf: false,
    da_tracker: false,
    manufacturing: true,
    manufacturing_orders: true,
    manufacturing_calendar: true,
    manufacturing_reports: true,
    manufacturing_kpi: false,
    manufacturing_purchase_orders: true,
    manufacturing_procurement: true,
    manufacturing_suppliers: true,
    manufacturing_dispatch: true,
    manufacturing_drivers: true,
    manufacturing_delivery_calendar: true,
    manufacturing_qr_codes: true,
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
    support_help: true,
    support_process_flows: true,
    support_bug: true,
    support_suggestion: true,
    support_submissions: false,
  },
  user: Object.fromEntries(Object.keys(PERMISSION_LABELS).map(key => [
    key,
    key === 'app_central'
      || key === 'support'
      || key === 'support_help'
      || key === 'support_process_flows'
      || key === 'support_bug'
      || key === 'support_suggestion',
  ])) as Record<PermissionKey, boolean>,
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
  { prefix: '/admin/invoice-review', permission: 'construction_invoice_review' },
  { prefix: '/admin/subscriptions', permission: 'finance' },
  { prefix: '/admin/saas-billing', permission: 'finance' },
  { prefix: '/admin/render-costs', permission: 'finance' },
  { prefix: '/admin/support-submissions', permission: 'support_submissions' },
  { prefix: '/admin/suppliers', permission: 'construction_suppliers' },
  { prefix: '/admin/supplier-feedback', permission: 'finance' },
  { prefix: '/construction/ba-calendar', permission: 'approvals' },
  { prefix: '/construction/jobs', permission: 'construction_clients' },
  { prefix: '/construction/clients', permission: 'construction_clients' },
  { prefix: '/construction/schedule', permission: 'construction_schedule' },
  { prefix: '/construction/project-plan', permission: 'construction_project_plan' },
  { prefix: '/construction/purchase-orders', permission: 'construction_purchase_orders' },
  { prefix: '/construction/weather-history', permission: 'construction_weather_history' },
  { prefix: '/construction/rain-days', permission: 'construction_rain_days' },
  { prefix: '/construction/component-orders', permission: 'construction_component_orders' },
  { prefix: '/construction/smartshop', permission: 'construction_component_orders' },
  { prefix: '/construction/flashing-orders', permission: 'construction_flashing_orders' },
  { prefix: '/construction/live-tracking', permission: 'construction_live_tracking' },
  { prefix: '/construction/financials', permission: 'construction_financials' },
  { prefix: '/construction/analytics', permission: 'construction_analytics' },
  { prefix: '/calendar-availability', permission: 'construction_calendar_availability' },
  { prefix: '/plan-converter', permission: 'construction_plan_converter' },
  { prefix: '/manufacturing/flashing-orders', permission: 'manufacturing_orders' },
  { prefix: '/manufacturing/transition-assistant', permission: 'manufacturing_orders' },
  { prefix: '/manufacturing/orders', permission: 'manufacturing_orders' },
  { prefix: '/manufacturing/calendar', permission: 'manufacturing_calendar' },
  { prefix: '/manufacturing/reports', permission: 'manufacturing_reports' },
  { prefix: '/manufacturing/kpi', permission: 'manufacturing_kpi' },
  { prefix: '/manufacturing/purchase-orders', permission: 'manufacturing_purchase_orders' },
  { prefix: '/manufacturing/procurement', permission: 'manufacturing_procurement' },
  { prefix: '/manufacturing/suppliers', permission: 'manufacturing_suppliers' },
  { prefix: '/manufacturing/dispatch', permission: 'manufacturing_dispatch' },
  { prefix: '/manufacturing/drivers', permission: 'manufacturing_drivers' },
  { prefix: '/manufacturing/delivery-calendar', permission: 'manufacturing_delivery_calendar' },
  { prefix: '/manufacturing/qr-codes', permission: 'manufacturing_qr_codes' },
  { prefix: '/manufacturing/stocktake', permission: 'inventory' },
  { prefix: '/crm/reports', permission: 'reporting' },
  { prefix: '/analytics', permission: 'reporting' },
  { prefix: '/manufacturing', permission: 'manufacturing' },
  { prefix: '/inventory', permission: 'inventory' },
  { prefix: '/approvals/hbcf', permission: 'hbcf' },
  { prefix: '/approvals', permission: 'approvals' },
  { prefix: '/da-tracker', permission: 'da_tracker' },
  { prefix: '/tasks', permission: 'tasks' },
  { prefix: '/chat', permission: 'chat' },
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
  { prefix: '/construction/chat', permission: 'chat' },
  { prefix: '/construction', permission: 'construction' },
  { prefix: '/inbox', permission: 'inbox' },
  { prefix: '/admin', permission: 'admin' },
  { prefix: '/support/bug', permission: 'support_bug' },
  { prefix: '/support/suggestion', permission: 'support_suggestion' },
  { prefix: '/support', permission: 'support' },
  { prefix: '/help', permission: 'support_help' },
  { prefix: '/process-flows', permission: 'support_process_flows' },
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
