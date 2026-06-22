import {
  BarChart3,
  ClipboardCheck,
  Contact,
  Factory,
  FileText,
  HardHat,
  HelpCircle,
  Inbox,
  LayoutDashboard,
  MapPin,
  MessageSquare,
  Shield,
  Wallet,
  Warehouse,
  type LucideIcon,
} from "lucide-react";
import { MOBILE_NAV_ITEM_IDS, type MobileNavItemId } from "@shared/navigation-config";

export type NavigationDestination = {
  id: MobileNavItemId;
  icon: LucideIcon;
  label: string;
  path: string;
};

export const MOBILE_NAV_DESTINATIONS: Record<MobileNavItemId, NavigationDestination> = {
  app_central: { id: "app_central", icon: LayoutDashboard, label: "App Central", path: "/" },
  inbox: { id: "inbox", icon: Inbox, label: "Inbox", path: "/inbox" },
  chat: { id: "chat", icon: MessageSquare, label: "Chat", path: "/chat" },
  crm: { id: "crm", icon: Contact, label: "CRM", path: "/crm/leads" },
  sales: { id: "sales", icon: LayoutDashboard, label: "Sales", path: "/sales" },
  construction: { id: "construction", icon: HardHat, label: "Build", path: "/construction/clients" },
  proposals: { id: "proposals", icon: FileText, label: "Proposals", path: "/proposals" },
  manufacturing: { id: "manufacturing", icon: Factory, label: "Manufacturing", path: "/manufacturing" },
  inventory: { id: "inventory", icon: Warehouse, label: "Inventory", path: "/inventory/dashboard" },
  approvals: { id: "approvals", icon: ClipboardCheck, label: "Approvals", path: "/approvals" },
  da_tracker: { id: "da_tracker", icon: MapPin, label: "DA Tracker", path: "/da-tracker" },
  finance: { id: "finance", icon: Wallet, label: "Finance", path: "/admin/da-commissions" },
  reporting: { id: "reporting", icon: BarChart3, label: "Reporting", path: "/analytics" },
  admin: { id: "admin", icon: Shield, label: "Admin", path: "/admin/company-settings" },
  support: { id: "support", icon: HelpCircle, label: "Help", path: "/help" },
};

export const MOBILE_NAV_DESTINATION_LIST = MOBILE_NAV_ITEM_IDS.map(itemId => MOBILE_NAV_DESTINATIONS[itemId]);
