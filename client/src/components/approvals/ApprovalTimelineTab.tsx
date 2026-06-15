import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState, useMemo } from "react";
import {
  Folder, Send, ClipboardCheck, CheckSquare, HelpCircle, Flag, CheckCircle, AlertCircle,
} from "lucide-react";

interface TimelineEvent {
  id: string;
  type: "project" | "lodgement" | "inspection" | "task" | "rfi" | "gate" | "milestone";
  title: string;
  date: string | null;
  endDate?: string | null;
  status: string;
  color: string;
  icon: string;
  metadata?: Record<string, any>;
}

const TYPE_LABELS: Record<string, string> = {
  project: "Project",
  lodgement: "Lodgement",
  inspection: "Inspection",
  task: "Task",
  rfi: "RFI",
  gate: "Gate",
  milestone: "Milestone",
};

function getIcon(iconName: string, className: string) {
  switch (iconName) {
    case "folder": return <Folder className={className} />;
    case "send": return <Send className={className} />;
    case "clipboard-check": return <ClipboardCheck className={className} />;
    case "check-square": return <CheckSquare className={className} />;
    case "help-circle": return <HelpCircle className={className} />;
    case "flag": return <Flag className={className} />;
    case "check-circle": return <CheckCircle className={className} />;
    case "check": return <CheckCircle className={className} />;
    case "alert-circle": return <AlertCircle className={className} />;
    default: return <Folder className={className} />;
  }
}

