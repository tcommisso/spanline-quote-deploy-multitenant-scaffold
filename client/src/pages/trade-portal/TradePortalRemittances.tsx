import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Receipt, Download } from "lucide-react";

export default function TradePortalRemittances() {
  const { data: remittances, isLoading } = trpc.tradePortal.getRemittances.useQuery();

  if (isLoading) {
    return <div className="space-y-4"><Skeleton className="h-8 w-48" /><Skeleton className="h-24" /><Skeleton className="h-24" /></div>;
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-slate-800">Remittance Advice</h1>
        <p className="text-sm text-muted-foreground">View payment remittances from the office</p>
      </div>

      {remittances && remittances.length > 0 ? (
        <div className="space-y-3">
          {remittances.map((rem) => (
            <Card key={rem.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 bg-green-100 rounded-lg shrink-0">
                        <Receipt className="w-4 h-4 text-green-600" />
                      </div>
                      <p className="font-medium text-sm truncate">{rem.reference || `Remittance #${rem.id}`}</p>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 ml-8">
                      {new Date(rem.date).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}
                    </p>
                    {rem.notes && <p className="text-xs text-slate-600 mt-1 ml-8 line-clamp-2">{rem.notes}</p>}
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-bold text-base sm:text-lg text-green-700">
                      ${Number(rem.amount || 0).toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </p>
                    {rem.fileUrl && (
                      <Button variant="ghost" size="sm" className="mt-1 h-7 text-xs" asChild>
                        <a href={rem.fileUrl} target="_blank" rel="noopener noreferrer">
                          <Download className="w-3 h-3 mr-1" /> PDF
                        </a>
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="py-12 text-center">
            <Receipt className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">No remittance advice available yet</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
