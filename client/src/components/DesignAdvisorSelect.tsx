import { trpc } from "@/lib/trpc";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface DesignAdvisorSelectProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export default function DesignAdvisorSelect({ value, onChange, placeholder = "Select advisor..." }: DesignAdvisorSelectProps) {
  const { data: advisors } = trpc.designAdvisors.list.useQuery({});

  // The backend scopes and syncs this list from tenant users; do not re-filter
  // by local role here because legacy adviser rows may not have been normalised yet.
  const designAdvisers = advisors?.filter((a) => !a.archived) || [];

  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {designAdvisers.map((a) => (
          <SelectItem key={a.id} value={a.name || a.email || `Design Adviser #${a.id}`}>
            {a.name || a.email || `Design Adviser #${a.id}`}
          </SelectItem>
        ))}
        {designAdvisers.length === 0 && (
          <SelectItem value="__none" disabled>No design advisers configured</SelectItem>
        )}
      </SelectContent>
    </Select>
  );
}
