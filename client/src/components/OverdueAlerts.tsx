import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AlertTriangle, Bell, BellOff, Clock, Eye, EyeOff, MoreVertical, Undo2 } from "lucide-react";
import { toast } from "sonner";

export function OverdueAlerts() {
  const [open, setOpen] = useState(false);
  const utils = trpc.useUtils();

  const overdueCountQuery = trpc.construction.jobs.overdueCount.useQuery();
  const overdueListQuery = trpc.construction.jobs.overdueList.useQuery(undefined, {
    enabled: open,
  });

  const dismissMutation = trpc.construction.jobs.dismissOverdue.useMutation({
    onSuccess: () => {
      utils.construction.jobs.overdueCount.invalidate();
      utils.construction.jobs.overdueList.invalidate();
    },
  });

  const undismissMutation = trpc.construction.jobs.undismissOverdue.useMutation({
    onSuccess: () => {
      utils.construction.jobs.overdueCount.invalidate();
      utils.construction.jobs.overdueList.invalidate();
    },
  });

  const count = overdueCountQuery.data?.count || 0;
  const allJobs = overdueListQuery.data || [];
  const activeJobs = allJobs.filter(j => !j.isDismissed && !j.isSnoozed);
  const dismissedJobs = allJobs.filter(j => j.isDismissed || j.isSnoozed);

  const handleDismiss = (jobId: number) => {
    dismissMutation.mutate({ jobId, action: "dismiss" });
    toast.success("Alert dismissed");
  };

  const handleSnooze = (jobId: number, days: number) => {
    dismissMutation.mutate({ jobId, action: "snooze", snoozeDays: days });
    toast.success(`Snoozed for ${days} day${days > 1 ? "s" : ""}`);
  };

  const handleUndismiss = (jobId: number) => {
    undismissMutation.mutate({ jobId });
    toast.success("Alert restored");
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="sm" className="relative gap-2 text-muted-foreground hover:text-foreground">
          <Bell className="h-4 w-4" />
          {count > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold leading-none">
              {count > 99 ? "99+" : count}
            </span>
          )}
          <span className="hidden sm:inline text-xs">Overdue</span>
        </Button>
      </SheetTrigger>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-orange-500" />
            Overdue Job Alerts
          </SheetTitle>
        </SheetHeader>

        <div className="mt-6 space-y-4">
          {/* Active overdue alerts */}
          {activeJobs.length === 0 && dismissedJobs.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              <Bell className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">No overdue jobs</p>
              <p className="text-xs mt-1">All jobs are on schedule</p>
            </div>
          )}

          {activeJobs.length > 0 && (
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-2">
                Active Alerts ({activeJobs.length})
              </p>
              <div className="space-y-2">
                {activeJobs.map(job => (
                  <div key={job.id} className="border rounded-lg p-3 bg-orange-50 dark:bg-orange-950/20 border-orange-200 dark:border-orange-800/30">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-sm truncate">{job.clientName}</p>
                        {job.quoteNumber && (
                          <p className="text-xs text-muted-foreground">{job.quoteNumber}</p>
                        )}
                        {job.siteAddress && (
                          <p className="text-xs text-muted-foreground truncate mt-0.5">{job.siteAddress}</p>
                        )}
                        <p className="text-xs text-orange-600 dark:text-orange-400 font-medium mt-1">
                          {job.daysOverdue} day{job.daysOverdue !== 1 ? "s" : ""} overdue
                        </p>
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => handleSnooze(job.id, 1)}>
                            <Clock className="h-4 w-4 mr-2" />
                            Snooze 1 day
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleSnooze(job.id, 3)}>
                            <Clock className="h-4 w-4 mr-2" />
                            Snooze 3 days
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleSnooze(job.id, 7)}>
                            <Clock className="h-4 w-4 mr-2" />
                            Snooze 1 week
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleDismiss(job.id)} className="text-red-600">
                            <BellOff className="h-4 w-4 mr-2" />
                            Dismiss permanently
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Dismissed/snoozed alerts */}
          {dismissedJobs.length > 0 && (
            <div className="mt-6">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-2">
                Dismissed / Snoozed ({dismissedJobs.length})
              </p>
              <div className="space-y-2">
                {dismissedJobs.map(job => (
                  <div key={job.id} className="border rounded-lg p-3 bg-muted/30 border-border/50 opacity-70">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-sm truncate">{job.clientName}</p>
                        {job.quoteNumber && (
                          <p className="text-xs text-muted-foreground">{job.quoteNumber}</p>
                        )}
                        <div className="flex items-center gap-1 mt-1">
                          {job.isSnoozed ? (
                            <span className="text-xs text-blue-600 dark:text-blue-400 flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              Snoozed until {job.snoozedUntil ? new Date(job.snoozedUntil).toLocaleDateString() : "—"}
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                              <BellOff className="h-3 w-3" />
                              Dismissed
                            </span>
                          )}
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 shrink-0"
                        onClick={() => handleUndismiss(job.id)}
                        title="Restore alert"
                      >
                        <Undo2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
