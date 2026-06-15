import { trpc } from "@/lib/trpc";
import { useMemo } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";

interface CouncilSelectProps {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  placeholder?: string;
}

export default function CouncilSelect({ value, onChange, className, placeholder = "Select council..." }: CouncilSelectProps) {
  const { data: councilData } = trpc.masterData.getByCategory.useQuery({ category: "council_fee" });

  const councils = useMemo(() => {
    if (!councilData) return [];
    // Extract unique keys from council_fee master data
    const keys = councilData.map((d: any) => d.key as string);
    return Array.from(new Set(keys)).sort();
  }, [councilData]);

  if (!councilData || councils.length === 0) {
    // Fallback to text input if no master data loaded yet
    return <Input value={value} onChange={(e) => onChange(e.target.value)} className={className || "h-9 text-sm"} placeholder={placeholder} />;
  }

  return (
    <Select value={value || undefined} onValueChange={onChange}>
      <SelectTrigger className={className || "h-9 text-sm"}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {councils.map((council) => (
          <SelectItem key={council} value={council}>
            {council}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
