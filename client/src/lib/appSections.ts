import { type AppCentralSectionId } from "@shared/navigation-config";
import { type UserRole } from "@shared/const";
import {
  BarChart3,
  ClipboardCheck,
  Contact,
  Factory,
  FileText,
  HardHat,
  Inbox,
  LayoutDashboard,
  MapPin,
  MessageSquare,
  Shield,
  Wallet,
  Warehouse,
  type LucideIcon,
} from "lucide-react";

export type AppSection = {
  id: string;
  label: string;
  description: string;
  icon: LucideIcon;
  path: string;
  color: string;
  bgColor: string;
  accentHex: string;
  allowedRoles: UserRole[] | "all";
};

const MODULE_ACCENT_KEYS: Record<string, string> = {
  inbox: "modInbox",
  chat: "modChat",
  crm: "modCrm",
  sales: "modSales",
  construction: "modBuild",
  manufacturing: "modManufacturing",
  inventory: "modInventory",
  approvals: "modApprovals",
  da_tracker: "modDaTracker",
  finance: "modFinance",
  reporting: "modReporting",
  admin: "modAdmin",
};

function isValidHexColour(value: unknown): value is string {
  return typeof value === "string" && /^#[0-9A-Fa-f]{6}$/.test(value);
}

export function getReadableTextColor(hex: string) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.62 ? "#06162D" : "#FFFFFF";
}

export function getSectionAccentHex(section: Pick<AppSection, "id" | "accentHex">, colours?: Record<string, string> | null) {
  const key = MODULE_ACCENT_KEYS[section.id];
  const saved = key ? colours?.[key] : undefined;
  return isValidHexColour(saved) ? saved : section.accentHex;
}

export const APP_SECTIONS: AppSection[] = [
  {
    id: "inbox",
    label: "Inbox",
    description: "Messages & notifications",
    icon: Inbox,
    path: "/inbox",
    color: "text-[#C9AB57]",
    bgColor: "bg-white border-[#E5E7EB]",
    accentHex: "#C9AB57",
    allowedRoles: "all",
  },
  {
    id: "chat",
    label: "Chat",
    description: "Team and job messages",
    icon: MessageSquare,
    path: "/chat",
    color: "text-[#2563EB]",
    bgColor: "bg-white border-[#E5E7EB]",
    accentHex: "#2563EB",
    allowedRoles: ["super_admin", "admin", "design_adviser", "office_user", "construction_user", "driver", "warehouse"],
  },
  {
    id: "crm",
    label: "CRM",
    description: "Leads, clients & pipeline",
    icon: Contact,
    path: "/crm/leads",
    color: "text-[#3B5EA7]",
    bgColor: "bg-white border-[#E5E7EB]",
    accentHex: "#3B5EA7",
    allowedRoles: ["super_admin", "admin", "design_adviser", "office_user"],
  },
  {
    id: "sales",
    label: "Sales",
    description: "Quotes, proposals & analytics",
    icon: LayoutDashboard,
    path: "/sales",
    color: "text-[#22994A]",
    bgColor: "bg-white border-[#E5E7EB]",
    accentHex: "#22994A",
    allowedRoles: ["super_admin", "admin", "design_adviser", "office_user", "construction_user"],
  },
  {
    id: "construction",
    label: "Build",
    description: "Clients, jobs & tracking",
    icon: HardHat,
    path: "/construction/clients",
    color: "text-[#C97812]",
    bgColor: "bg-white border-[#E5E7EB]",
    accentHex: "#C97812",
    allowedRoles: ["super_admin", "admin", "office_user", "construction_user"],
  },
  {
    id: "proposals",
    label: "Proposals",
    description: "Documents, sign-off & contracts",
    icon: FileText,
    path: "/proposals",
    color: "text-[#0E7490]",
    bgColor: "bg-white border-[#E5E7EB]",
    accentHex: "#0E7490",
    allowedRoles: ["super_admin", "admin", "design_adviser", "office_user"],
  },
  {
    id: "manufacturing",
    label: "Manufacturing",
    description: "Orders, dispatch & drivers",
    icon: Factory,
    path: "/manufacturing",
    color: "text-[#6D33CC]",
    bgColor: "bg-white border-[#E5E7EB]",
    accentHex: "#6D33CC",
    allowedRoles: ["super_admin", "admin", "office_user", "construction_user", "warehouse"],
  },
  {
    id: "inventory",
    label: "Inventory",
    description: "Stock, procurement & suppliers",
    icon: Warehouse,
    path: "/inventory/dashboard",
    color: "text-[#CC5A10]",
    bgColor: "bg-white border-[#E5E7EB]",
    accentHex: "#CC5A10",
    allowedRoles: ["super_admin", "admin", "office_user", "warehouse"],
  },
  {
    id: "approvals",
    label: "Approvals",
    description: "Building approvals & workflow",
    icon: ClipboardCheck,
    path: "/approvals",
    color: "text-[#0A7A9E]",
    bgColor: "bg-white border-[#E5E7EB]",
    accentHex: "#0A7A9E",
    allowedRoles: ["super_admin", "admin", "office_user", "construction_user"],
  },
  {
    id: "da_tracker",
    label: "DA Tracker",
    description: "Development applications & map",
    icon: MapPin,
    path: "/da-tracker",
    color: "text-[#0A72A8]",
    bgColor: "bg-white border-[#E5E7EB]",
    accentHex: "#0A72A8",
    allowedRoles: ["super_admin", "admin", "office_user", "design_adviser"],
  },
  {
    id: "finance",
    label: "Finance",
    description: "Commissions, invoices & costs",
    icon: Wallet,
    path: "/admin/da-commissions",
    color: "text-[#157A3B]",
    bgColor: "bg-white border-[#E5E7EB]",
    accentHex: "#157A3B",
    allowedRoles: ["super_admin", "admin", "office_user"],
  },
  {
    id: "reporting",
    label: "Reporting",
    description: "Analytics, KPIs & reports",
    icon: BarChart3,
    path: "/analytics",
    color: "text-[#4840C7]",
    bgColor: "bg-white border-[#E5E7EB]",
    accentHex: "#4840C7",
    allowedRoles: ["super_admin", "admin", "office_user"],
  },
  {
    id: "admin",
    label: "Admin",
    description: "Settings, data & users",
    icon: Shield,
    path: "/admin/company-settings",
    color: "text-[#475569]",
    bgColor: "bg-white border-[#E5E7EB]",
    accentHex: "#475569",
    allowedRoles: ["super_admin", "admin"],
  },
];

