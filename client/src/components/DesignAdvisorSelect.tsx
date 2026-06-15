import { trpc } from "@/lib/trpc";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface DesignAdvisorSelectProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export default function DesignAdvisorSelect({ value, onChange, placeholder = "Select advisor..." }: DesignAdvisorSelectProps) {
  const { data: advisors } = trpc.designAdvisors.list.useQuery({});

  // Only show team members with the design_adviser role
  const designAdvisers = advisors?.filter((a) => a.role === "design_adviser") || [];

  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {designAdvisers.map((a) => (
          <SelectItem key={a.id} value={a.name}>{a.name}</SelectItem>
        ))}
        {designAdvisers.length === 0 && (
          <SelectItem value="__none" disabled>No design advisers configured</SelectItem>
        )}
      </SelectContent>
    </Select>
  );
}
