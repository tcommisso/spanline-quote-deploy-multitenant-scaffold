import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, CalendarCheck } from "lucide-react";
import { useIsMobile } from "@/hooks/useMobile";

const statusColors: Record<string, string> = {
  available: "bg-green-100 text-green-800 border-green-300",
  unavailable: "bg-red-100 text-red-800 border-red-300",
  partial: "bg-primary/10 text-primary border-primary/30",
};

const statusLabels: Record<string, string> = {
  available: "Available",
  unavailable: "Unavailable",
  partial: "Partial",
};

function dateKeyFor(year: number, monthIndex: number, day: number) {
  return `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export default function TradePortalAvailability() {
  const isMobile = useIsMobile();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [status, setStatus] = useState<"available" | "unavailable" | "partial">("unavailable");
  const [notes, setNotes] = useState("");

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const { data: availabilityCalendar, isLoading, refetch } = trpc.tradePortal.getAvailabilityCalendar.useQuery({
    month: month + 1,
    year,
  });

  const setAvailability = trpc.tradePortal.setAvailability.useMutation({
    onSuccess: () => {
      toast.success("Availability updated");
      refetch();
      setDialogOpen(false);
    },
    onError: (err) => toast.error(err.message),
  });

  const removeAvailability = trpc.tradePortal.removeAvailability.useMutation({
    onSuccess: () => {
      toast.success("Availability removed");
      refetch();
      setDialogOpen(false);
    },
    onError: (err) => toast.error(err.message),
  });

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayOfWeek = new Date(year, month, 1).getDay();
  const startOffset = firstDayOfWeek === 0 ? 6 : firstDayOfWeek - 1;

  type AvailabilityItem = NonNullable<typeof availabilityCalendar>[number];
  const availabilityMap = useMemo(() => {
    const map = new Map<string, AvailabilityItem>();
    availabilityCalendar?.forEach(a => {
      map.set(a.dateKey, a);
    });
    return map;
  }, [availabilityCalendar]);

  function handleDayClick(date: Date) {
    if (date < new Date(new Date().setHours(0, 0, 0, 0))) return;
    setSelectedDate(date);
    const key = dateKeyFor(date.getFullYear(), date.getMonth(), date.getDate());
    const existing = availabilityMap.get(key);
    if (existing?.override) {
      setStatus(existing.override.status as "available" | "unavailable" | "partial");
      setNotes(existing.override.notes || "");
    } else {
      setStatus(existing?.defaultUnavailable ? "available" : "unavailable");
      setNotes("");
    }
    setDialogOpen(true);
  }

  function handleSave() {
    if (!selectedDate) return;
    const key = dateKeyFor(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate());
    setAvailability.mutate({
      date: key,
      status,
      notes: notes || undefined,
    });
  }

  function handleRemove() {
    if (!selectedDate) return;
    const key = dateKeyFor(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate());
    const existing = availabilityMap.get(key);
    if (existing?.override) {
      removeAvailability.mutate({ id: existing.override.id });
    }
  }

  const isToday = (date: Date) => {
    const today = new Date();
    return date.getDate() === today.getDate() && date.getMonth() === today.getMonth() && date.getFullYear() === today.getFullYear();
  };

  const isPast = (date: Date) => date < new Date(new Date().setHours(0, 0, 0, 0));

  if (isLoading) {
    return <div className="space-y-4"><Skeleton className="h-8 w-48" /><Skeleton className="h-64 sm:h-96" /></div>;
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-slate-800">My Availability</h1>
        <p className="text-sm text-muted-foreground">Tap a day to set your availability</p>
      </div>

      <div className="flex flex-wrap gap-3 sm:gap-4 text-xs sm:text-sm">
        <div className="flex items-center gap-1.5"><div className="w-3 h-3 sm:w-4 sm:h-4 rounded bg-green-100 border border-green-300" /> Available</div>
        <div className="flex items-center gap-1.5"><div className="w-3 h-3 sm:w-4 sm:h-4 rounded bg-red-100 border border-red-300" /> Unavailable</div>
        <div className="flex items-center gap-1.5"><div className="w-3 h-3 sm:w-4 sm:h-4 rounded bg-primary/10 border border-primary/30" /> Partial</div>
      </div>

      <Card>
        <CardHeader className="pb-2 px-3 sm:px-6">
          <div className="flex items-center justify-between">
            <Button variant="ghost" size="icon" onClick={() => setCurrentDate(new Date(year, month - 1, 1))}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <CardTitle className="text-base sm:text-lg">
              {currentDate.toLocaleDateString("en-AU", { month: "long", year: "numeric" })}
            </CardTitle>
            <Button variant="ghost" size="icon" onClick={() => setCurrentDate(new Date(year, month + 1, 1))}>
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="px-2 sm:px-6">
          <div className="grid grid-cols-7 gap-px bg-slate-200 rounded-lg overflow-hidden">
            {(isMobile ? ["M", "T", "W", "T", "F", "S", "S"] : ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]).map((d, i) => (
              <div key={`${d}-${i}`} className="bg-slate-100 p-1 sm:p-2 text-center text-[10px] sm:text-xs font-medium text-muted-foreground">{d}</div>
            ))}
            {Array.from({ length: startOffset }).map((_, i) => (
              <div key={`empty-${i}`} className="bg-white p-1 sm:p-2 min-h-[44px] sm:min-h-[70px]" />
            ))}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const date = new Date(year, month, i + 1);
              const key = dateKeyFor(year, month, i + 1);
              const avail = availabilityMap.get(key);
              const past = isPast(date);
              const effectiveStatus = avail?.override?.status || (avail?.unavailable ? "unavailable" : "");
              const statusClass = effectiveStatus ? statusColors[effectiveStatus] : "";
              const label = avail?.override?.status
                ? statusLabels[avail.override.status]
                : avail?.holidays?.[0]?.name || (avail?.isWeekend ? "Weekend" : "");

              return (
                <div
                  key={i}
                  onClick={() => !past && handleDayClick(date)}
                  className={`bg-white p-1 sm:p-2 min-h-[44px] sm:min-h-[70px] transition-colors ${
                    past ? "opacity-50 cursor-not-allowed" : "cursor-pointer hover:bg-slate-50 active:bg-slate-100"
                  } ${isToday(date) ? "ring-2 ring-primary ring-inset" : ""} ${
                    statusClass
                  }`}
                >
                  <p className={`text-[10px] sm:text-xs font-medium ${isToday(date) ? "text-primary" : "text-slate-600"}`}>
                    {i + 1}
                  </p>
                  {label && (
                    <p className="text-[8px] sm:text-[10px] mt-0.5 sm:mt-1 font-medium leading-tight">
                      {isMobile ? label.charAt(0) : label}
                    </p>
                  )}
                  {!isMobile && avail?.override?.notes && (
                    <p className="text-[9px] text-muted-foreground truncate mt-0.5">{avail.override.notes}</p>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base sm:text-lg">
              <CalendarCheck className="w-5 h-5 text-primary" />
              <span className="truncate">
                {selectedDate?.toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long" })}
              </span>
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-1 block">Status</label>
              <Select value={status} onValueChange={(v) => setStatus(v as typeof status)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="available">Available</SelectItem>
                  <SelectItem value="unavailable">Unavailable</SelectItem>
                  <SelectItem value="partial">Partial (limited hours)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Notes (optional)</label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g., Available after 1pm..."
                rows={3}
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            {selectedDate && availabilityMap.get(dateKeyFor(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate()))?.override && (
              <Button variant="outline" onClick={handleRemove} disabled={removeAvailability.isPending}>
                Clear
              </Button>
            )}
            <Button onClick={handleSave} disabled={setAvailability.isPending} className="bg-primary hover:bg-primary/90 text-primary-foreground">
              {setAvailability.isPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
