import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar, ChevronLeft, ChevronRight, Truck } from "lucide-react";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default function ManufacturingDeliveryCalendar() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [driverFilter, setDriverFilter] = useState("all");

  const { data: drivers } = trpc.manufacturingDispatch.drivers.list.useQuery({});

  const startOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
  const endOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);

  const { data: schedule } = trpc.manufacturingDispatch.dispatches.driverSchedule.useQuery({
    driverId: driverFilter !== "all" ? Number(driverFilter) : undefined,
    startDate: startOfMonth.toISOString(),
    endDate: endOfMonth.toISOString(),
  });

  // Build calendar grid
  const calendarDays = useMemo(() => {
    const days: { date: Date; isCurrentMonth: boolean }[] = [];
    const firstDay = startOfMonth.getDay(); // 0=Sun
    const startOffset = firstDay === 0 ? 6 : firstDay - 1; // Adjust for Mon start

    // Previous month padding
    for (let i = startOffset - 1; i >= 0; i--) {
      const d = new Date(startOfMonth);
      d.setDate(d.getDate() - i - 1);
      days.push({ date: d, isCurrentMonth: false });
    }
    // Current month
    for (let i = 1; i <= endOfMonth.getDate(); i++) {
      days.push({ date: new Date(currentDate.getFullYear(), currentDate.getMonth(), i), isCurrentMonth: true });
    }
    // Next month padding
    while (days.length % 7 !== 0) {
      const last = days[days.length - 1].date;
      const next = new Date(last);
      next.setDate(next.getDate() + 1);
      days.push({ date: next, isCurrentMonth: false });
    }
    return days;
  }, [currentDate]);

  const getDispatchesForDate = (date: Date) => {
    if (!schedule) return [];
    const dateStr = date.toISOString().split("T")[0];
    return schedule.filter(s => {
      if (!s.scheduledDate) return false;
      return new Date(s.scheduledDate).toISOString().split("T")[0] === dateStr;
    });
  };

  const prevMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  const nextMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));

  const statusColor: Record<string, string> = {
    pending: "bg-gray-200 text-gray-700",
    scheduled: "bg-blue-100 text-blue-700",
    in_transit: "bg-amber-100 text-amber-700",
    delivered: "bg-green-100 text-green-700",
    failed: "bg-red-100 text-red-700",
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Calendar className="h-6 w-6" /> Delivery Calendar
          </h1>
          <p className="text-muted-foreground text-sm mt-1">Driver delivery schedule overview</p>
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={prevMonth}><ChevronLeft className="h-4 w-4" /></Button>
          <span className="font-semibold min-w-[140px] text-center">
            {currentDate.toLocaleDateString("en-AU", { month: "long", year: "numeric" })}
          </span>
          <Button variant="outline" size="icon" onClick={nextMonth}><ChevronRight className="h-4 w-4" /></Button>
        </div>
        <Select value={driverFilter} onValueChange={setDriverFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="All Drivers" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Drivers</SelectItem>
            {drivers?.map(d => (
              <SelectItem key={d.id} value={String(d.id)}>{d.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Calendar Grid */}
      <div className="border rounded-lg overflow-hidden">
        <div className="grid grid-cols-7 bg-muted">
          {DAYS.map(d => (
            <div key={d} className="text-center text-xs font-semibold py-2 border-b">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {calendarDays.map((day, idx) => {
            const dispatches = getDispatchesForDate(day.date);
            const isToday = day.date.toDateString() === new Date().toDateString();
            return (
              <div
                key={idx}
                className={`min-h-[90px] border-b border-r p-1 ${!day.isCurrentMonth ? "bg-muted/30" : ""} ${isToday ? "bg-blue-50 dark:bg-blue-950/20" : ""}`}
              >
                <span className={`text-xs ${isToday ? "font-bold text-blue-600" : "text-muted-foreground"}`}>
                  {day.date.getDate()}
                </span>
                <div className="space-y-0.5 mt-0.5">
                  {dispatches.slice(0, 3).map(disp => (
                    <div key={disp.id} className={`text-[9px] rounded px-1 py-0.5 truncate ${statusColor[disp.status] || "bg-gray-100"}`}>
                      <Truck className="h-2.5 w-2.5 inline mr-0.5" />
                      {disp.clientName || disp.dispatchNumber}
                    </div>
                  ))}
                  {dispatches.length > 3 && (
                    <span className="text-[9px] text-muted-foreground">+{dispatches.length - 3} more</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
