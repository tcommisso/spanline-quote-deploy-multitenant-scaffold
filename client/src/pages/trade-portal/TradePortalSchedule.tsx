import { useState, useMemo, useRef, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronLeft, ChevronRight, CalendarDays, MapPin, Clock, List, Calendar, Eye } from "lucide-react";
import { useIsMobile } from "@/hooks/useMobile";

const statusColors: Record<string, string> = {
  scheduled: "bg-blue-500",
  confirmed: "bg-emerald-500",
  completed: "bg-green-500",
  cancelled: "bg-red-400",
};

const statusLabels: Record<string, string> = {
  scheduled: "Scheduled",
  confirmed: "Confirmed",
  completed: "Completed",
  cancelled: "Cancelled",
};

const eventTypeColors: Record<string, string> = {
  installation: "border-l-primary",
  inspection: "border-l-blue-500",
  meeting: "border-l-purple-500",
  delivery: "border-l-green-500",
  other: "border-l-gray-400",
};

const eventTypeBg: Record<string, string> = {
  installation: "bg-primary/5",
  inspection: "bg-blue-50",
  meeting: "bg-purple-50",
  delivery: "bg-green-50",
  other: "bg-gray-50",
};

const eventTypeLabels: Record<string, string> = {
  installation: "Installation",
  inspection: "Inspection",
  meeting: "Meeting",
  delivery: "Delivery",
  other: "Other",
};

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function formatDayHeader(date: Date) {
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (isSameDay(date, today)) return "Today";
  if (isSameDay(date, tomorrow)) return "Tomorrow";
  if (isSameDay(date, yesterday)) return "Yesterday";
  return date.toLocaleDateString("en-AU", { weekday: "long" });
}

