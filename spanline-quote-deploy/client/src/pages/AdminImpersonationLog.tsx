/**
 * Admin Impersonation Activity Log
 * Shows a chronological list of impersonation start/stop events with admin and target user details.
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { UserCog, ArrowRight, Clock, ChevronLeft, ChevronRight } from "lucide-react";

const PAGE_SIZE = 25;

export default function AdminImpersonationLog() {
  const [offset, setOffset] = useState(0);
  const { data: logs, isLoading } = trpc.userManagement.getImpersonationLog.useQuery({
    limit: PAGE_SIZE,
    offset,
  });

  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <UserCog className="h-6 w-6" /> Impersonation Activity Log
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Audit trail of all admin impersonation sessions — who impersonated whom and when.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Recent Activity</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : !logs || logs.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <UserCog className="h-10 w-10 mx-auto mb-3 opacity-40" />
              <p>No impersonation events recorded yet.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {logs.map((log) => (
                <div
                  key={log.id}
                  className="flex items-center gap-3 p-3 rounded-lg border bg-muted/30 hover:bg-muted/50 transition-colors"
                >
                  <div className="flex-shrink-0">
                    {log.action === "impersonation_start" ? (
                      <div className="h-9 w-9 rounded-full bg-amber-100 flex items-center justify-center">
                        <UserCog className="h-4 w-4 text-amber-700" />
                      </div>
                    ) : (
                      <div className="h-9 w-9 rounded-full bg-green-100 flex items-center justify-center">
                        <UserCog className="h-4 w-4 text-green-700" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <span className="truncate">{log.adminUserName || `User #${log.adminUserId}`}</span>
                      <ArrowRight className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                      <span className="truncate">{log.targetUserName || `User #${log.targetUserId}`}</span>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <Badge
                        variant="outline"
                        className={
                          log.action === "impersonation_start"
                            ? "text-amber-700 border-amber-200 bg-amber-50 text-xs"
                            : "text-green-700 border-green-200 bg-green-50 text-xs"
                        }
                      >
                        {log.action === "impersonation_start" ? "Started" : "Stopped"}
                      </Badge>
                      {log.newValue && (
                        <span className="text-xs text-muted-foreground truncate">{log.newValue || log.oldValue}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex-shrink-0 text-right">
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      <span>{new Date(log.createdAt).toLocaleDateString("en-AU", { day: "2-digit", month: "short", year: "numeric" })}</span>
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {new Date(log.createdAt).toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit" })}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Pagination */}
          {logs && logs.length > 0 && (
            <div className="flex items-center justify-between mt-4 pt-3 border-t">
              <span className="text-xs text-muted-foreground">
                Showing {offset + 1}–{offset + logs.length}
              </span>
              <div className="flex gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={offset === 0}
                  onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={logs.length < PAGE_SIZE}
                  onClick={() => setOffset(offset + PAGE_SIZE)}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
