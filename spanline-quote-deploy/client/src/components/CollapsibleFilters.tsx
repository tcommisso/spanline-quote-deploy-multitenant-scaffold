import { useState } from "react";
import { ChevronDown, ChevronUp, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";

interface CollapsibleFiltersProps {
  children: React.ReactNode;
  /** Label shown on the toggle button */
  label?: string;
  /** Default collapsed state on mobile */
  defaultCollapsed?: boolean;
}

/**
 * Wraps filter controls in a collapsible section that only collapses on mobile.
 * On desktop (sm+), filters are always visible.
 */
export default function CollapsibleFilters({
  children,
  label = "Filters",
  defaultCollapsed = true,
}: CollapsibleFiltersProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  return (
    <div className="w-full">
      {/* Toggle button — only visible on mobile */}
      <div className="sm:hidden mb-2">
        <Button
          variant="outline"
          size="sm"
          className="w-full justify-between text-xs h-8"
          onClick={() => setCollapsed(!collapsed)}
        >
          <span className="flex items-center gap-1.5">
            <SlidersHorizontal className="h-3.5 w-3.5" />
            {label}
          </span>
          {collapsed ? (
            <ChevronDown className="h-3.5 w-3.5" />
          ) : (
            <ChevronUp className="h-3.5 w-3.5" />
          )}
        </Button>
      </div>

      {/* Filter content — hidden on mobile when collapsed, always visible on sm+ */}
      <div
        className={`${
          collapsed ? "hidden sm:flex" : "flex"
        } flex-wrap items-center gap-2`}
      >
        {children}
      </div>
    </div>
  );
}
