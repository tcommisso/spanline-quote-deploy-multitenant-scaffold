/**
 * User roles constant for server-side use
 */
export const USER_ROLES = [
  { value: "user", label: "Unassigned" },
  { value: "admin", label: "Admin (Legacy)" },
  { value: "super_admin", label: "Super Admin" },
  { value: "design_adviser", label: "Design Adviser" },
  { value: "office_user", label: "Office User" },
  { value: "construction_user", label: "Construction User" },
  { value: "driver", label: "Driver" },
  { value: "warehouse", label: "Warehouse" },
] as const;