export function getVisibleSections(
  role: UserRole,
  canAccessPath?: (path: string) => boolean,
  configuredSectionIds?: readonly AppCentralSectionId[],
): AppSection[] {
  const accessibleSections = APP_SECTIONS.filter((section) => {
    if (canAccessPath) return canAccessPath(section.path);
    return section.allowedRoles === "all" || section.allowedRoles.includes(role);
  });

  if (!configuredSectionIds) return accessibleSections;

  const sectionById = new Map(accessibleSections.map(section => [section.id, section]));
  return configuredSectionIds
    .map(sectionId => sectionById.get(sectionId))
    .filter(Boolean) as AppSection[];
}

export function getSectionForPath(path: string): string | null {
  if (path.startsWith("/inbox")) return "inbox";
  if (path.startsWith("/chat") || path.startsWith("/construction/chat")) return "chat";
  if (path.startsWith("/crm") || path.startsWith("/calls")) return "crm";
  if (path.startsWith("/proposals")) return "proposals";
  if (path.startsWith("/sales") || path === "/quotes" || path.startsWith("/quotes") || path.startsWith("/deck-quotes") || path.startsWith("/eclipse-quotes") || path.startsWith("/security-screens") || path.startsWith("/blinds") || path.startsWith("/patio-planner")) return "sales";
  if (path.startsWith("/approvals")) return "approvals";
  if (path.startsWith("/da-tracker")) return "da_tracker";
  if (path.startsWith("/construction/analytics") || path === "/analytics" || path.startsWith("/manufacturing/kpi") || path === "/crm/reports") return "reporting";
  if (path.startsWith("/construction/financials") || path.startsWith("/admin/da-commissions") || path.startsWith("/admin/da-invoices") || path.startsWith("/admin/subscriptions") || path.startsWith("/admin/render-costs") || path.startsWith("/admin/supplier-feedback")) return "finance";
  if (path.startsWith("/construction") || path.startsWith("/calendar-availability") || path.startsWith("/plan-converter") || path.startsWith("/admin/suppliers")) return "construction";
  if (path.startsWith("/manufacturing")) return "manufacturing";
  if (path.startsWith("/inventory")) return "inventory";
  if (path.startsWith("/admin") || path.startsWith("/xero-settings")) return "admin";
  return null;
}
