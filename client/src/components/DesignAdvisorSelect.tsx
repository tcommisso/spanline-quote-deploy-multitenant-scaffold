import { trpc } from "@/lib/trpc";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface DesignAdvisorSelectProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export default function DesignAdvisorSelect({ value, onChange, placeholder = "Select advisor..." }: DesignAdvisorSelectProps) {
  const { data: advisors } = trpc.designAdvisors.list.useQuery({ includePendingInvites: true });

  // The backend scopes and syncs this list from tenant users; do not re-filter
  // by local role here because legacy adviser rows may not have been normalised yet.
  const designAdvisers = advisors?.filter((a) => !a.archived) || [];
  const currentValue = value || "__none__";
  const currentIsListed = !value || designAdvisers.some((a) => (a.name || a.email || `Design Adviser #${a.id}`) === value);

  return (
    <Select value={currentValue} onValueChange={(next) => onChange(next === "__none__" ? "" : next)}>
      <SelectTrigger>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="__none__">Unassigned</SelectItem>
        {value && !currentIsListed && (
          <SelectItem value={value}>{value}</SelectItem>
        )}
        {designAdvisers.map((a) => (
          <SelectItem key={a.id} value={a.name || a.email || `Design Adviser #${a.id}`}>
            {a.name || a.email || `Design Adviser #${a.id}`}
          </SelectItem>
        ))}
        {designAdvisers.length === 0 && (
          <SelectItem value="__no_advisers__" disabled>No design advisers configured</SelectItem>
        )}
      </SelectContent>
    </Select>
  );
}
