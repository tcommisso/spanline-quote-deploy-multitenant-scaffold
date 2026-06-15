import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, ChevronRight, Building, FileCheck, Clock, Mail, AlertTriangle } from "lucide-react";
import { useLocation } from "wouter";

type EventType = "application" | "approval" | "followup" | "letter_sent";

const EVENT_COLORS: Record<EventType, string> = {
  application: "bg-blue-100 text-blue-800 border-blue-300",
  approval: "bg-green-100 text-green-800 border-green-300",
  followup: "bg-amber-100 text-amber-800 border-amber-300",
  letter_sent: "bg-purple-100 text-purple-800 border-purple-300",
};

const EVENT_ICONS: Record<EventType, typeof Building> = {
  application: FileCheck,
  approval: Building,
  followup: Clock,
  letter_sent: Mail,
};

const EVENT_LABELS: Record<EventType, string> = {
  application: "Application",
  approval: "Approval",
  followup: "Follow-up Due",
  letter_sent: "Letter Sent",
};

export default function BaCalendar() {
  const [, navigate] = useLocation();
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const month = currentDate.getMonth() + 1;
  const year = currentDate.getFullYear();

  const eventsQuery = trpc.crm.buildingAuthority.calendarEvents.useQuery({ month, year });

  const navigatePrev = () => {
    const d = new Date(currentDate);
    d.setMonth(d.getMonth() - 1);
    setCurrentDate(d);
    setSelectedDay(null);
  };
  const navigateNext = () => {
    const d = new Date(currentDate);
    d.setMonth(d.getMonth() + 1);
    setCurrentDate(d);
    setSelectedDay(null);
  };
  const navigateToday = () => {
    setCurrentDate(new Date());
    setSelectedDay(null);
  };

  const calendarDays = useMemo(() => {
    const y = currentDate.getFullYear();
    const m = currentDate.getMonth();
    const firstDay = new Date(y, m, 1);
    const lastDay = new Date(y, m + 1, 0);
    const startOffset = firstDay.getDay();
    const days: Date[] = [];
    for (let i = startOffset - 1; i >= 0; i--) {
      days.push(new Date(y, m, -i));
    }
    for (let i = 1; i <= lastDay.getDate(); i++) {
      days.push(new Date(y, m, i));
    }
    while (days.length < 42) {
      days.push(new Date(y, m + 1, days.length - startOffset - lastDay.getDate() + 1));
    }
    return days;
  }, [currentDate]);

  type BaEvent = {
    id: number;
    leadId: number;
    date: string;
    type: EventType;
    label: string;
    clientName: string;
    councilName: string | null;
    status: string | null;
    isOverdue: boolean;
  };

  const eventsByDate = useMemo(() => {
    const map: Record<string, BaEvent[]> = {};
    for (const event of (eventsQuery.data?.events || []) as BaEvent[]) {
      const key = event.date;
      if (!map[key]) map[key] = [];
      map[key].push(event);
    }
    return map;
  }, [eventsQuery.data]);

  const today = new Date().toISOString().split("T")[0];
  const currentMonth = currentDate.getMonth();

  const selectedEvents: BaEvent[] = selectedDay ? (eventsByDate[selectedDay] || []) : [];

  // Summary counts
  const summary = useMemo(() => {
    const events = (eventsQuery.data?.events || []) as BaEvent[];
    return {
      applications: events.filter(e => e.type === "application").length,
      approvals: events.filter(e => e.type === "approval").length,
      followups: events.filter(e => e.type === "followup").length,
      overdue: events.filter(e => e.isOverdue).length,
      lettersSent: events.filter(e => e.type === "letter_sent").length,
    };
  }, [eventsQuery.data]);

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Building className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold">Approvals Calendar</h1>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card className="p-3">
          <div className="flex items-center gap-2">
            <FileCheck className="h-4 w-4 text-blue-600" />
            <div>
              <div className="text-lg font-bold">{summary.applications}</div>
              <div className="text-xs text-muted-foreground">Applications</div>
            </div>
          </div>
        </Card>
        <Card className="p-3">
          <div className="flex items-center gap-2">
            <Building className="h-4 w-4 text-green-600" />
            <div>
              <div className="text-lg font-bold">{summary.approvals}</div>
              <div className="text-xs text-muted-foreground">Approvals</div>
            </div>
          </div>
        </Card>
        <Card className="p-3">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-amber-600" />
            <div>
              <div className="text-lg font-bold">{summary.followups}</div>
              <div className="text-xs text-muted-foreground">Follow-ups</div>
            </div>
          </div>
        </Card>
        <Card className="p-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-red-600" />
            <div>
              <div className="text-lg font-bold text-red-600">{summary.overdue}</div>
              <div className="text-xs text-muted-foreground">Overdue</div>
            </div>
          </div>
        </Card>
        <Card className="p-3">
          <div className="flex items-center gap-2">
            <Mail className="h-4 w-4 text-purple-600" />
            <div>
              <div className="text-lg font-bold">{summary.lettersSent}</div>
              <div className="text-xs text-muted-foreground">Letters Sent</div>
            </div>
          </div>
        </Card>
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={navigatePrev}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={navigateToday}>Today</Button>
          <Button variant="outline" size="sm" onClick={navigateNext}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <span className="font-medium ml-2">
            {currentDate.toLocaleDateString("en-AU", { month: "long", year: "numeric" })}
          </span>
        </div>
        <div className="flex gap-2 flex-wrap">
          {Object.entries(EVENT_LABELS).map(([type, label]) => (
            <div key={type} className="flex items-center gap-1 text-xs">
              <div className={`w-3 h-3 rounded-sm border ${EVENT_COLORS[type as EventType]}`} />
              <span className="text-muted-foreground">{label}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Calendar Grid */}
        <Card className="lg:col-span-2">
          <CardContent className="p-2">
            <div className="grid grid-cols-7 gap-px bg-muted">
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(day => (
                <div key={day} className="text-center text-xs font-medium text-muted-foreground py-2 bg-background">{day}</div>
              ))}
              {calendarDays.map((day, idx) => {
                const dateStr = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
                const dayEvents = eventsByDate[dateStr] || [];
                const isToday = dateStr === today;
                const isCurrentMonth = day.getMonth() === currentMonth;
                const isSelected = dateStr === selectedDay;
                return (
                  <button
                    key={idx}
                    onClick={() => setSelectedDay(dateStr === selectedDay ? null : dateStr)}
                    className={`min-h-[80px] p-1 bg-background text-left transition-colors hover:bg-muted/50 ${!isCurrentMonth ? "opacity-40" : ""} ${isToday ? "ring-2 ring-primary ring-inset" : ""} ${isSelected ? "bg-primary/5 ring-2 ring-primary" : ""}`}
                  >
                    <div className="text-xs font-medium mb-1">{day.getDate()}</div>
                    <div className="space-y-0.5">
                      {dayEvents.slice(0, 3).map((event, i) => {
                        const Icon = EVENT_ICONS[event.type];
                        return (
                          <div
                            key={i}
                            className={`flex items-center gap-0.5 text-[10px] px-1 py-0.5 rounded border truncate ${EVENT_COLORS[event.type]} ${event.isOverdue ? "ring-1 ring-red-500" : ""}`}
                          >
                            <Icon className="h-2.5 w-2.5 flex-shrink-0" />
                            <span className="truncate">{event.clientName}</span>
                          </div>
                        );
                      })}
                      {dayEvents.length > 3 && (
                        <Badge variant="secondary" className="text-[9px]">+{dayEvents.length - 3} more</Badge>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Side Panel - Event Details */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">
              {selectedDay
                ? new Date(selectedDay + "T00:00:00").toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long", year: "numeric" })
                : "Select a day to view events"
              }
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {!selectedDay && (
              <p className="text-sm text-muted-foreground">Click on a day in the calendar to see approval events for that date.</p>
            )}
            {selectedDay && selectedEvents.length === 0 && (
              <p className="text-sm text-muted-foreground">No approval events on this day.</p>
            )}
            {selectedEvents.map((event, i) => {
              const Icon = EVENT_ICONS[event.type];
              return (
                <div
                  key={i}
                  className={`p-3 rounded-lg border ${EVENT_COLORS[event.type]} ${event.isOverdue ? "ring-2 ring-red-500" : ""}`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <Icon className="h-4 w-4" />
                    <span className="font-medium text-sm">{EVENT_LABELS[event.type]}</span>
                    {event.isOverdue && (
                      <Badge variant="destructive" className="text-[10px] px-1 py-0">OVERDUE</Badge>
                    )}
                  </div>
                  <div className="text-sm font-medium">{event.clientName}</div>
                  {event.councilName && (
                    <div className="text-xs opacity-80">Council: {event.councilName}</div>
                  )}
                  {event.status && (
                    <div className="text-xs opacity-80">Status: {event.status.charAt(0).toUpperCase() + event.status.slice(1)}</div>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="mt-1 h-6 text-xs px-2"
                    onClick={() => navigate(`/construction/clients/${event.leadId}`)}
                  >
                    View Client →
                  </Button>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
