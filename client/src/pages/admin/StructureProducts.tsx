import ProductTable from "@/components/ProductTable";
import { trpc } from "@/lib/trpc";
import { Clock } from "lucide-react";

export default function StructureProducts() {
  const { data: products } = trpc.products.getAll.useQuery();
  const productRows = Array.isArray(products) ? products : [];

  const lastUpdated = productRows.reduce((latest, p) => {
        const t = new Date(p.updatedAt).getTime();
        return Number.isFinite(t) && t > latest ? t : latest;
      }, 0);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Products</h1>
          <p className="text-sm text-muted-foreground">Manage structure product catalog, pricing, and categories</p>
        </div>
        {lastUpdated > 0 && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground bg-muted/50 px-2.5 py-1 rounded-md">
            <Clock className="h-3 w-3" />
            <span>Last updated: {new Date(lastUpdated).toLocaleString()}</span>
          </div>
        )}
      </div>
      <ProductTable />
    </div>
  );
}
