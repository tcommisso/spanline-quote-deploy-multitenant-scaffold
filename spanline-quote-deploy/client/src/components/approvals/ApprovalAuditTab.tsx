import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Clock, User } from "lucide-react";

interface Props {
  projectId: number;
}

export function ApprovalAuditTab({ projectId }: Props) {
  const { data: entries, isLoading } = trpc.approvals.auditLog.useQuery({ projectId });

  return (
    <div className="space-y-4 mt-4">
      <h3 className="text-lg font-semibold">Audit Log</h3>

      {isLoading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => <div key={i} className="h-14 bg-muted animate-pulse rounded-lg" />)}
        </div>
      ) : !entries || entries.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            No audit entries yet. Actions on this project will be logged here.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {entries.map((entry: any) => (
            <Card key={entry.id}>
              <CardContent className="p-3">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-medium">{entry.summary}</p>
                    <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                      <Badge variant="outline" className="text-xs">{entry.eventType}</Badge>
                      <span>{entry.entityType} #{entry.entityId}</span>
                      {entry.userName && (
                        <span className="flex items-center gap-1">
                          <User className="h-3 w-3" /> {entry.userName}
                        </span>
                      )}
                    </div>
                  </div>
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {new Date(entry.createdAt).toLocaleString()}
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
