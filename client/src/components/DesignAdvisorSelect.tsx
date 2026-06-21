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
  const seenValues = new Set<string>();
  const designAdviserOptions = designAdvisers.flatMap((a) => {
    const value = a.name || a.email || `Design Adviser #${a.id}`;
    if (seenValues.has(value)) return [];
    seenValues.add(value);
    return [{ id: a.id, value }];
  });
  const currentValue = value || "__none__";
  const currentIsListed = !value || designAdviserOptions.some((a) => a.value === value);

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
        {designAdviserOptions.map((a) => (
          <SelectItem key={a.id} value={a.value}>
            {a.value}
          </SelectItem>
        ))}
        {designAdviserOptions.length === 0 && (
          <SelectItem value="__no_advisers__" disabled>No design advisers configured</SelectItem>
        )}
      </SelectContent>
    </Select>
  );
}
