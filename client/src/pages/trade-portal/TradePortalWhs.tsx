import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ShieldCheck, FileText, ExternalLink, Loader2 } from "lucide-react";

export default function TradePortalWhs() {
  const { data: docs, isLoading } = trpc.whs.tradePortalDocs.useQuery();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!docs || docs.length === 0) return null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <ShieldCheck className="h-6 w-6 text-primary" />
          Work Health & Safety
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Safe Work Method Statements (SWMS) and safety documentation
        </p>
      </div>

      <div className="grid gap-3">
        {docs.map((doc: any) => (
          <Card key={doc.id} className="hover:shadow-md transition-shadow">
            <CardContent className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10">
                  <FileText className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="font-medium">{doc.title}</p>
                  {doc.description && (
                    <p className="text-sm text-muted-foreground">{doc.description}</p>
                  )}
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.open(doc.fileUrl, "_blank")}
              >
                <ExternalLink className="h-4 w-4 mr-1.5" />
                View
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
