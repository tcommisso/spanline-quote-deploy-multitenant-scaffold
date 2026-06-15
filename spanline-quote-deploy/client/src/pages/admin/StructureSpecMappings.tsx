import SpecMappingsAdmin from "@/pages/SpecMappingsAdmin";
import { trpc } from "@/lib/trpc";
import { Clock } from "lucide-react";

export default function StructureSpecMappings() {
  const { data: mappings } = trpc.specItems.mappings.list.useQuery();

  const lastUpdated = mappings
    ? mappings.reduce((latest, m) => {
        const t = new Date(m.updatedAt).getTime();
        return t > latest ? t : latest;
      }, 0)
    : 0;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Spec Mappings</h1>
          <p className="text-sm text-muted-foreground">Configure automatic product selection rules based on quote specifications</p>
        </div>
        {lastUpdated > 0 && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground bg-muted/50 px-2.5 py-1 rounded-md">
            <Clock className="h-3 w-3" />
            <span>Last updated: {new Date(lastUpdated).toLocaleString()}</span>
          </div>
        )}
      </div>
      <SpecMappingsAdmin />
    </div>
  );
}
