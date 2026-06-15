export const COOKIE_NAME = "app_session_id";
export const IMPERSONATE_COOKIE_NAME = "app_impersonate_id";
export const ONE_YEAR_MS = 1000 * 60 * 60 * 24 * 365;
export const EIGHT_HOURS_MS = 1000 * 60 * 60 * 8;
export const AXIOS_TIMEOUT_MS = 30_000;
export const UNAUTHED_ERR_MSG = 'Please login (10001)';
export const NOT_ADMIN_ERR_MSG = 'You do not have required permission (10002)';

// ─── Role System ────────────────────────────────────────────────────────────
export type UserRole = 'user' | 'admin' | 'super_admin' | 'design_adviser' | 'office_user' | 'construction_user' | 'driver' | 'warehouse';

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

export function isAdminRole(role: string): boolean {
  return ADMIN_ROLES.includes(role as UserRole);
}

// Permission matrix
export const PERMISSIONS = {
  quotes_view: ['super_admin', 'admin', 'design_adviser', 'office_user', 'construction_user'],
  quotes_create: ['super_admin', 'admin', 'design_adviser', 'office_user', 'construction_user'],
  quotes_edit: ['super_admin', 'admin', 'design_adviser', 'office_user', 'construction_user'],
  job_financials: ['super_admin', 'admin', 'office_user', 'construction_user'],
  master_data: ['super_admin', 'admin'],
  user_management: ['super_admin'],
  crm: ['super_admin', 'admin', 'design_adviser', 'office_user'],
  proposals: ['super_admin', 'admin', 'design_adviser', 'office_user'],
  email_templates: ['super_admin', 'admin', 'office_user'],
  analytics: ['super_admin', 'admin', 'office_user'],
} as const;

export function hasPermission(role: string, permission: keyof typeof PERMISSIONS): boolean {
  return (PERMISSIONS[permission] as readonly string[])?.includes(role) ?? false;
}
