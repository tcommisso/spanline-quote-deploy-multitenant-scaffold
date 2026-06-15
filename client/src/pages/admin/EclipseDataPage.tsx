import EclipsePricingAdmin from "@/components/EclipsePricingAdmin";
import EclipseProposalImages from "@/components/EclipseProposalImages";
import { trpc } from "@/lib/trpc";
import { Clock } from "lucide-react";

export default function EclipseDataPage() {
  const { data, dataUpdatedAt } = trpc.eclipseRoof.pricing.getAll.useQuery();

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Eclipse Data</h1>
          <p className="text-sm text-muted-foreground">Manage Eclipse louvre pricing, labour rates, component costs, and proposal diagrams</p>
        </div>
        {data && !data.isDefault && dataUpdatedAt > 0 && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground bg-muted/50 px-2.5 py-1 rounded-md">
            <Clock className="h-3 w-3" />
            <span>Last fetched: {new Date(dataUpdatedAt).toLocaleString()}</span>
          </div>
        )}
      </div>

      {/* Proposal Diagrams */}
      <EclipseProposalImages />

      {/* Pricing Admin */}
      <EclipsePricingAdmin />
    </div>
  );
}
