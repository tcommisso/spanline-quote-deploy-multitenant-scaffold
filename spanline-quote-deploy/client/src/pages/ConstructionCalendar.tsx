import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useLocation } from "wouter";

export default function ConstructionCalendar() {
  const [, navigate] = useLocation();
  const jobsQuery = trpc.construction.jobs.list.useQuery();
  const [viewMode, setViewMode] = useState<"week" | "month">("month");
  const [currentDate, setCurrentDate] = useState(() => new Date());

  const navigatePrev = () => {
    const d = new Date(currentDate);
    if (viewMode === "month") d.setMonth(d.getMonth() - 1);
    else d.setDate(d.getDate() - 7);
    setCurrentDate(d);
  };
  const navigateNext = () => {
    const d = new Date(currentDate);
    if (viewMode === "month") d.setMonth(d.getMonth() + 1);
    else d.setDate(d.getDate() + 7);
    setCurrentDate(d);
  };
  const navigateToday = () => setCurrentDate(new Date());

  const calendarDays = useMemo(() => {
    if (viewMode === "month") {
      const year = currentDate.getFullYear();
      const month = currentDate.getMonth();
      const firstDay = new Date(year, month, 1);
      const lastDay = new Date(year, month + 1, 0);
      const startOffset = firstDay.getDay();
      const days: Date[] = [];
      for (let i = startOffset - 1; i >= 0; i--) {
        days.push(new Date(year, month, -i));
      }
      for (let i = 1; i <= lastDay.getDate(); i++) {
        days.push(new Date(year, month, i));
      }
      while (days.length < 42) {
        days.push(new Date(year, month + 1, days.length - startOffset - lastDay.getDate() + 1));
      }
      return days;
    } else {
      const d = new Date(currentDate);
      const dayOfWeek = d.getDay();
      const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
      const monday = new Date(d);
      monday.setDate(d.getDate() + mondayOffset);
      const days: Date[] = [];
      for (let i = 0; i < 7; i++) {
        const day = new Date(monday);
        day.setDate(monday.getDate() + i);
        days.push(day);
      }
      return days;
    }
  }, [currentDate, viewMode]);

  const jobsByDate = useMemo(() => {
    const map: Record<string, any[]> = {};
    for (const job of (jobsQuery.data || [])) {
      if (job.scheduledStart) {
        const key = new Date(job.scheduledStart).toDateString();
        if (!map[key]) map[key] = [];
        map[key].push(job);
      }
    }
    return map;
  }, [jobsQuery.data]);

  const statusColor = (status: string) => {
    switch (status) {
      case "in_progress": return "bg-blue-100 text-blue-800 border-blue-200";
      case "completed": return "bg-green-100 text-green-800 border-green-200";
      case "on_hold": return "bg-yellow-100 text-yellow-800 border-yellow-200";
      case "cancelled": return "bg-red-100 text-red-800 border-red-200";
      default: return "bg-gray-100 text-gray-800 border-gray-200";
    }
  };

  const today = new Date().toDateString();
  const currentMonth = currentDate.getMonth();

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Calendar</h1>
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
        <div className="flex gap-1">
          <Button variant={viewMode === "week" ? "default" : "outline"} size="sm" onClick={() => setViewMode("week")}>Week</Button>
          <Button variant={viewMode === "month" ? "default" : "outline"} size="sm" onClick={() => setViewMode("month")}>Month</Button>
        </div>
      </div>

      {/* Calendar Grid */}
      <Card>
        <CardContent className="p-2">
          <div className="grid grid-cols-7 gap-px bg-muted">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(day => (
              <div key={day} className="text-center text-xs font-medium text-muted-foreground py-2 bg-background">{day}</div>
            ))}
            {calendarDays.map((day, idx) => {
              const key = day.toDateString();
              const dayJobs = jobsByDate[key] || [];
              const isToday = key === today;
              const isCurrentMonth = day.getMonth() === currentMonth;
              return (
                <div
                  key={idx}
                  className={`min-h-[80px] p-1 bg-background ${!isCurrentMonth ? "opacity-40" : ""} ${isToday ? "ring-2 ring-primary ring-inset" : ""}`}
                >
                  <div className="text-xs font-medium mb-1">{day.getDate()}</div>
                  <div className="space-y-0.5">
                    {dayJobs.slice(0, 3).map((job) => (
                      <button
                        key={job.id}
                        onClick={() => navigate(`/construction`)}
                        className={`w-full text-left text-[10px] px-1 py-0.5 rounded border truncate ${statusColor(job.status)}`}
                      >
                        {job.jobNumber}
                      </button>
                    ))}
                    {dayJobs.length > 3 && (
                      <Badge variant="secondary" className="text-[9px]">+{dayJobs.length - 3} more</Badge>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
