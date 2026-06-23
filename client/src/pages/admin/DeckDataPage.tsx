import DeckMasterData from "@/components/DeckMasterData";
import ErrorBoundary from "@/components/ErrorBoundary";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { trpc } from "@/lib/trpc";
import { AlertTriangle, Clock } from "lucide-react";

export default function DeckDataPage() {
  const { data: products, error: productsError, isError: hasProductsError } = trpc.deck.products.list.useQuery({});
  const productRows = Array.isArray(products) ? products : [];
  const hasUnexpectedProductsShape = products !== undefined && !Array.isArray(products);

  const lastUpdated = productRows.reduce((latest, p) => {
        const t = new Date(p.updatedAt).getTime();
        return Number.isFinite(t) && t > latest ? t : latest;
      }, 0);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Deck Data</h1>
          <p className="text-sm text-muted-foreground">Manage deck products, framing, labour rates, pricing, and add-ons</p>
        </div>
        {lastUpdated > 0 && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground bg-muted/50 px-2.5 py-1 rounded-md">
            <Clock className="h-3 w-3" />
            <span>Last updated: {new Date(lastUpdated).toLocaleString()}</span>
          </div>
        )}
      </div>
      {(hasProductsError || hasUnexpectedProductsShape) && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Deck data could not be loaded cleanly</AlertTitle>
          <AlertDescription>
            {productsError?.message || "The deck products response was not in the expected list format. Reload the page and check server logs if it continues."}
          </AlertDescription>
        </Alert>
      )}
      <ErrorBoundary inline>
        <DeckMasterData />
      </ErrorBoundary>
    </div>
  );
}