export default function ApprovalTimelineTab({ projectId }: { projectId: number }) {
  const [filter, setFilter] = useState<string>("all");
  const { data: events, isLoading } = trpc.approvals.timeline.useQuery({ projectId });

  const filteredEvents = useMemo(() => {
    if (!events) return [];
    if (filter === "all") return events;
    return (events as TimelineEvent[]).filter((e) => e.type === filter);
  }, [events, filter]);

  // Calculate Gantt chart date range
  const { minDate, maxDate, totalDays } = useMemo(() => {
    const datesWithValues = (filteredEvents as TimelineEvent[])
      .filter((e) => e.date)
      .map((e) => new Date(e.date!).getTime());
    if (datesWithValues.length === 0) return { minDate: new Date(), maxDate: new Date(), totalDays: 1 };
    const min = new Date(Math.min(...datesWithValues));
    const max = new Date(Math.max(...datesWithValues));
    // Add 7 days padding on each side
    min.setDate(min.getDate() - 7);
    max.setDate(max.getDate() + 14);
    const days = Math.max(1, Math.ceil((max.getTime() - min.getTime()) / (1000 * 60 * 60 * 24)));
    return { minDate: min, maxDate: max, totalDays: days };
  }, [filteredEvents]);

  function getPosition(date: string | null): number {
    if (!date) return 0;
    const d = new Date(date).getTime();
    const start = minDate.getTime();
    return Math.max(0, Math.min(100, ((d - start) / (maxDate.getTime() - start)) * 100));
  }

  function getWidth(startDate: string | null, endDate: string | null): number {
    if (!startDate || !endDate) return 2; // point event
    const s = new Date(startDate).getTime();
    const e = new Date(endDate).getTime();
    const start = minDate.getTime();
    const range = maxDate.getTime() - start;
    return Math.max(2, ((e - s) / range) * 100);
  }

  // Generate month markers for the Gantt header
  const monthMarkers = useMemo(() => {
    const markers: { label: string; position: number }[] = [];
    const current = new Date(minDate);
    current.setDate(1);
    current.setMonth(current.getMonth() + 1);
    while (current <= maxDate) {
      const pos = ((current.getTime() - minDate.getTime()) / (maxDate.getTime() - minDate.getTime())) * 100;
      markers.push({
        label: current.toLocaleDateString("en-AU", { month: "short", year: "2-digit" }),
        position: pos,
      });
      current.setMonth(current.getMonth() + 1);
    }
    return markers;
  }, [minDate, maxDate]);

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-12 bg-muted rounded animate-pulse" />
        ))}
      </div>
    );
  }

  if (!events || events.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <p className="text-muted-foreground">No timeline events yet. Events will appear as lodgements, inspections, and tasks are created with dates.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filter */}
      <div className="flex items-center gap-3">
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Filter by type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Events</SelectItem>
            <SelectItem value="project">Project</SelectItem>
            <SelectItem value="lodgement">Lodgements</SelectItem>
            <SelectItem value="inspection">Inspections</SelectItem>
            <SelectItem value="task">Tasks</SelectItem>
            <SelectItem value="rfi">RFIs</SelectItem>
            <SelectItem value="milestone">Milestones</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground">
          {filteredEvents.length} event{filteredEvents.length !== 1 ? "s" : ""} •{" "}
          {minDate.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })} —{" "}
          {maxDate.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}
        </span>
      </div>

      {/* Gantt Chart */}
      <Card>
        <CardContent className="pt-4 pb-2 overflow-x-auto">
          {/* Month header */}
          <div className="relative h-6 border-b mb-2 min-w-[600px]">
            {monthMarkers.map((m, i) => (
              <div
                key={i}
                className="absolute text-[10px] text-muted-foreground font-medium"
                style={{ left: `${m.position}%`, transform: "translateX(-50%)" }}
              >
                {m.label}
              </div>
            ))}
          </div>

          {/* Today marker */}
          <div className="relative min-w-[600px]">
            {(() => {
              const todayPos = getPosition(new Date().toISOString());
              if (todayPos > 0 && todayPos < 100) {
                return (
                  <div
                    className="absolute top-0 bottom-0 w-px bg-red-400 z-10 opacity-60"
                    style={{ left: `${todayPos}%` }}
                  >
                    <span className="absolute -top-5 -translate-x-1/2 text-[9px] text-red-500 font-semibold">Today</span>
                  </div>
                );
              }
              return null;
            })()}

            {/* Event rows */}
            <div className="space-y-1">
              {(filteredEvents as TimelineEvent[]).map((event) => {
                const pos = getPosition(event.date);
                const width = event.endDate ? getWidth(event.date, event.endDate) : 2;
                const hasRange = event.endDate && event.date;

                return (
                  <div key={event.id} className="flex items-center gap-2 h-8 group">
                    {/* Label */}
                    <div className="w-[200px] shrink-0 flex items-center gap-1.5 overflow-hidden">
                      {getIcon(event.icon, "h-3.5 w-3.5 shrink-0")}
                      <span className="text-xs truncate" title={event.title}>
                        {event.title}
                      </span>
                    </div>

                    {/* Bar area */}
                    <div className="flex-1 relative h-6 bg-muted/30 rounded min-w-[400px]">
                      {/* Month grid lines */}
                      {monthMarkers.map((m, i) => (
                        <div
                          key={i}
                          className="absolute top-0 bottom-0 w-px bg-border/40"
                          style={{ left: `${m.position}%` }}
                        />
                      ))}

                      {/* Event bar */}
                      {event.date && (
                        <div
                          className="absolute top-1 h-4 rounded-sm transition-opacity group-hover:opacity-90"
                          style={{
                            left: `${pos}%`,
                            width: hasRange ? `${width}%` : "8px",
                            backgroundColor: event.color,
                            minWidth: "6px",
                          }}
                          title={`${event.title}\n${new Date(event.date).toLocaleDateString("en-AU")}${event.endDate ? ` → ${new Date(event.endDate).toLocaleDateString("en-AU")}` : ""}`}
                        />
                      )}
                    </div>

                    {/* Status badge */}
                    <div className="w-[80px] shrink-0">
                      <Badge
                        variant="outline"
                        className="text-[10px] truncate"
                        style={{ borderColor: event.color, color: event.color }}
                      >
                        {event.status}
                      </Badge>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-[#3b82f6]" /> Project</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-[#f59e0b]" /> Lodgement</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-[#6366f1]" /> Inspection</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-[#64748b]" /> Task</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-[#f97316]" /> RFI</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-[#8b5cf6]" /> Milestone</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-[#10b981]" /> Completed</span>
        <span className="flex items-center gap-1"><span className="w-px h-3 bg-red-400" /> Today</span>
      </div>
    </div>
  );
}
