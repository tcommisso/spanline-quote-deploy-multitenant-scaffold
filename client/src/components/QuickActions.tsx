import { useLocation } from "wouter";
import { getSectionForPath } from "@/lib/appSections";
import { useAuth } from "@/_core/hooks/useAuth";
import { isAdminRole, type UserRole } from "@shared/const";
import {
  Plus,
  UserPlus,
  Package,
  Truck,
  ClipboardList,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";

type QuickAction = {
  label: string;
  icon: LucideIcon;
  path: string;
  roles?: UserRole[];
};

const SECTION_ACTIONS: Record<string, QuickAction[]> = {
  crm: [
    { label: "New Lead", icon: UserPlus, path: "/crm/leads?action=new" },
  ],
  construction: [
    { label: "Schedule", icon: ClipboardList, path: "/construction/schedule" },
  ],
  manufacturing: [
    { label: "New Order", icon: Package, path: "/manufacturing/orders?action=new" },
    { label: "Dispatch", icon: Truck, path: "/manufacturing/dispatch" },
  ],
  inventory: [
    { label: "New PO", icon: Plus, path: "/inventory/procurement?action=new" },
    { label: "Stocktake", icon: ClipboardList, path: "/inventory/stocktake" },
  ],
};

export function QuickActions() {
  const [location, setLocation] = useLocation();
  const { user } = useAuth();
  const section = getSectionForPath(location);

  if (!section || !SECTION_ACTIONS[section]) return null;

  const role = (user?.role || "user") as UserRole;
  const actions = SECTION_ACTIONS[section].filter(
    (a) => !a.roles || a.roles.includes(role) || isAdminRole(role)
  );

  if (actions.length === 0) return null;

  return (
    <div className="hidden md:flex items-center gap-2 px-4 py-2 border-b bg-muted/30 overflow-x-auto">
      {actions.map((action) => (
        <Button
          key={action.path}
          variant="outline"
          size="sm"
          className="gap-1.5 shrink-0 text-xs h-7"
          onClick={() => setLocation(action.path)}
        >
          <action.icon className="h-3.5 w-3.5" />
          {action.label}
        </Button>
      ))}
    </div>
  );
}
