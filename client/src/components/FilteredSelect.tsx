import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useState, useMemo } from "react";
import { cn } from "@/lib/utils";

export interface FilteredSelectCategory {
  id: string;
  label: string;
  options: string[];
}

interface FilteredSelectProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  categories: FilteredSelectCategory[];
  /** If true, show "All" tab to see all options across categories */
  showAllTab?: boolean;
}

/**
 * A select dropdown with category pill tabs above it.
 * User picks a category first, then selects from filtered options within that category.
 * If the current value belongs to a different category, it auto-selects that category.
 */
export default function FilteredSelect({ label, value, onChange, categories, showAllTab = true }: FilteredSelectProps) {
  // Determine which category the current value belongs to
  const valueCategory = useMemo(() => {
    if (!value) return null;
    for (const cat of categories) {
      if (cat.options.includes(value)) return cat.id;
    }
    return null;
  }, [value, categories]);

  const [activeCategory, setActiveCategory] = useState<string | null>(valueCategory);

  // All options flattened
  const allOptions = useMemo(() => {
    const opts: string[] = [];
    for (const cat of categories) {
      for (const opt of cat.options) {
        if (!opts.includes(opt)) opts.push(opt);
      }
    }
    return opts;
  }, [categories]);

  // Filtered options based on active category
  const filteredOptions = useMemo(() => {
    if (!activeCategory || activeCategory === "__all__") return allOptions;
    const cat = categories.find(c => c.id === activeCategory);
    return cat ? cat.options : allOptions;
  }, [activeCategory, categories, allOptions]);

  // Auto-switch category when value changes externally
  const effectiveCategory = valueCategory && !activeCategory ? valueCategory : activeCategory;

  return (
    <div className="space-y-1.5 min-w-0">
      <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
      {/* Category pill tabs */}
      {categories.length > 1 && (
        <div className="flex flex-wrap gap-1 mb-1">
          {showAllTab && (
            <button
              type="button"
              onClick={() => setActiveCategory("__all__")}
              className={cn(
                "px-2 py-0.5 text-[10px] font-medium rounded-full border transition-colors",
                (!effectiveCategory || effectiveCategory === "__all__")
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-muted/50 text-muted-foreground border-border hover:bg-muted"
              )}
            >
              All
            </button>
          )}
          {categories.map(cat => (
            <button
              key={cat.id}
              type="button"
              onClick={() => setActiveCategory(cat.id)}
              className={cn(
                "px-2 py-0.5 text-[10px] font-medium rounded-full border transition-colors",
                effectiveCategory === cat.id
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-muted/50 text-muted-foreground border-border hover:bg-muted"
              )}
            >
              {cat.label}
            </button>
          ))}
        </div>
      )}
      {/* Select dropdown */}
      <Select value={value || "__none__"} onValueChange={(v) => onChange(v === "__none__" ? "" : v)}>
        <SelectTrigger className="h-8 text-sm [&>span]:truncate">
          <SelectValue placeholder={`Select ${label.toLowerCase()}...`} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__none__">— None —</SelectItem>
          {filteredOptions.map((opt) => (
            <SelectItem key={opt} value={opt}>{opt}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
