import { trpc } from "@/lib/trpc";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useMemo } from "react";

interface RegionSelectProps {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  triggerClassName?: string;
}

export default function RegionSelect({ value, onChange, className, triggerClassName }: RegionSelectProps) {
  const { data: masterData } = trpc.masterData.getAll.useQuery();

  const regions = useMemo(() => {
    if (!masterData) return [];
    return masterData
      .filter(d => d.category === "region")
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
      .map(d => ({
        key: d.key,
        label: d.key,
        multiplier: d.value,
        description: d.description,
      }));
  }, [masterData]);

  // Fallback to hardcoded if master data hasn't loaded yet
  const fallbackRegions = [
    { key: "Canberra", label: "Canberra", multiplier: "1.05", description: "Base region" },
  ];

  const options = regions.length > 0 ? regions : fallbackRegions;

  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className={triggerClassName || "h-9 text-sm"}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent className={className}>
        {options.map(r => (
          <SelectItem key={r.key} value={r.key}>
            {r.label} ({r.multiplier}×)
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
