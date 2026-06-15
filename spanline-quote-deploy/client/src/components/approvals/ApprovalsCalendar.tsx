import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Link } from "wouter";
import {
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
  FileText,
  ShieldCheck,
  AlertTriangle,
  CheckSquare,
  Clock,
  XCircle,
} from "lucide-react";

const EVENT_TYPE_CONFIG = {
  lodgement: { icon: FileText, color: "bg-blue-500", label: "Lodgement", textColor: "text-blue-700", dotColor: "bg-blue-400" },
  inspection: { icon: ShieldCheck, color: "bg-indigo-500", label: "Inspection", textColor: "text-indigo-700", dotColor: "bg-indigo-400" },
  rfi_due: { icon: AlertTriangle, color: "bg-orange-500", label: "RFI Due", textColor: "text-orange-700", dotColor: "bg-orange-400" },
  task_due: { icon: CheckSquare, color: "bg-emerald-500", label: "Task Due", textColor: "text-emerald-700", dotColor: "bg-emerald-400" },
  determination: { icon: FileText, color: "bg-green-600", label: "Determination", textColor: "text-green-700", dotColor: "bg-green-400" },
  expiry: { icon: XCircle, color: "bg-red-500", label: "Expiry", textColor: "text-red-700", dotColor: "bg-red-400" },
};

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default function ApprovalsCalendar() {
  const today = new Date();
  const [currentMonth, setCurrentMonth] = useState(today.getMonth() + 1);
  const [currentYear, setCurrentYear] = useState(today.getFullYear());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<string | null>(null);

  const { data, isLoading } = trpc.approvals.calendarEvents.useQuery({
    month: currentMonth,
    year: currentYear,
  });

  const events = data?.events || [];

  // Group events by date
  const eventsByDate = useMemo(() => {
    const map = new Map<string, typeof events>();
    for (const ev of events) {
      if (typeFilter && ev.type !== typeFilter) continue;
      const existing = map.get(ev.date) || [];
      existing.push(ev);
      map.set(ev.date, existing);
    }
    return map;
  }, [events, typeFilter]);

  // Calendar grid generation
  const calendarDays = useMemo(() => {
    const firstDay = new Date(currentYear, currentMonth - 1, 1);
    const lastDay = new Date(currentYear, currentMonth, 0);
    const daysInMonth = lastDay.getDate();
    // Monday=0, Sunday=6
    let startDow = firstDay.getDay() - 1;
    if (startDow < 0) startDow = 6;

    const days: { day: number | null; dateStr: string | null }[] = [];
    // Pad start
    for (let i = 0; i < startDow; i++) {
      days.push({ day: null, dateStr: null });
    }
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${currentYear}-${String(currentMonth).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      days.push({ day: d, dateStr });
    }
    return days;
  }, [currentMonth, currentYear]);

  const selectedEvents = selectedDate ? (eventsByDate.get(selectedDate) || []) : [];
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  const goToPrev = () => {
    if (currentMonth === 1) { setCurrentMonth(12); setCurrentYear(y => y - 1); }
    else setCurrentMonth(m => m - 1);
    setSelectedDate(null);
  };
  const goToNext = () => {
    if (currentMonth === 12) { setCurrentMonth(1); setCurrentYear(y => y + 1); }
    else setCurrentMonth(m => m + 1);
    setSelectedDate(null);
  };
  const goToToday = () => {
    setCurrentMonth(today.getMonth() + 1);
    setCurrentYear(today.getFullYear());
    setSelectedDate(todayStr);
  };

  // Count events by type for the legend/filter
  const typeCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const ev of events) {
      counts[ev.type] = (counts[ev.type] || 0) + 1;
    }
    return counts;
  }, [events]);

  const overdueCount = events.filter(e => e.isOverdue).length;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <CalendarIcon className="h-4 w-4" /> Approvals Calendar
          </CardTitle>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={goToPrev}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm" className="text-sm font-medium px-2" onClick={goToToday}>
              {MONTHS[currentMonth - 1]} {currentYear}
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={goToNext}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
        {/* Type filter pills */}
        <div className="flex flex-wrap gap-1.5 mt-2">
          <Button
            variant={typeFilter === null ? "default" : "outline"}
            size="sm"
            className="h-6 text-xs px-2"
            onClick={() => setTypeFilter(null)}
          >
            All ({events.length})
          </Button>
          {Object.entries(EVENT_TYPE_CONFIG).map(([type, config]) => {
            const count = typeCounts[type] || 0;
            if (count === 0) return null;
            return (
              <Button
                key={type}
                variant={typeFilter === type ? "default" : "outline"}
                size="sm"
                className="h-6 text-xs px-2"
                onClick={() => setTypeFilter(typeFilter === type ? null : type)}
              >
                <div className={`w-2 h-2 rounded-full ${config.dotColor} mr-1`} />
                {config.label} ({count})
              </Button>
            );
          })}
          {overdueCount > 0 && (
            <Badge variant="destructive" className="text-xs h-6">
              {overdueCount} Overdue
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="h-64 flex items-center justify-center text-muted-foreground text-sm">Loading calendar...</div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Calendar Grid */}
            <div className="lg:col-span-2">
              {/* Day headers */}
              <div className="grid grid-cols-7 mb-1">
                {DAYS.map((d) => (
                  <div key={d} className="text-center text-xs font-medium text-muted-foreground py-1">
                    {d}
                  </div>
                ))}
              </div>
              {/* Day cells */}
              <div className="grid grid-cols-7 gap-px bg-border rounded-lg overflow-hidden">
                {calendarDays.map((cell, idx) => {
                  if (!cell.day || !cell.dateStr) {
                    return <div key={idx} className="bg-muted/30 min-h-[3.5rem]" />;
                  }
                  const dayEvents = eventsByDate.get(cell.dateStr) || [];
                  const isToday = cell.dateStr === todayStr;
                  const isSelected = cell.dateStr === selectedDate;
                  const hasOverdue = dayEvents.some(e => e.isOverdue);

                  return (
                    <div
                      key={idx}
                      onClick={() => setSelectedDate(cell.dateStr)}
                      className={`bg-background min-h-[3.5rem] p-1 cursor-pointer transition-colors hover:bg-muted/50 ${
                        isSelected ? "ring-2 ring-primary ring-inset" : ""
                      }`}
                    >
                      <div className={`text-xs font-medium mb-0.5 ${
                        isToday ? "bg-primary text-primary-foreground w-5 h-5 rounded-full flex items-center justify-center" : "text-foreground"
                      }`}>
                        {cell.day}
                      </div>
                      {dayEvents.length > 0 && (
                        <div className="flex flex-wrap gap-0.5">
                          {dayEvents.slice(0, 3).map((ev) => {
                            const config = EVENT_TYPE_CONFIG[ev.type];
                            return (
                              <div
                                key={ev.id}
                                className={`w-1.5 h-1.5 rounded-full ${hasOverdue && ev.isOverdue ? "bg-red-500" : config.dotColor}`}
                                title={ev.label}
                              />
                            );
                          })}
                          {dayEvents.length > 3 && (
                            <span className="text-[9px] text-muted-foreground">+{dayEvents.length - 3}</span>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Day Detail Panel */}
            <div className="space-y-2">
              <div className="text-sm font-medium text-muted-foreground">
                {selectedDate ? new Date(selectedDate + "T00:00:00").toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long" }) : "Select a day"}
              </div>
              {selectedDate && selectedEvents.length === 0 && (
                <p className="text-xs text-muted-foreground py-4 text-center">No events on this day</p>
              )}
              <div className="space-y-2 max-h-[20rem] overflow-y-auto">
                {selectedEvents.map((ev) => {
                  const config = EVENT_TYPE_CONFIG[ev.type];
                  const Icon = config.icon;
                  return (
                    <Link key={ev.id} href={`/approvals/projects/${ev.projectId}`}>
                      <div className={`p-2 rounded-md border text-xs cursor-pointer hover:bg-muted/50 transition-colors ${
                        ev.isOverdue ? "border-red-300 bg-red-50 dark:bg-red-950/20" : ""
                      }`}>
                        <div className="flex items-start gap-2">
                          <div className={`p-1 rounded ${config.color} shrink-0 mt-0.5`}>
                            <Icon className="h-3 w-3 text-white" />
                          </div>
                          <div className="min-w-0">
                            <p className="font-medium truncate">{ev.label}</p>
                            <div className="flex items-center gap-1 mt-0.5">
                              <Badge variant="outline" className="text-[10px] h-4 px-1">
                                {config.label}
                              </Badge>
                              {ev.isOverdue && (
                                <Badge variant="destructive" className="text-[10px] h-4 px-1">
                                  Overdue
                                </Badge>
                              )}
                              <span className="text-muted-foreground truncate">{ev.status}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
