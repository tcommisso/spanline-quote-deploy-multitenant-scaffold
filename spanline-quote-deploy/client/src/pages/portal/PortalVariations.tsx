import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ClipboardList, Check, X } from "lucide-react";
import { toast } from "sonner";

export default function PortalVariations() {
  const variationsQuery = trpc.portal.getVariations.useQuery();
  const utils = trpc.useUtils();
  
  const approveMutation = trpc.portal.approveVariation.useMutation({
    onSuccess: () => {
      toast.success("Variation approved");
      utils.portal.getVariations.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const rejectMutation = trpc.portal.rejectVariation.useMutation({
    onSuccess: () => {
      toast.success("Variation rejected");
      utils.portal.getVariations.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const statusColor = (status: string) => {
    switch (status) {
      case "approved": return "bg-green-100 text-green-700";
      case "rejected": return "bg-red-100 text-red-700";
      case "pending": return "bg-primary/10 text-primary";
      default: return "bg-gray-100 text-gray-700";
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold">Variations</h1>
        <p className="text-sm text-muted-foreground">Project changes and approval requests</p>
      </div>

      {variationsQuery.isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-24 w-full" />)}
        </div>
      ) : !variationsQuery.data?.length ? (
        <Card>
          <CardContent className="py-12 text-center">
            <ClipboardList className="w-12 h-12 mx-auto mb-4 text-muted-foreground/50" />
            <p className="text-muted-foreground">No variations</p>
            <p className="text-sm text-muted-foreground mt-1">Any project changes requiring your approval will appear here.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {variationsQuery.data.map((v) => (
            <Card key={v.id}>
              <CardContent className="pt-6">
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-1 sm:gap-3 mb-3">
                  <div>
                    <p className="font-medium text-sm sm:text-base">{v.title}</p>
                    <Badge className={`text-xs mt-1 ${statusColor(v.status)}`}>
                      {v.status}
                    </Badge>
                  </div>
                  {v.costImpact && (
                    <p className={`font-bold text-sm sm:text-base shrink-0 ${parseFloat(v.costImpact) > 0 ? "text-red-600" : "text-green-600"}`}>
                      {parseFloat(v.costImpact) > 0 ? "+" : ""}${parseFloat(v.costImpact).toLocaleString("en-AU", { minimumFractionDigits: 2 })}
                    </p>
                  )}
                </div>
                {v.description && <p className="text-sm text-muted-foreground mb-2">{v.description}</p>}
                {v.lineItems && Array.isArray(v.lineItems) && (v.lineItems as Array<{description:string;cost:number}>).length > 0 && (
                  <div className="mb-3 space-y-1 border rounded-md p-3 bg-muted/30">
                    {(v.lineItems as Array<{description:string;cost:number}>).map((li: {description:string;cost:number}, idx: number) => (
                      <div key={idx} className="flex justify-between text-sm">
                        <span>{li.description}</span>
                        <span className="font-medium">${(li.cost || 0).toLocaleString("en-AU", { minimumFractionDigits: 2 })}</span>
                      </div>
                    ))}
                    <div className="flex justify-between text-sm font-bold pt-1 border-t">
                      <span>Total</span>
                      <span>${(v.lineItems as Array<{description:string;cost:number}>).reduce((s: number, i: {description:string;cost:number}) => s + (i.cost || 0), 0).toLocaleString("en-AU", { minimumFractionDigits: 2 })}</span>
                    </div>
                  </div>
                )}
                {v.status === "pending" && (
                  <div className="flex gap-2 pt-2 border-t">
                    <Button
                      size="sm"
                      onClick={() => approveMutation.mutate({ variationId: v.id })}
                      disabled={approveMutation.isPending}
                    >
                      <Check className="w-4 h-4 mr-1" /> Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => rejectMutation.mutate({ variationId: v.id })}
                      disabled={rejectMutation.isPending}
                    >
                      <X className="w-4 h-4 mr-1" /> Reject
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