export default function TradePortalSchedule() {
  const isMobile = useIsMobile();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [view, setView] = useState<"day" | "month" | "list">("day");

  // Swipe handling for day view
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  }, []);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (touchStartX.current === null || touchStartY.current === null) return;
    const deltaX = e.changedTouches[0].clientX - touchStartX.current;
    const deltaY = e.changedTouches[0].clientY - touchStartY.current;
    // Only trigger if horizontal swipe is dominant and > 50px
    if (Math.abs(deltaX) > 50 && Math.abs(deltaX) > Math.abs(deltaY) * 1.5) {
      if (deltaX < 0) {
        // Swipe left → next day
        setCurrentDate(prev => {
          const next = new Date(prev);
          next.setDate(next.getDate() + 1);
          return next;
        });
      } else {
        // Swipe right → previous day
        setCurrentDate(prev => {
          const next = new Date(prev);
          next.setDate(next.getDate() - 1);
          return next;
        });
      }
    }
    touchStartX.current = null;
    touchStartY.current = null;
  }, []);

  const { data: events, isLoading } = trpc.tradePortal.getSchedule.useQuery();

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  // Events for the selected day (day view)
  const dayEvents = useMemo(() => {
    if (!events) return [];
    return events.filter(e => {
      const eDate = new Date(e.startTime);
      return isSameDay(eDate, currentDate);
    }).sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
  }, [events, currentDate]);

  // Week days for the day-view week strip
  const weekDays = useMemo(() => {
    const start = new Date(currentDate);
    const dayOfWeek = start.getDay();
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    start.setDate(start.getDate() + mondayOffset);
    const days: Date[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      days.push(d);
    }
    return days;
  }, [currentDate]);

  // Calendar month data
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayOfWeek = new Date(year, month, 1).getDay();
  const startOffset = firstDayOfWeek === 0 ? 6 : firstDayOfWeek - 1;

  const calendarDays = useMemo(() => {
    const days: { date: Date; events: typeof events }[] = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(year, month, d);
      const dayEvts = events?.filter(e => {
        const eDate = new Date(e.startTime);
        return eDate.getFullYear() === year && eDate.getMonth() === month && eDate.getDate() === d;
      }) || [];
      days.push({ date, events: dayEvts });
    }
    return days;
  }, [events, year, month, daysInMonth]);

  // Upcoming events for list view
  const upcomingEvents = useMemo(() => {
    if (!events) return [];
    const now = new Date();
    return events.filter(e => new Date(e.startTime) >= now).slice(0, 20);
  }, [events]);

  function prevDay() {
    setCurrentDate(prev => {
      const next = new Date(prev);
      next.setDate(next.getDate() - 1);
      return next;
    });
  }
  function nextDay() {
    setCurrentDate(prev => {
      const next = new Date(prev);
      next.setDate(next.getDate() + 1);
      return next;
    });
  }
  function prevMonth() { setCurrentDate(new Date(year, month - 1, 1)); }
  function nextMonth() { setCurrentDate(new Date(year, month + 1, 1)); }
  function goToToday() { setCurrentDate(new Date()); }

  const isToday = (date: Date) => isSameDay(date, new Date());

  // Count events for a date (used in week strip)
  function eventCountForDate(date: Date) {
    if (!events) return 0;
    return events.filter(e => isSameDay(new Date(e.startTime), date)).length;
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-16" />
        <Skeleton className="h-32" />
        <Skeleton className="h-32" />
      </div>
    );
  }

  return (
    <div className="space-y-3 sm:space-y-6">
      {/* Header with view toggles */}
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl sm:text-2xl font-bold text-slate-800">My Schedule</h1>
        <div className="flex items-center gap-1">
          {/* Day view - shown on all sizes but primary on mobile */}
          <Button
            variant={view === "day" ? "default" : "outline"}
            size="sm"
            onClick={() => setView("day")}
            className={`h-8 px-2 sm:px-3 ${view === "day" ? "bg-primary hover:bg-primary/90 text-primary-foreground" : ""}`}
          >
            <Eye className="w-4 h-4 sm:mr-1" />
            <span className="hidden sm:inline">Day</span>
          </Button>
          <Button
            variant={view === "month" ? "default" : "outline"}
            size="sm"
            onClick={() => setView("month")}
            className={`h-8 px-2 sm:px-3 ${view === "month" ? "bg-primary hover:bg-primary/90 text-primary-foreground" : ""}`}
          >
            <Calendar className="w-4 h-4 sm:mr-1" />
            <span className="hidden sm:inline">Month</span>
          </Button>
          <Button
            variant={view === "list" ? "default" : "outline"}
            size="sm"
            onClick={() => setView("list")}
            className={`h-8 px-2 sm:px-3 ${view === "list" ? "bg-primary hover:bg-primary/90 text-primary-foreground" : ""}`}
          >
            <List className="w-4 h-4 sm:mr-1" />
            <span className="hidden sm:inline">List</span>
          </Button>
        </div>
      </div>

      {/* ========== DAY VIEW ========== */}
      {view === "day" && (
        <div
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          {/* Date navigation */}
          <div className="flex items-center justify-between mb-3">
            <Button variant="ghost" size="icon" onClick={prevDay} className="h-9 w-9">
              <ChevronLeft className="w-5 h-5" />
            </Button>
            <div className="text-center">
              <p className="text-lg sm:text-xl font-bold text-slate-800">{formatDayHeader(currentDate)}</p>
              <p className="text-xs text-muted-foreground">
                {currentDate.toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
              </p>
            </div>
            <Button variant="ghost" size="icon" onClick={nextDay} className="h-9 w-9">
              <ChevronRight className="w-5 h-5" />
            </Button>
          </div>

          {/* Week strip */}
          <div className="grid grid-cols-7 gap-1 mb-4">
            {weekDays.map((day) => {
              const selected = isSameDay(day, currentDate);
              const today = isToday(day);
              const count = eventCountForDate(day);
              return (
                <button
                  key={day.toISOString()}
                  onClick={() => setCurrentDate(new Date(day))}
                  className={`flex flex-col items-center py-2 rounded-xl transition-all ${
                    selected
                      ? "bg-primary text-primary-foreground shadow-md"
                      : today
                      ? "bg-primary/10 text-primary ring-1 ring-primary/50"
                      : "text-slate-600 hover:bg-slate-100 active:bg-slate-200"
                  }`}
                >
                  <span className="text-[10px] font-medium uppercase">
                    {day.toLocaleDateString("en-AU", { weekday: "short" }).slice(0, 3)}
                  </span>
                  <span className={`text-base font-bold mt-0.5 ${selected ? "text-white" : ""}`}>
                    {day.getDate()}
                  </span>
                  {count > 0 && (
                    <div className={`flex gap-0.5 mt-1`}>
                      {Array.from({ length: Math.min(count, 3) }).map((_, i) => (
                        <div
                          key={i}
                          className={`w-1.5 h-1.5 rounded-full ${selected ? "bg-primary-foreground/80" : "bg-primary"}`}
                        />
                      ))}
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          {/* Today button if not viewing today */}
          {!isToday(currentDate) && (
            <div className="flex justify-center mb-3">
              <Button variant="outline" size="sm" onClick={goToToday} className="text-xs h-7">
                <CalendarDays className="w-3 h-3 mr-1" /> Go to Today
              </Button>
            </div>
          )}

          {/* Day's events */}
          {dayEvents.length > 0 ? (
            <div className="space-y-3">
              {dayEvents.map((event) => (
                <Card
                  key={event.id}
                  className={`border-l-4 ${eventTypeColors[event.eventType] || "border-l-gray-400"} overflow-hidden`}
                >
                  <CardContent className={`p-4 ${eventTypeBg[event.eventType] || "bg-white"}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <Badge variant="outline" className="text-[10px] shrink-0">
                            {eventTypeLabels[event.eventType] || event.eventType}
                          </Badge>
                          <div className={`w-2 h-2 rounded-full shrink-0 ${statusColors[event.status] || "bg-gray-400"}`} title={event.status} />
                          <span className="text-[10px] text-muted-foreground">{statusLabels[event.status] || event.status}</span>
                        </div>
                        <p className="font-semibold text-sm sm:text-base text-slate-800">{event.title}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{event.clientName} — {event.quoteNumber}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="flex items-center gap-1 text-sm font-medium text-slate-700">
                          <Clock className="w-3.5 h-3.5" />
                          {new Date(event.startTime).toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit" })}
                        </div>
                        {event.endTime && (
                          <p className="text-[10px] text-muted-foreground mt-0.5">
                            to {new Date(event.endTime).toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit" })}
                          </p>
                        )}
                      </div>
                    </div>
                    {event.siteAddress && (
                      <div className="flex items-start gap-1.5 mt-2 pt-2 border-t border-slate-200/60">
                        <MapPin className="w-3.5 h-3.5 text-muted-foreground mt-0.5 shrink-0" />
                        <p className="text-xs text-muted-foreground leading-relaxed">{event.siteAddress}</p>
                      </div>
                    )}
                    {event.description && (
                      <p className="text-xs text-slate-600 mt-2 leading-relaxed">{event.description}</p>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="py-12 text-center">
                <CalendarDays className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground font-medium">No events scheduled</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {isToday(currentDate) ? "You have a free day today" : `Nothing scheduled for ${currentDate.toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long" })}`}
                </p>
              </CardContent>
            </Card>
          )}

          <p className="text-[10px] text-center text-muted-foreground mt-4 sm:hidden">
            Swipe left/right to change day
          </p>
        </div>
      )}

      {/* ========== MONTH VIEW ========== */}
      {view === "month" && (
        <Card>
          <CardHeader className="pb-2 px-3 sm:px-6">
            <div className="flex items-center justify-between">
              <Button variant="ghost" size="icon" onClick={prevMonth}><ChevronLeft className="w-4 h-4" /></Button>
              <CardTitle className="text-base sm:text-lg">
                {currentDate.toLocaleDateString("en-AU", { month: "long", year: "numeric" })}
              </CardTitle>
              <Button variant="ghost" size="icon" onClick={nextMonth}><ChevronRight className="w-4 h-4" /></Button>
            </div>
          </CardHeader>
          <CardContent className="px-2 sm:px-6">
            <div className="grid grid-cols-7 gap-px bg-slate-200 rounded-lg overflow-hidden">
              {(isMobile ? ["M", "T", "W", "T", "F", "S", "S"] : ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]).map((d, i) => (
                <div key={`${d}-${i}`} className="bg-slate-100 p-1 sm:p-2 text-center text-[10px] sm:text-xs font-medium text-muted-foreground">{d}</div>
              ))}
              {Array.from({ length: startOffset }).map((_, i) => (
                <div key={`empty-${i}`} className="bg-white p-1 sm:p-2 min-h-[48px] sm:min-h-[80px]" />
              ))}
              {calendarDays.map(({ date, events: dayEvts }) => (
                <div
                  key={date.getDate()}
                  className={`bg-white p-1 sm:p-1.5 min-h-[48px] sm:min-h-[80px] cursor-pointer hover:bg-slate-50 active:bg-slate-100 transition-colors ${isToday(date) ? "ring-2 ring-primary ring-inset" : ""}`}
                  onClick={() => { setCurrentDate(new Date(date)); setView("day"); }}
                >
                  <p className={`text-[10px] sm:text-xs font-medium mb-0.5 sm:mb-1 ${isToday(date) ? "text-primary" : "text-slate-600"}`}>
                    {date.getDate()}
                  </p>
                  {/* On mobile, show dots */}
                  <div className="sm:hidden flex flex-wrap gap-0.5">
                    {dayEvts && dayEvts.slice(0, 4).map((ev) => (
                      <div
                        key={ev.id}
                        className={`w-1.5 h-1.5 rounded-full ${
                          ev.eventType === "installation" ? "bg-primary/50" :
                          ev.eventType === "inspection" ? "bg-blue-500" :
                          ev.eventType === "meeting" ? "bg-purple-500" :
                          ev.eventType === "delivery" ? "bg-green-500" : "bg-gray-400"
                        }`}
                      />
                    ))}
                    {dayEvts && dayEvts.length > 4 && (
                      <span className="text-[8px] text-muted-foreground">+{dayEvts.length - 4}</span>
                    )}
                  </div>
                  {/* On desktop, show text labels */}
                  <div className="hidden sm:block">
                    {dayEvts && dayEvts.slice(0, 3).map((ev) => (
                      <div
                        key={ev.id}
                        className={`text-[10px] px-1 py-0.5 mb-0.5 rounded truncate border-l-2 ${eventTypeColors[ev.eventType] || "border-l-gray-400"} bg-slate-50`}
                        title={`${ev.title} — ${ev.clientName}`}
                      >
                        {ev.title}
                      </div>
                    ))}
                    {dayEvts && dayEvts.length > 3 && (
                      <p className="text-[10px] text-muted-foreground">+{dayEvts.length - 3} more</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ========== LIST VIEW ========== */}
      {view === "list" && (
        <Card>
          <CardHeader className="px-4 sm:px-6">
            <CardTitle className="text-base sm:text-lg flex items-center gap-2">
              <CalendarDays className="w-4 h-4 sm:w-5 sm:h-5 text-primary" />
              Upcoming Events
            </CardTitle>
          </CardHeader>
          <CardContent className="px-3 sm:px-6">
            {upcomingEvents.length > 0 ? (
              <div className="space-y-2 sm:space-y-3">
                {upcomingEvents.map((event) => (
                  <div
                    key={event.id}
                    className={`flex items-start gap-3 p-3 rounded-lg border-l-4 ${eventTypeColors[event.eventType] || "border-l-gray-400"} ${eventTypeBg[event.eventType] || "bg-slate-50"} cursor-pointer hover:shadow-sm active:bg-slate-100 transition-all`}
                    onClick={() => { setCurrentDate(new Date(event.startTime)); setView("day"); }}
                  >
                    <div className="text-center min-w-[40px] sm:min-w-[50px]">
                      <p className="text-[10px] sm:text-xs text-muted-foreground">
                        {new Date(event.startTime).toLocaleDateString("en-AU", { weekday: "short" })}
                      </p>
                      <p className="text-base sm:text-lg font-bold">
                        {new Date(event.startTime).getDate()}
                      </p>
                      <p className="text-[10px] sm:text-xs text-muted-foreground">
                        {new Date(event.startTime).toLocaleDateString("en-AU", { month: "short" })}
                      </p>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{event.title}</p>
                      <p className="text-xs text-muted-foreground truncate">{event.clientName} — {event.quoteNumber}</p>
                      {event.siteAddress && (
                        <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                          <MapPin className="w-3 h-3 shrink-0" />
                          <span className="truncate">{event.siteAddress}</span>
                        </p>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <Badge variant="outline" className="text-[10px] sm:text-xs">{eventTypeLabels[event.eventType] || event.eventType}</Badge>
                      <div className={`w-2 h-2 rounded-full ${statusColors[event.status] || "bg-gray-400"}`} title={event.status} />
                      <span className="text-[10px] sm:text-xs text-muted-foreground flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {new Date(event.startTime).toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-6 sm:py-8">No upcoming events</p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
