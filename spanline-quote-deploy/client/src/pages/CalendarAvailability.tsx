import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ChevronLeft, ChevronRight, Calendar, Users, AlertCircle, GripVertical, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

const VIEW_TYPES = [
  { value: "construction_team", label: "Construction Team" },
  { value: "trades", label: "Trades" },
  { value: "delivery", label: "Delivery" },
  { value: "design_advisors", label: "Design Advisors" },
  { value: "admin_office", label: "Admin & Office" },
] as const;

type ViewType = (typeof VIEW_TYPES)[number]["value"];

function getMonday(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function formatDate(date: Date): string {
  return date.toISOString().split("T")[0];
}

function formatShortDate(date: Date): string {
  return date.toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" });
}

function timeToPercent(timestamp: number, dayStart: Date): number {
  const dayStartMs = dayStart.getTime();
  const dayEndMs = dayStartMs + 24 * 60 * 60 * 1000;
  const clamped = Math.max(dayStartMs, Math.min(dayEndMs, timestamp));
  return ((clamped - dayStartMs) / (dayEndMs - dayStartMs)) * 100;
}

type EventBlock = {
  type: "calendar_event" | "job_assignment" | "time_off" | "schedule";
  title: string;
  startPercent: number;
  widthPercent: number;
  startHour?: number;
  endHour?: number;
  eventId?: string;
  grantId?: string;
  jobId?: number;
  assignmentId?: number;
  originalStart?: number;
  originalEnd?: number;
  // Multi-day job fields
  durationDays?: number;
  dayIndex?: number; // which day of the multi-day span this block represents (0-based)
};

type PendingDrop = {
  block: EventBlock;
  dayIdx: number;
  hour: number;
  conflicts: EventBlock[];
  durationDays?: number; // for multi-day resize
};

const EVENT_COLORS: Record<string, string> = {
  calendar_event: "bg-blue-500/80 border-blue-600",
  job_assignment: "bg-green-500/80 border-green-600",
  time_off: "bg-red-400/80 border-red-500",
  schedule: "bg-gray-200 dark:bg-gray-700 border-gray-300 dark:border-gray-600",
};

const HOURS = Array.from({ length: 14 }, (_, i) => i + 6); // 6am to 7pm

export default function CalendarAvailability() {
  const [activeView, setActiveView] = useState<ViewType>("construction_team");
  const [weekStart, setWeekStart] = useState<Date>(() => getMonday(new Date()));
  const [selectedUserIds, setSelectedUserIds] = useState<number[]>([]);
  const [selectionsLoaded, setSelectionsLoaded] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [drillDownUser, setDrillDownUser] = useState<{
    userId: number;
    userName: string;
  } | null>(null);

  // Drag-and-drop state
  const [dragBlock, setDragBlock] = useState<EventBlock | null>(null);
  const [dragOverCell, setDragOverCell] = useState<{ dayIdx: number; hour: number } | null>(null);
  const dragGhostRef = useRef<HTMLDivElement | null>(null);

  // Conflict detection dialog
  const [conflictDialog, setConflictDialog] = useState<PendingDrop | null>(null);

  // Multi-day resize state
  const [resizingJob, setResizingJob] = useState<{ jobId: number; startDayIdx: number; currentDayIdx: number } | null>(null);

  const weekEnd = useMemo(() => addDays(weekStart, 6), [weekStart]);
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);

  const { data: viewMembers } = trpc.calendarViews.getViewMembers.useQuery({ viewType: activeView });
  const { data: savedSelections } = trpc.calendarViews.getMySelections.useQuery({ viewType: activeView });
  const saveSelections = trpc.calendarViews.saveMySelections.useMutation();

  const utils = trpc.useUtils();

  // Reschedule mutations — no onSuccess toast here, we handle it in the undo flow
  const rescheduleCalendarEvent = trpc.calendarViews.rescheduleCalendarEvent.useMutation({
    onSuccess: () => utils.calendarViews.getAvailability.invalidate(),
    onError: (err) => toast.error(err.message || "Failed to reschedule event"),
  });

  const rescheduleJobAssignment = trpc.calendarViews.rescheduleJobAssignment.useMutation({
    onSuccess: () => utils.calendarViews.getAvailability.invalidate(),
    onError: (err) => toast.error(err.message || "Failed to reschedule job"),
  });

  // Load persisted selections
  useEffect(() => {
    if (savedSelections && !selectionsLoaded) {
      setSelectedUserIds(savedSelections);
      setSelectionsLoaded(true);
    }
  }, [savedSelections, selectionsLoaded]);

  useEffect(() => {
    setSelectionsLoaded(false);
  }, [activeView]);

  const persistSelections = useCallback(
    (ids: number[]) => {
      saveSelections.mutate({ viewType: activeView, selectedUserIds: ids });
    },
    [activeView, saveSelections]
  );

  const { data: availability, isLoading } = trpc.calendarViews.getAvailability.useQuery(
    {
      viewType: activeView,
      startDate: formatDate(weekStart),
      endDate: formatDate(weekEnd),
      selectedUserIds: selectedUserIds.length > 0 ? selectedUserIds : undefined,
    },
    { placeholderData: (prev: any) => prev }
  );

  const handlePrevWeek = () => setWeekStart(addDays(weekStart, -7));
  const handleNextWeek = () => setWeekStart(addDays(weekStart, 7));
  const handleToday = () => setWeekStart(getMonday(new Date()));

  const toggleUser = (userId: number) => {
    setSelectedUserIds((prev) => {
      const next = prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId];
      persistSelections(next);
      return next;
    });
  };

  const selectAll = () => {
    if (viewMembers) {
      const all = viewMembers.map((m) => m.userId);
      setSelectedUserIds(all);
      persistSelections(all);
    }
  };
  const deselectAll = () => {
    setSelectedUserIds([]);
    persistSelections([]);
  };

  const handleViewChange = (v: string) => {
    setActiveView(v as ViewType);
    setSelectedUserIds([]);
    setSelectionsLoaded(false);
  };

  /** Build event blocks for a given user on a given day */
  function getBlocksForDay(
    member: NonNullable<typeof availability>[number],
    day: Date
  ): EventBlock[] {
    const blocks: EventBlock[] = [];
    const dayStr = formatDate(day);
    const dayStart = new Date(day);
    dayStart.setHours(0, 0, 0, 0);

    for (const ev of member.calendarEvents) {
      if (!ev.start || !ev.end) continue;
      const evStart = new Date(ev.start);
      const evEnd = new Date(ev.end);
      const dayEnd = addDays(dayStart, 1);
      if (evEnd.getTime() <= dayStart.getTime() || evStart.getTime() >= dayEnd.getTime()) continue;

      if (ev.allDay) {
        blocks.push({
          type: "calendar_event",
          title: ev.title,
          startPercent: 0,
          widthPercent: 100,
          startHour: 0,
          endHour: 24,
          eventId: ev.id,
          grantId: ev.grantId,
          originalStart: ev.start,
          originalEnd: ev.end,
        });
      } else {
        const sp = timeToPercent(evStart.getTime(), dayStart);
        const ep = timeToPercent(evEnd.getTime(), dayStart);
        blocks.push({
          type: "calendar_event",
          title: ev.title,
          startPercent: sp,
          widthPercent: Math.max(ep - sp, 2),
          startHour: evStart.getHours() + evStart.getMinutes() / 60,
          endHour: evEnd.getHours() + evEnd.getMinutes() / 60,
          eventId: ev.id,
          grantId: ev.grantId,
          originalStart: ev.start,
          originalEnd: ev.end,
        });
      }
    }

    for (const to of member.timeOff) {
      if (to.date === dayStr) {
        blocks.push({ type: "time_off", title: to.reason || "Time Off", startPercent: 0, widthPercent: 100, startHour: 0, endHour: 24 });
      }
    }

    for (const ja of member.jobAssignments) {
      if (ja.date === dayStr) {
        blocks.push({
          type: "job_assignment",
          title: ja.jobTitle,
          startPercent: 10,
          widthPercent: 80,
          startHour: 7,
          endHour: 16,
          jobId: ja.jobId,
          assignmentId: ja.assignmentId,
        });
      }
    }

    return blocks;
  }

  const drillDownMember = drillDownUser
    ? availability?.find((m) => m.userId === drillDownUser.userId)
    : null;

  const isDraggable = (block: EventBlock) =>
    block.type === "calendar_event" || block.type === "job_assignment";

  /** Check for conflicts at target time slot */
  function detectConflicts(targetDayIdx: number, targetHour: number, draggedBlock: EventBlock): EventBlock[] {
    if (!drillDownMember) return [];
    const targetDay = days[targetDayIdx];
    const allBlocks = getBlocksForDay(drillDownMember, targetDay);
    // Find blocks that overlap the target hour (excluding the dragged block itself)
    return allBlocks.filter((b) => {
      if (b.eventId === draggedBlock.eventId && b.jobId === draggedBlock.jobId) return false;
      if (b.startHour === undefined || b.endHour === undefined) return false;
      // For calendar events: check if the dragged event's duration overlaps
      if (draggedBlock.type === "calendar_event" && draggedBlock.originalStart && draggedBlock.originalEnd) {
        const durationHours = (draggedBlock.originalEnd - draggedBlock.originalStart) / 3600000;
        const newEnd = targetHour + durationHours;
        return b.startHour < newEnd && b.endHour > targetHour;
      }
      // For job assignments: 7am-4pm block
      if (draggedBlock.type === "job_assignment") {
        return b.startHour < 16 && b.endHour > 7;
      }
      return b.startHour < targetHour + 1 && b.endHour > targetHour;
    });
  }

  /** Execute the reschedule (called after undo window or conflict confirmation) */
  function executeReschedule(block: EventBlock, dayIdx: number, hour: number, durationDays?: number) {
    const targetDay = days[dayIdx];
    const targetDate = formatDate(targetDay);

    if (block.type === "calendar_event" && block.eventId && block.grantId) {
      const duration = (block.originalEnd || 0) - (block.originalStart || 0);
      const durationMs = duration > 0 ? duration : 3600000;
      const newStartDate = new Date(targetDay);
      newStartDate.setHours(hour, 0, 0, 0);
      const newStartTimeSec = Math.floor(newStartDate.getTime() / 1000);
      const newEndTimeSec = Math.floor((newStartDate.getTime() + durationMs) / 1000);

      // Store original for undo
      const origStart = block.originalStart ? Math.floor(block.originalStart / 1000) : 0;
      const origEnd = block.originalEnd ? Math.floor(block.originalEnd / 1000) : 0;
      const eventId = block.eventId;
      const grantId = block.grantId;

      // Show undo toast with 5-second window
      let undone = false;
      const toastId = toast("Event rescheduled", {
        description: `"${block.title}" moved to ${targetDate} at ${hour}:00`,
        duration: 5000,
        action: {
          label: "Undo",
          onClick: () => {
            undone = true;
            toast.dismiss(toastId);
            toast.success("Reschedule undone");
          },
        },
      });

      // After 5 seconds, commit if not undone
      setTimeout(() => {
        if (!undone) {
          rescheduleCalendarEvent.mutate({
            grantId,
            eventId,
            newStartTime: newStartTimeSec,
            newEndTime: newEndTimeSec,
          });
        }
      }, 5000);
    } else if (block.type === "job_assignment" && block.jobId) {
      const jobId = block.jobId;
      const jobTitle = block.title;

      let undone = false;
      const toastId = toast("Job rescheduled", {
        description: `"${jobTitle}" moved to ${targetDate}${durationDays ? ` (${durationDays} day${durationDays > 1 ? "s" : ""})` : ""}`,
        duration: 5000,
        action: {
          label: "Undo",
          onClick: () => {
            undone = true;
            toast.dismiss(toastId);
            toast.success("Reschedule undone");
          },
        },
      });

      setTimeout(() => {
        if (!undone) {
          rescheduleJobAssignment.mutate({
            jobId,
            newDate: targetDate,
            ...(durationDays ? { durationDays } : {}),
          });
        }
      }, 5000);
    }
  }

  // --- Drag-and-drop handlers ---
  const handleDragStart = (e: React.DragEvent, block: EventBlock) => {
    if (!isDraggable(block)) {
      e.preventDefault();
      return;
    }
    setDragBlock(block);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", block.title);
    const ghost = document.createElement("div");
    ghost.className = "fixed top-0 left-0 px-2 py-1 rounded text-xs text-white bg-primary/90 shadow-lg z-[9999] pointer-events-none";
    ghost.textContent = block.title;
    ghost.style.maxWidth = "160px";
    ghost.style.whiteSpace = "nowrap";
    ghost.style.overflow = "hidden";
    ghost.style.textOverflow = "ellipsis";
    document.body.appendChild(ghost);
    dragGhostRef.current = ghost;
    e.dataTransfer.setDragImage(ghost, 0, 0);
  };

  const handleDragEnd = () => {
    setDragBlock(null);
    setDragOverCell(null);
    if (dragGhostRef.current) {
      document.body.removeChild(dragGhostRef.current);
      dragGhostRef.current = null;
    }
  };

  const handleDragOver = (e: React.DragEvent, dayIdx: number, hour: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverCell({ dayIdx, hour });
  };

  const handleDragLeave = () => {
    setDragOverCell(null);
  };

  const handleDrop = (e: React.DragEvent, dayIdx: number, hour: number) => {
    e.preventDefault();
    setDragOverCell(null);
    if (!dragBlock) return;

    // Detect conflicts
    const conflicts = detectConflicts(dayIdx, hour, dragBlock);

    if (conflicts.length > 0) {
      // Show conflict dialog
      setConflictDialog({ block: dragBlock, dayIdx, hour, conflicts });
    } else {
      // No conflicts — proceed with undo toast
      executeReschedule(dragBlock, dayIdx, hour);
    }

    setDragBlock(null);
    if (dragGhostRef.current) {
      document.body.removeChild(dragGhostRef.current);
      dragGhostRef.current = null;
    }
  };

  // --- Multi-day resize handlers ---
  const handleResizeStart = (e: React.MouseEvent, jobId: number, startDayIdx: number) => {
    e.stopPropagation();
    e.preventDefault();
    setResizingJob({ jobId, startDayIdx, currentDayIdx: startDayIdx });

    const handleMouseMove = (ev: MouseEvent) => {
      // Calculate which day column the mouse is over
      const gridEl = document.getElementById("drill-down-grid");
      if (!gridEl) return;
      const rect = gridEl.getBoundingClientRect();
      const colWidth = (rect.width - 50) / 7; // 50px for time column
      const relX = ev.clientX - rect.left - 50;
      const dayIdx = Math.max(startDayIdx, Math.min(6, Math.floor(relX / colWidth)));
      setResizingJob((prev) => prev ? { ...prev, currentDayIdx: dayIdx } : null);
    };

    const handleMouseUp = () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      setResizingJob((prev) => {
        if (!prev) return null;
        const durationDays = prev.currentDayIdx - prev.startDayIdx + 1;
        if (durationDays > 1) {
          // Find the block to get the title
          const targetDate = formatDate(days[prev.startDayIdx]);
          // Execute with durationDays
          const block: EventBlock = {
            type: "job_assignment",
            title: "",
            startPercent: 0,
            widthPercent: 0,
            jobId: prev.jobId,
          };
          // Check conflicts across all days
          let allConflicts: EventBlock[] = [];
          if (drillDownMember) {
            for (let d = prev.startDayIdx; d <= prev.currentDayIdx; d++) {
              const dayBlocks = getBlocksForDay(drillDownMember, days[d]);
              const conflicts = dayBlocks.filter(
                (b) => b.jobId !== prev.jobId && (b.type === "time_off" || b.type === "calendar_event" || b.type === "job_assignment")
              );
              allConflicts.push(...conflicts);
            }
          }
          if (allConflicts.length > 0) {
            setConflictDialog({ block, dayIdx: prev.startDayIdx, hour: 7, conflicts: allConflicts, durationDays });
          } else {
            executeReschedule(block, prev.startDayIdx, 7, durationDays);
          }
        }
        return null;
      });
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  };

  // Handle conflict dialog confirmation
  const handleConflictProceed = () => {
    if (conflictDialog) {
      executeReschedule(conflictDialog.block, conflictDialog.dayIdx, conflictDialog.hour, conflictDialog.durationDays);
      setConflictDialog(null);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="border-b px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex items-center gap-2">
          <Calendar className="h-5 w-5 text-primary" />
          <h1 className="text-lg font-semibold">Calendar Availability</h1>
        </div>
        <div className="flex items-center gap-2 ml-auto">
          <Button variant="outline" size="sm" className="h-8 text-xs" onClick={handleToday}>
            Today
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handlePrevWeek}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm font-medium min-w-[180px] text-center">
            {weekStart.toLocaleDateString("en-AU", { day: "numeric", month: "short" })} –{" "}
            {weekEnd.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}
          </span>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleNextWeek}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b px-4 py-2">
        <Tabs value={activeView} onValueChange={handleViewChange}>
          <TabsList className="h-8">
            {VIEW_TYPES.map((vt) => (
              <TabsTrigger key={vt.value} value={vt.value} className="text-xs px-3 h-7">
                {vt.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden">
        {/* People picker sidebar */}
        {sidebarOpen && (
          <div className="w-56 border-r bg-muted/30 flex flex-col overflow-hidden">
            <div className="p-3 border-b flex items-center justify-between">
              <span className="text-xs font-medium flex items-center gap-1">
                <Users className="h-3.5 w-3.5" /> People
              </span>
              <div className="flex gap-1">
                <Button variant="ghost" size="sm" className="h-6 text-[10px] px-1.5" onClick={selectAll}>
                  All
                </Button>
                <Button variant="ghost" size="sm" className="h-6 text-[10px] px-1.5" onClick={deselectAll}>
                  None
                </Button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {viewMembers && viewMembers.length > 0 ? (
                viewMembers.map((m) => (
                  <label
                    key={m.id}
                    className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted/50 cursor-pointer"
                  >
                    <Checkbox
                      checked={selectedUserIds.length === 0 || selectedUserIds.includes(m.userId)}
                      onCheckedChange={() => toggleUser(m.userId)}
                    />
                    <span className="text-xs truncate">{m.userName || m.userEmail}</span>
                  </label>
                ))
              ) : (
                <div className="p-3 text-center">
                  <AlertCircle className="h-4 w-4 mx-auto text-muted-foreground mb-1" />
                  <p className="text-[10px] text-muted-foreground">
                    No members assigned to this view. An admin can add members in Settings &gt; Calendar Views.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Timeline grid */}
        <div className="flex-1 overflow-auto">
          {isLoading ? (
            <div className="flex items-center justify-center h-full">
              <div className="animate-spin rounded-full h-8 w-8 border-2 border-muted border-t-foreground" />
            </div>
          ) : !availability || availability.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center p-8">
              <Calendar className="h-10 w-10 text-muted-foreground mb-3" />
              <p className="text-sm text-muted-foreground">
                {viewMembers && viewMembers.length === 0
                  ? "No members in this view. Add members via Admin > Calendar Views."
                  : "No availability data for the selected period."}
              </p>
            </div>
          ) : (
            <div className="min-w-[800px]">
              {/* Day headers */}
              <div className="flex border-b sticky top-0 bg-background z-10">
                <div className="w-40 shrink-0 border-r px-3 py-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 text-[10px] px-1.5"
                    onClick={() => setSidebarOpen(!sidebarOpen)}
                  >
                    {sidebarOpen ? "Hide" : "Show"} People
                  </Button>
                </div>
                {days.map((day) => {
                  const isToday = formatDate(day) === formatDate(new Date());
                  return (
                    <div
                      key={formatDate(day)}
                      className={`flex-1 text-center py-2 border-r last:border-r-0 text-xs font-medium ${
                        isToday ? "bg-primary/5 text-primary" : ""
                      }`}
                    >
                      {formatShortDate(day)}
                    </div>
                  );
                })}
              </div>

              {/* Person rows */}
              {availability.map((member) => (
                <div
                  key={member.userId}
                  className="flex border-b hover:bg-muted/20 cursor-pointer"
                  onClick={() => setDrillDownUser({ userId: member.userId, userName: member.userName })}
                >
                  <div className="w-40 shrink-0 border-r px-3 py-2 flex items-center">
                    <div className="truncate">
                      <p className="text-xs font-medium truncate">{member.userName}</p>
                      {member.userEmail && (
                        <p className="text-[10px] text-muted-foreground truncate">{member.userEmail}</p>
                      )}
                    </div>
                  </div>
                  {days.map((day) => {
                    const blocks = getBlocksForDay(member, day);
                    const isToday = formatDate(day) === formatDate(new Date());
                    return (
                      <div
                        key={formatDate(day)}
                        className={`flex-1 border-r last:border-r-0 relative min-h-[48px] ${
                          isToday ? "bg-primary/5" : ""
                        }`}
                      >
                        {blocks.map((block, idx) => (
                          <div
                            key={idx}
                            className={`absolute top-1 h-[calc(100%-8px)] rounded-sm border text-[9px] text-white px-0.5 overflow-hidden flex items-center ${EVENT_COLORS[block.type]}`}
                            style={{
                              left: `${block.startPercent}%`,
                              width: `${block.widthPercent}%`,
                            }}
                            title={block.title}
                          >
                            <span className="truncate">{block.title}</span>
                          </div>
                        ))}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Legend */}
      <div className="border-t px-4 py-2 flex items-center gap-4 flex-wrap">
        <span className="text-[10px] text-muted-foreground font-medium">Legend:</span>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-sm bg-blue-500/80 border border-blue-600" />
          <span className="text-[10px]">Calendar Event</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-sm bg-green-500/80 border border-green-600" />
          <span className="text-[10px]">Job Assignment</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-sm bg-red-400/80 border border-red-500" />
          <span className="text-[10px]">Time Off</span>
        </div>
        <span className="text-[10px] text-muted-foreground ml-auto">Click a person for detail • Drag to reschedule • Resize handle for multi-day</span>
      </div>

      {/* Drill-down Sheet */}
      <Sheet open={!!drillDownUser} onOpenChange={(open) => !open && setDrillDownUser(null)}>
        <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              {drillDownUser?.userName} — Week Detail
            </SheetTitle>
          </SheetHeader>

          {drillDownMember && (
            <div className="mt-4">
              <div className="flex items-center gap-1.5 mb-3 px-1">
                <GripVertical className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-[10px] text-muted-foreground">
                  Drag to reschedule • Right-edge resize for multi-day jobs • 5s undo window after drop
                </span>
              </div>

              {/* Week grid */}
              <div className="overflow-x-auto">
                <div className="min-w-[560px]" id="drill-down-grid">
                  {/* Day headers */}
                  <div className="grid grid-cols-[50px_repeat(7,1fr)] border-b">
                    <div className="text-[10px] text-muted-foreground p-1" />
                    {days.map((day) => {
                      const isToday = formatDate(day) === formatDate(new Date());
                      return (
                        <div
                          key={formatDate(day)}
                          className={`text-center text-[10px] font-medium py-1 border-l ${
                            isToday ? "bg-primary/10 text-primary" : ""
                          }`}
                        >
                          {day.toLocaleDateString("en-AU", { weekday: "short" })}
                          <br />
                          {day.getDate()}
                        </div>
                      );
                    })}
                  </div>

                  {/* Hour rows */}
                  {HOURS.map((hour) => (
                    <div key={hour} className="grid grid-cols-[50px_repeat(7,1fr)] border-b min-h-[32px]">
                      <div className="text-[9px] text-muted-foreground p-1 text-right pr-2 border-r">
                        {hour.toString().padStart(2, "0")}:00
                      </div>
                      {days.map((day, dayIdx) => {
                        const blocks = getBlocksForDay(drillDownMember, day);
                        const isToday = formatDate(day) === formatDate(new Date());
                        const hourBlocks = blocks.filter((b) => {
                          if (b.startHour === undefined || b.endHour === undefined) return false;
                          return b.startHour < hour + 1 && b.endHour > hour;
                        });
                        const isDropTarget =
                          dragOverCell?.dayIdx === dayIdx && dragOverCell?.hour === hour;
                        // Multi-day resize highlight
                        const isResizeHighlight =
                          resizingJob &&
                          hour >= 7 &&
                          hour < 16 &&
                          dayIdx >= resizingJob.startDayIdx &&
                          dayIdx <= resizingJob.currentDayIdx;

                        return (
                          <div
                            key={formatDate(day)}
                            className={`border-l relative ${isToday ? "bg-primary/5" : ""} ${
                              isDropTarget ? "bg-primary/20 ring-1 ring-primary/50 ring-inset" : ""
                            } ${isResizeHighlight ? "bg-green-100 dark:bg-green-900/30" : ""}`}
                            onDragOver={(e) => handleDragOver(e, dayIdx, hour)}
                            onDragLeave={handleDragLeave}
                            onDrop={(e) => handleDrop(e, dayIdx, hour)}
                          >
                            {hourBlocks.map((block, idx) => {
                              const draggable = isDraggable(block);
                              const isBeingDragged =
                                dragBlock &&
                                ((dragBlock.eventId && dragBlock.eventId === block.eventId) ||
                                  (dragBlock.jobId && dragBlock.jobId === block.jobId));
                              return (
                                <div
                                  key={idx}
                                  draggable={draggable}
                                  onDragStart={(e) => {
                                    e.stopPropagation();
                                    handleDragStart(e, block);
                                  }}
                                  onDragEnd={handleDragEnd}
                                  className={`absolute inset-0 ${EVENT_COLORS[block.type]} text-[8px] text-white px-0.5 flex items-center overflow-hidden ${
                                    draggable ? "cursor-grab active:cursor-grabbing" : ""
                                  } ${isBeingDragged ? "opacity-40" : ""}`}
                                  title={`${block.title}${draggable ? " (drag to reschedule)" : ""}`}
                                >
                                  {draggable && (
                                    <GripVertical className="h-2.5 w-2.5 shrink-0 mr-0.5 opacity-70" />
                                  )}
                                  <span className="truncate flex-1">{block.title}</span>
                                  {/* Resize handle for job assignments */}
                                  {block.type === "job_assignment" && block.jobId && hour === 7 && (
                                    <div
                                      className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize bg-green-700/50 hover:bg-green-700/80 rounded-r-sm flex items-center justify-center"
                                      onMouseDown={(e) => handleResizeStart(e, block.jobId!, dayIdx)}
                                      title="Drag to extend across multiple days"
                                    >
                                      <div className="w-0.5 h-3 bg-white/70 rounded" />
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>

              {/* Summary below grid */}
              <div className="mt-4 space-y-2">
                {drillDownMember.calendarEvents.length > 0 && (
                  <div>
                    <p className="text-xs font-medium mb-1">Calendar Events</p>
                    <div className="space-y-1">
                      {drillDownMember.calendarEvents.map((ev, i) => (
                        <div key={i} className="flex items-center gap-2 text-[11px]">
                          <div className="w-2 h-2 rounded-full bg-blue-500" />
                          <span className="font-medium">{ev.title}</span>
                          {ev.start && (
                            <span className="text-muted-foreground">
                              {new Date(ev.start).toLocaleString("en-AU", {
                                weekday: "short",
                                hour: "numeric",
                                minute: "2-digit",
                              })}
                              {ev.end && (
                                <>
                                  {" – "}
                                  {new Date(ev.end).toLocaleString("en-AU", {
                                    hour: "numeric",
                                    minute: "2-digit",
                                  })}
                                </>
                              )}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {drillDownMember.jobAssignments.length > 0 && (
                  <div>
                    <p className="text-xs font-medium mb-1">Job Assignments</p>
                    <div className="space-y-1">
                      {drillDownMember.jobAssignments.map((ja, i) => (
                        <div key={i} className="flex items-center gap-2 text-[11px]">
                          <div className="w-2 h-2 rounded-full bg-green-500" />
                          <span className="font-medium">{ja.jobTitle}</span>
                          <span className="text-muted-foreground">{ja.date}</span>
                          <Badge variant="outline" className="text-[9px] h-4">
                            {ja.jobStatus}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {drillDownMember.timeOff.length > 0 && (
                  <div>
                    <p className="text-xs font-medium mb-1">Time Off</p>
                    <div className="space-y-1">
                      {drillDownMember.timeOff.map((to, i) => (
                        <div key={i} className="flex items-center gap-2 text-[11px]">
                          <div className="w-2 h-2 rounded-full bg-red-400" />
                          <span className="font-medium">{to.date}</span>
                          <span className="text-muted-foreground">{to.reason}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {drillDownMember.scheduleBlocks.length > 0 && (
                  <div>
                    <p className="text-xs font-medium mb-1">Regular Schedule</p>
                    <div className="space-y-1">
                      {drillDownMember.scheduleBlocks.map((sb, i) => (
                        <div key={i} className="flex items-center gap-2 text-[11px]">
                          <div className="w-2 h-2 rounded-full bg-gray-400" />
                          <span>
                            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][sb.dayOfWeek]} {sb.startTime} – {sb.endTime}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Conflict Detection Dialog */}
      <AlertDialog open={!!conflictDialog} onOpenChange={(open) => !open && setConflictDialog(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Scheduling Conflict Detected
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>
                  Moving <strong>"{conflictDialog?.block.title || "this item"}"</strong> to{" "}
                  {conflictDialog && days[conflictDialog.dayIdx]
                    ? formatShortDate(days[conflictDialog.dayIdx])
                    : ""}{" "}
                  at {conflictDialog?.hour}:00 will overlap with:
                </p>
                <ul className="list-disc pl-5 space-y-1">
                  {conflictDialog?.conflicts.map((c, i) => (
                    <li key={i} className="text-sm">
                      <span className="font-medium">{c.title}</span>
                      <span className="text-muted-foreground ml-1">
                        ({c.type === "calendar_event" ? "Calendar" : c.type === "job_assignment" ? "Job" : c.type === "time_off" ? "Time Off" : "Schedule"})
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="text-sm text-muted-foreground pt-1">
                  Do you want to proceed with the reschedule anyway?
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConflictProceed} className="bg-amber-600 hover:bg-amber-700">
              Proceed Anyway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
