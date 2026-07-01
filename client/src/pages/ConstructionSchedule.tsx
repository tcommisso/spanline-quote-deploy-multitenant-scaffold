import { useState, useMemo, useRef } from "react";
import { OnboardingTour, TourHelpButton } from "@/components/OnboardingTour";
import { HelpLink } from "@/components/HelpLink";
import { workScheduleTour, TOUR_IDS } from "@/lib/tours";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import {
  CalendarDays, Plus, ChevronLeft, ChevronRight, Clock, Wrench,
  ClipboardCheck, Truck, Users, Bell, BellOff, Trash2, Package,
  UserCircle, AlertTriangle, HelpCircle, CloudRain, ChevronsUpDown, Check,
  Maximize2, Minimize2,
} from "lucide-react";
import { toast } from "sonner";
import { useIsMobile } from "@/hooks/useMobile";
import { useSwipeGesture } from "@/hooks/useSwipeGesture";
import { useAuth } from "@/_core/hooks/useAuth";
import { isAdminRole, ROLE_LABELS } from "@shared/const";

type ResourceView = "all" | "staff" | "trades" | "unallocated" | "equipment";
type ScheduleDialogSize = "compact" | "wide" | "full";

const EVENT_TYPE_CONFIG: Record<string, { color: string; icon: any; label: string }> = {
  installation: { color: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300", icon: Wrench, label: "Installation" },
  inspection: { color: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300", icon: ClipboardCheck, label: "Inspection" },
  meeting: { color: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300", icon: Users, label: "Meeting" },
  delivery: { color: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300", icon: Truck, label: "Delivery" },
  other: { color: "bg-slate-100 text-slate-800 dark:bg-slate-900/30 dark:text-slate-300", icon: Clock, label: "Other" },
};

const STATUS_COLORS: Record<string, string> = {
  scheduled: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  confirmed: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  completed: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
  cancelled: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
};

const RESOURCE_TABS: { value: ResourceView; label: string; icon: any }[] = [
  { value: "all", label: "All", icon: CalendarDays },
  { value: "staff", label: "Staff", icon: UserCircle },
  { value: "trades", label: "Trades", icon: Wrench },
  { value: "unallocated", label: "Unalloc", icon: HelpCircle },
  { value: "equipment", label: "Equip", icon: Package },
];

const SCHEDULE_DIALOG_SIZE_CLASSES: Record<ScheduleDialogSize, string> = {
  compact: "!w-[calc(100vw-1rem)] sm:!w-[560px] !max-w-[calc(100vw-1rem)] sm:!max-w-[560px] max-h-[92dvh] sm:max-h-[88vh]",
  wide: "!w-[calc(100vw-1rem)] sm:!w-[760px] lg:!w-[900px] !max-w-[calc(100vw-1rem)] sm:!max-w-[92vw] max-h-[94dvh] min-h-[min(560px,88dvh)]",
  full: "!w-[calc(100vw-0.5rem)] !max-w-[calc(100vw-0.5rem)] sm:!w-[min(1040px,96vw)] sm:!max-w-[96vw] h-[96dvh] max-h-[96dvh]",
};

function ScheduleDialogContent({
  title,
  size,
  onSizeChange,
  children,
}: {
  title: string;
  size: ScheduleDialogSize;
  onSizeChange: (size: ScheduleDialogSize) => void;
  children: any;
}) {
  const sizeOptions: Array<{ value: ScheduleDialogSize; label: string; icon: any }> = [
    { value: "compact", label: "Compact", icon: Minimize2 },
    { value: "wide", label: "Wide", icon: ChevronsUpDown },
    { value: "full", label: "Full", icon: Maximize2 },
  ];

  return (
    <DialogContent
      className={`flex flex-col gap-0 overflow-hidden p-0 sm:min-h-[420px] sm:min-w-[min(520px,calc(100vw-2rem))] sm:resize ${SCHEDULE_DIALOG_SIZE_CLASSES[size]}`}
    >
      <DialogHeader className="border-b px-4 py-3 pr-12 sm:px-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <DialogTitle>{title}</DialogTitle>
          <div className="grid grid-cols-3 gap-1 sm:flex sm:items-center" aria-label="Schedule dialog size">
            {sizeOptions.map(({ value, label, icon: Icon }) => (
              <Button
                key={value}
                type="button"
                size="sm"
                variant={size === value ? "secondary" : "outline"}
                className="h-8 px-2 text-xs"
                aria-pressed={size === value}
                title={`${label} modal size`}
                onClick={() => onSizeChange(value)}
              >
                <Icon className="mr-1 h-3.5 w-3.5" />
                {label}
              </Button>
            ))}
          </div>
        </div>
      </DialogHeader>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-5">
        {children}
      </div>
    </DialogContent>
  );
}

function toLocalDateKey(value: Date | string | number) {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function startOfLocalDay(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

function addLocalDays(value: Date, days: number) {
  const next = new Date(value);
  next.setDate(next.getDate() + days);
  return next;
}

function makeLocalDateRange(startDate: Date, exclusiveEndDate: Date) {
  const startKey = toLocalDateKey(startDate);
  const endKey = toLocalDateKey(addLocalDays(exclusiveEndDate, -1));
  return {
    start: localDateStartToIso(startKey),
    end: localDateStartToIso(toLocalDateKey(exclusiveEndDate)),
    startKey,
    endKey,
  };
}

function toDateInputValue(value: Date | string | number | null | undefined) {
  if (!value) return "";
  return toLocalDateKey(value);
}

function toInclusiveEndDateKey(value: Date | string | number | null | undefined) {
  if (!value) return "";
  const date = value instanceof Date ? new Date(value) : new Date(value);
  if (Number.isNaN(date.getTime())) return toDateInputValue(value);
  date.setMilliseconds(date.getMilliseconds() - 1);
  return toLocalDateKey(date);
}

function localDateTimeToIso(value: string) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

function toLocalDateTimeInput(value: Date | string | number | null | undefined) {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${toLocalDateKey(date)}T${hours}:${minutes}`;
}

function localDateStartToIso(dateKey: string) {
  return localDateTimeToIso(`${dateKey}T00:00`);
}

function localDateEndToIso(dateKey: string) {
  return localDateTimeToIso(`${dateKey}T23:59:59`);
}

function eventSpansMultipleDays(event: any) {
  if (!event?.endTime) return false;
  return toLocalDateKey(event.startTime) !== toLocalDateKey(event.endTime);
}

function scheduleReadinessWarnings(event: any) {
  return event?.readinessWarnings || event?.tradeReadiness?.warnings || [];
}

function hasScheduleReadinessWarnings(event: any) {
  return scheduleReadinessWarnings(event).length > 0;
}

function eventAssigneeName(event: any) {
  return event?.assignedUserName || event?.installerName || event?.assigneeName || "";
}

function eventIsUnallocated(event: any) {
  return !event?.assignedUserId && !event?.assignedInstallerId;
}

function ScheduleReadinessTags({ warnings, compact = false }: { warnings: any[]; compact?: boolean }) {
  if (!warnings?.length) return null;
  if (compact) {
    return (
      <Badge variant="secondary" className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 text-[10px] gap-1">
        <AlertTriangle className="h-3 w-3" />
        Needs review
      </Badge>
    );
  }
  return (
    <div className="flex flex-wrap gap-1">
      {warnings.map((warning: any) => (
        <Badge
          key={warning.key || warning.label}
          variant="secondary"
          className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 text-[10px] gap-1"
        >
          <AlertTriangle className="h-3 w-3" />
          {warning.label || "Needs review"}
        </Badge>
      ))}
    </div>
  );
}

function normaliseSearchText(value: unknown) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function matchesAllSearchWords(value: string, search: string) {
  const haystack = normaliseSearchText(value);
  const terms = normaliseSearchText(search).split(/\s+/).filter(Boolean);
  if (terms.length === 0) return true;
  return terms.every(term => haystack.includes(term));
}

function staffCategoryValue(staff: any) {
  return staff?.category || staff?.staffRole || staff?.role || "user";
}

function staffCategoryLabel(category: string) {
  return (ROLE_LABELS as Record<string, string>)[category] || category.replace(/_/g, " ");
}

function jobSearchText(job: any) {
  return [
    job.id,
    job.clientName,
    job.quoteNumber,
    job.accountNumber,
    job.clientEmail,
    job.clientPhone,
    job.siteAddress,
  ].filter(Boolean).join(" ");
}

function jobDisplayLabel(job: any) {
  if (!job) return "Select job...";
  return `${job.clientName || "Unnamed client"}${job.quoteNumber ? ` (#${job.quoteNumber})` : ""}`;
}

function JobCombobox({
  jobs,
  value,
  onChange,
  placeholder = "Select job...",
  allowEmpty = false,
}: {
  jobs: any[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  allowEmpty?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const selectedJob = jobs.find((job: any) => String(job.id) === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal"
        >
          <span className={`truncate ${selectedJob ? "" : "text-muted-foreground"}`}>
            {selectedJob ? jobDisplayLabel(selectedJob) : placeholder}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <Command filter={(candidate, search) => matchesAllSearchWords(candidate, search) ? 1 : 0}>
          <CommandInput placeholder="Search client, job number, address..." />
          <CommandList>
            <CommandEmpty>No matching jobs found.</CommandEmpty>
            <CommandGroup>
              {allowEmpty && (
                <CommandItem
                  value="none no job unlinked"
                  onSelect={() => {
                    onChange("");
                    setOpen(false);
                  }}
                >
                  <Check className={`mr-2 h-4 w-4 ${value ? "opacity-0" : "opacity-100"}`} />
                  <span>No Job</span>
                </CommandItem>
              )}
              {jobs.map((job: any) => {
                const jobValue = String(job.id);
                return (
                  <CommandItem
                    key={job.id}
                    value={`${jobValue} ${jobSearchText(job)}`}
                    onSelect={() => {
                      onChange(jobValue);
                      setOpen(false);
                    }}
                  >
                    <Check className={`mr-2 h-4 w-4 ${jobValue === value ? "opacity-100" : "opacity-0"}`} />
                    <div className="min-w-0">
                      <p className="truncate">{jobDisplayLabel(job)}</p>
                      {job.siteAddress && (
                        <p className="truncate text-xs text-muted-foreground">{job.siteAddress}</p>
                      )}
                    </div>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export default function ConstructionSchedule() {
  const { user } = useAuth();
  const isMobile = useIsMobile();
  const [viewMode, setViewMode] = useState<"day" | "week" | "month">("week");
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [showCreateEvent, setShowCreateEvent] = useState(false);
  const [createDialogSize, setCreateDialogSize] = useState<ScheduleDialogSize>("wide");
  const [showBookEquipment, setShowBookEquipment] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<any>(null);
  const [editDialogSize, setEditDialogSize] = useState<ScheduleDialogSize>("wide");
  const [selectedBooking, setSelectedBooking] = useState<any>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [filterInstallerId, setFilterInstallerId] = useState<string>("all");
  const [filterStaffUserId, setFilterStaffUserId] = useState<string>("all");
  const [filterStaffBranchId, setFilterStaffBranchId] = useState<string>("all");
  const [filterStaffCategory, setFilterStaffCategory] = useState<string>("all");
  const [resourceView, setResourceView] = useState<ResourceView>("all");

  const mobileContainerRef = useRef<HTMLDivElement>(null);

  // Swipe left/right to navigate days on mobile
  useSwipeGesture(
    {
      onSwipeLeft: () => {
        if (isMobile && viewMode === "day") navigateNext();
      },
      onSwipeRight: () => {
        if (isMobile && viewMode === "day") navigatePrev();
      },
    },
    { elementRef: mobileContainerRef, enabled: isMobile && viewMode === "day" }
  );

  // Calculate date range for the current view
  const dateRange = useMemo(() => {
    const d = new Date(currentDate);
    if (viewMode === "day") {
      const start = startOfLocalDay(d);
      return makeLocalDateRange(start, addLocalDays(start, 1));
    } else if (viewMode === "month") {
      const start = new Date(d.getFullYear(), d.getMonth(), 1);
      start.setDate(start.getDate() - start.getDay());
      return makeLocalDateRange(start, addLocalDays(start, 42));
    } else {
      const dayOfWeek = d.getDay();
      const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
      const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate());
      monday.setDate(d.getDate() + mondayOffset);
      return makeLocalDateRange(monday, addLocalDays(monday, 7));
    }
  }, [currentDate, viewMode]);

  const eventsQuery = trpc.constructionSchedule.list.useQuery({
    startDate: dateRange.start,
    endDate: dateRange.end,
    ...(resourceView === "trades" && filterInstallerId !== "all" ? { installerId: Number(filterInstallerId) } : {}),
    ...(resourceView === "staff" && filterStaffUserId !== "all" ? { assignedUserId: Number(filterStaffUserId) } : {}),
  });
  const jobsQuery = trpc.construction.jobs.list.useQuery();
  const installersQuery = trpc.construction.installers.list.useQuery();
  const staffResourcesQuery = trpc.constructionSchedule.staffResources.useQuery();
  const staffResources = staffResourcesQuery.data || [];
  const staffBranchOptions = useMemo(() => {
    const byId = new Map<number, string>();
    for (const staff of staffResources as any[]) {
      if (staff.branchId == null || !staff.branchName) continue;
      byId.set(Number(staff.branchId), staff.branchName);
    }
    return Array.from(byId.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [staffResources]);
  const staffCategoryOptions = useMemo(() => {
    const categories = new Set<string>();
    for (const staff of staffResources as any[]) {
      const category = staffCategoryValue(staff);
      if (category) categories.add(category);
    }
    return Array.from(categories)
      .map((value) => ({ value, label: staffCategoryLabel(value) }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [staffResources]);
  const filteredStaffResources = useMemo(() => {
    return (staffResources as any[]).filter((staff) => {
      if (filterStaffBranchId !== "all" && String(staff.branchId || "") !== filterStaffBranchId) return false;
      if (filterStaffCategory !== "all" && staffCategoryValue(staff) !== filterStaffCategory) return false;
      return true;
    });
  }, [staffResources, filterStaffBranchId, filterStaffCategory]);
  const filteredStaffUserIds = useMemo(() => {
    if (filterStaffBranchId === "all" && filterStaffCategory === "all") return null;
    return new Set(filteredStaffResources.map((staff: any) => Number(staff.id)));
  }, [filteredStaffResources, filterStaffBranchId, filterStaffCategory]);
  const equipmentQuery = trpc.equipment.list.useQuery({ activeOnly: true });
  const equipmentBookingsQuery = trpc.equipment.bookings.list.useQuery({
    startDate: dateRange.start,
    endDate: dateRange.end,
  });

  // Rain days for schedule indicator
  const rainDaysQuery = trpc.rainDay.listForSchedule.useQuery({
    startDate: dateRange.startKey,
    endDate: dateRange.endKey,
  });
  const availabilityBlocksQuery = trpc.constructionSchedule.availabilityBlocks.useQuery({
    startDate: dateRange.startKey,
    endDate: dateRange.endKey,
    ...(resourceView === "trades" && filterInstallerId !== "all" ? { installerId: Number(filterInstallerId) } : {}),
  }, { enabled: Boolean(dateRange.startKey && dateRange.endKey) });

  const createEvent = trpc.constructionSchedule.create.useMutation({
    onSuccess: () => {
      eventsQuery.refetch();
      setShowCreateEvent(false);
      toast.success("Event created");
    },
    onError: (err) => toast.error(err.message),
  });

  const updateEvent = trpc.constructionSchedule.update.useMutation({
    onSuccess: () => {
      eventsQuery.refetch();
      setSelectedEvent(null);
      toast.success("Event updated");
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteEvent = trpc.constructionSchedule.delete.useMutation({
    onSuccess: () => {
      eventsQuery.refetch();
      setSelectedEvent(null);
      toast.success("Event deleted");
    },
  });

  const createBooking = trpc.equipment.bookings.create.useMutation({
    onSuccess: () => {
      equipmentBookingsQuery.refetch();
      setShowBookEquipment(false);
      toast.success("Equipment booked");
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteBooking = trpc.equipment.bookings.delete.useMutation({
    onSuccess: () => {
      equipmentBookingsQuery.refetch();
      setSelectedBooking(null);
      toast.success("Booking removed");
    },
  });
  const seedHolidays = trpc.constructionSchedule.seedAustralianHolidays.useMutation({
    onSuccess: (result) => {
      availabilityBlocksQuery.refetch();
      toast.success(`Imported ${result.total} holiday calendar days (${result.inserted} new, ${result.updated} refreshed)`);
    },
    onError: (err) => toast.error(err.message),
  });

  const navigatePrev = () => {
    const d = new Date(currentDate);
    if (viewMode === "day") d.setDate(d.getDate() - 1);
    else if (viewMode === "month") d.setMonth(d.getMonth() - 1);
    else d.setDate(d.getDate() - 7);
    setCurrentDate(d);
  };
  const navigateNext = () => {
    const d = new Date(currentDate);
    if (viewMode === "day") d.setDate(d.getDate() + 1);
    else if (viewMode === "month") d.setMonth(d.getMonth() + 1);
    else d.setDate(d.getDate() + 7);
    setCurrentDate(d);
  };
  const navigateToday = () => setCurrentDate(new Date());

  // Generate calendar days
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
        const nextIdx = days.length - startOffset - lastDay.getDate() + 1;
        days.push(new Date(year, month + 1, nextIdx));
      }
      return days;
    } else if (viewMode === "week") {
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
    } else {
      return [new Date(currentDate)];
    }
  }, [currentDate, viewMode]);

  // Week strip for mobile day view
  const weekStrip = useMemo(() => {
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
  }, [currentDate]);

  // Filter events by resource view
  const filteredEvents = useMemo(() => {
    const events = eventsQuery.data || [];
    switch (resourceView) {
      case "staff":
        return events.filter((e: any) => (
          e.assignedUserId != null
          && (!filteredStaffUserIds || filteredStaffUserIds.has(Number(e.assignedUserId)))
        ));
      case "trades":
        return events.filter((e: any) => e.assignedInstallerId != null);
      case "unallocated":
        return events.filter((e: any) => eventIsUnallocated(e));
      case "equipment":
        return []; // Equipment view shows bookings, not events
      default:
        return events;
    }
  }, [eventsQuery.data, resourceView, filteredStaffUserIds]);

  // Map events to days
  const eventsByDate = useMemo(() => {
    const map: Record<string, any[]> = {};
    for (const event of filteredEvents) {
      const start = new Date(event.startTime);
      const end = event.endTime ? new Date(event.endTime) : start;
      if (Number.isNaN(start.getTime())) continue;
      const last = Number.isNaN(end.getTime()) || end < start ? start : end;
      const d = new Date(start.getFullYear(), start.getMonth(), start.getDate());
      const lastDay = new Date(last.getFullYear(), last.getMonth(), last.getDate());
      for (let guard = 0; d <= lastDay && guard < 90; guard += 1) {
        const dateKey = toLocalDateKey(d);
        if (!map[dateKey]) map[dateKey] = [];
        map[dateKey].push(event);
        d.setDate(d.getDate() + 1);
      }
    }
    return map;
  }, [filteredEvents]);

  // Map equipment bookings to days
  const bookingsByDate = useMemo(() => {
    const map: Record<string, any[]> = {};
    for (const booking of (equipmentBookingsQuery.data || [])) {
      const start = new Date(booking.startDate);
      const end = new Date(booking.endDate);
      const d = new Date(start);
      while (d <= end) {
        const dateKey = toLocalDateKey(d);
        if (!map[dateKey]) map[dateKey] = [];
        map[dateKey].push(booking);
        d.setDate(d.getDate() + 1);
      }
    }
    return map;
  }, [equipmentBookingsQuery.data]);

  // Map rain days to dates
  const rainDaysByDate = useMemo(() => {
    const map: Record<string, any> = {};
    for (const rd of (rainDaysQuery.data || [])) {
      map[rd.date] = rd;
    }
    return map;
  }, [rainDaysQuery.data]);
  const availabilityByDate = useMemo(() => {
    const map: Record<string, any> = {};
    for (const block of (availabilityBlocksQuery.data || [])) {
      map[block.dateKey] = block;
    }
    return map;
  }, [availabilityBlocksQuery.data]);

  const headerLabel = viewMode === "month"
    ? currentDate.toLocaleDateString("en-AU", { month: "long", year: "numeric" })
    : viewMode === "day"
    ? currentDate.toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long", year: "numeric" })
    : `Week of ${calendarDays[0]?.toLocaleDateString("en-AU", { day: "numeric", month: "short" })} – ${calendarDays[6]?.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}`;

  const today = toLocalDateKey(new Date());
  const currentMonth = currentDate.getMonth();

  const [tourActive, setTourActive] = useState(false);

  // Counts for resource tabs
  const allEvents = eventsQuery.data || [];
  const staffCount = allEvents.filter((e: any) => (
    e.assignedUserId != null
    && (!filteredStaffUserIds || filteredStaffUserIds.has(Number(e.assignedUserId)))
  )).length;
  const tradeCount = allEvents.filter((e: any) => e.assignedInstallerId != null).length;
  const unallocatedCount = allEvents.filter((e: any) => eventIsUnallocated(e)).length;
  const eqBookingCount = (equipmentBookingsQuery.data || []).length;

  // Current day key for day view
  const currentDayKey = toLocalDateKey(currentDate);
  const dayEvents = eventsByDate[currentDayKey] || [];
  const dayBookings = bookingsByDate[currentDayKey] || [];

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-7xl mx-auto" ref={mobileContainerRef}>
      <OnboardingTour
        tourId={TOUR_IDS.workSchedule}
        steps={workScheduleTour}
        active={tourActive}
        onComplete={() => setTourActive(false)}
      />

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2 md:gap-3">
          <CalendarDays className="h-5 w-5 md:h-7 md:w-7 text-primary" />
          <h1 className="text-lg md:text-2xl font-bold">Work Schedule</h1>
          {!isMobile && (
            <>
              <HelpLink section="work-schedule" tooltip="Help: Work Schedule" />
              <TourHelpButton onClick={() => setTourActive(true)} label="Tour" />
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Dialog open={showBookEquipment} onOpenChange={setShowBookEquipment}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" className="h-8">
                <Package className="h-4 w-4 md:mr-2" />
                <span className="hidden md:inline">Book Equipment</span>
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Book Equipment</DialogTitle>
              </DialogHeader>
              <EquipmentBookingForm
                equipment={equipmentQuery.data || []}
                jobs={jobsQuery.data || []}
                defaultDate={selectedDate}
                onSubmit={(data) => createBooking.mutate(data)}
                loading={createBooking.isPending}
              />
            </DialogContent>
          </Dialog>
          {isAdminRole(user?.role) && (
            <Button
              variant="outline"
              size="sm"
              className="h-8"
              onClick={() => seedHolidays.mutate({ year: currentDate.getFullYear(), jurisdictions: ["NATIONAL", "ACT", "NSW"] })}
              disabled={seedHolidays.isPending}
            >
              <CalendarDays className="h-4 w-4 md:mr-2" />
              <span className="hidden md:inline">{seedHolidays.isPending ? "Importing..." : "Import Holidays"}</span>
            </Button>
          )}
          <Dialog open={showCreateEvent} onOpenChange={setShowCreateEvent}>
            <DialogTrigger asChild>
              <Button size="sm" className="h-8">
                <Plus className="h-4 w-4 md:mr-2" />
                <span className="hidden md:inline">New Event</span>
              </Button>
            </DialogTrigger>
            <ScheduleDialogContent
              title="Create Schedule Event"
              size={createDialogSize}
              onSizeChange={setCreateDialogSize}
            >
              <EventForm
                jobs={jobsQuery.data || []}
                installers={installersQuery.data || []}
                staffUsers={staffResourcesQuery.data || []}
                equipment={equipmentQuery.data || []}
                defaultDate={selectedDate || currentDayKey}
                onSubmit={(data) => createEvent.mutate(data)}
                onBookEquipment={(data) => createBooking.mutate(data)}
                loading={createEvent.isPending}
              />
            </ScheduleDialogContent>
          </Dialog>
        </div>
      </div>

      {/* Resource View Tabs */}
      <div className="flex items-center gap-1 bg-muted/50 rounded-lg p-1 w-fit overflow-x-auto">
        {RESOURCE_TABS.map((tab) => {
          const Icon = tab.icon;
          const count = tab.value === "all" ? allEvents.length
            : tab.value === "staff" ? staffCount
            : tab.value === "trades" ? tradeCount
            : tab.value === "unallocated" ? unallocatedCount
            : eqBookingCount;
          return (
            <button
              key={tab.value}
              onClick={() => setResourceView(tab.value)}
              className={`flex items-center gap-1 px-2 md:px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                resourceView === tab.value
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{tab.label}</span>
              {count > 0 && (
                <span className={`text-[10px] px-1 py-0.5 rounded-full ${
                  resourceView === tab.value ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                }`}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Calendar Navigation */}
      <div className="space-y-2">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex min-w-0 items-center gap-1 md:gap-2">
            <Button variant="outline" size="sm" onClick={navigatePrev} className="h-8 w-8 p-0">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={navigateToday} className="h-8 text-xs px-2">Today</Button>
            <Button variant="outline" size="sm" onClick={navigateNext} className="h-8 w-8 p-0">
              <ChevronRight className="h-4 w-4" />
            </Button>
            <h3 className="min-w-0 text-sm md:text-lg font-semibold ml-1 md:ml-2 truncate max-w-[200px] sm:max-w-none">{headerLabel}</h3>
          </div>
          <div className="flex items-center gap-1 md:gap-2">
            <Button variant={viewMode === "day" ? "default" : "outline"} size="sm" onClick={() => setViewMode("day")} className="h-8 text-xs px-2">Day</Button>
            <Button variant={viewMode === "week" ? "default" : "outline"} size="sm" onClick={() => setViewMode("week")} className="h-8 text-xs px-2">Week</Button>
            {!isMobile && (
              <Button variant={viewMode === "month" ? "default" : "outline"} size="sm" onClick={() => setViewMode("month")} className="h-8 text-xs px-2">Month</Button>
            )}
          </div>
        </div>

        {resourceView === "staff" && (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:flex lg:flex-wrap lg:items-center">
            <Select
              value={filterStaffBranchId}
              onValueChange={(value) => {
                setFilterStaffBranchId(value);
                setFilterStaffUserId("all");
              }}
            >
              <SelectTrigger className="h-9 w-full text-xs lg:w-[180px]">
                <SelectValue placeholder="All branches" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All branches</SelectItem>
                {staffBranchOptions.map((branch) => (
                  <SelectItem key={branch.id} value={String(branch.id)}>{branch.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={filterStaffCategory}
              onValueChange={(value) => {
                setFilterStaffCategory(value);
                setFilterStaffUserId("all");
              }}
            >
              <SelectTrigger className="h-9 w-full text-xs lg:w-[190px]">
                <SelectValue placeholder="All user categories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All user categories</SelectItem>
                {staffCategoryOptions.map((category) => (
                  <SelectItem key={category.value} value={category.value}>{category.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterStaffUserId} onValueChange={setFilterStaffUserId}>
              <SelectTrigger className="h-9 w-full text-xs sm:col-span-2 lg:w-[220px] lg:col-span-1">
                <SelectValue placeholder="Filter by staff..." />
              </SelectTrigger>
              <SelectContent className="max-w-[calc(100vw-2rem)]">
                <SelectItem value="all">All Staff</SelectItem>
                {filteredStaffResources.map((staff: any) => (
                  <SelectItem key={staff.id} value={String(staff.id)}>
                    {staff.name}{staffCategoryValue(staff) ? ` (${staffCategoryLabel(staffCategoryValue(staff))})` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {resourceView === "trades" && (
          <div className="grid grid-cols-1 gap-2 sm:max-w-xs">
            <Select value={filterInstallerId} onValueChange={setFilterInstallerId}>
              <SelectTrigger className="h-9 w-full text-xs">
                <SelectValue placeholder="Filter by trade..." />
              </SelectTrigger>
              <SelectContent className="max-w-[calc(100vw-2rem)]">
                <SelectItem value="all">All Trades</SelectItem>
                {(installersQuery.data || []).map((inst: any) => (
                  <SelectItem key={inst.id} value={String(inst.id)}>{inst.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {/* Mobile Day View */}
      {viewMode === "day" && (
        <>
          {/* Week Strip */}
          <div className="flex gap-1 justify-between bg-muted/30 rounded-lg p-1.5">
            {weekStrip.map((day, idx) => {
              const dayKey = toLocalDateKey(day);
              const isSelected = dayKey === currentDayKey;
              const isToday2 = dayKey === today;
              const hasEvents = (eventsByDate[dayKey]?.length || 0) + (bookingsByDate[dayKey]?.length || 0) > 0;
              return (
                <button
                  key={idx}
                  onClick={() => setCurrentDate(new Date(day))}
                  className={`flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-lg text-xs transition-all flex-1 ${
                    isSelected
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : isToday2
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-muted"
                  }`}
                >
                  <span className="text-[10px] font-medium uppercase">{day.toLocaleDateString("en-AU", { weekday: "short" }).slice(0, 2)}</span>
                  <span className="text-sm font-semibold">{day.getDate()}</span>
                  {hasEvents && !isSelected && <span className="w-1 h-1 rounded-full bg-primary" />}
                </button>
              );
            })}
          </div>

          {/* Day Events Timeline */}
          <div className="space-y-2">
            {dayEvents.length === 0 && dayBookings.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center">
                  <CalendarDays className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">No events scheduled</p>
                  <p className="text-xs text-muted-foreground mt-1">Swipe left/right to navigate days</p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-3"
                    onClick={() => {
                      setSelectedDate(currentDayKey);
                      setShowCreateEvent(true);
                    }}
                  >
                    <Plus className="h-3.5 w-3.5 mr-1" /> Add Event
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <>
                {/* Schedule events */}
                {dayEvents.map((event: any) => {
                  const config = EVENT_TYPE_CONFIG[event.eventType] || EVENT_TYPE_CONFIG.other;
                  const Icon = config.icon;
                  const isUnallocated = eventIsUnallocated(event);
                  const readinessWarnings = scheduleReadinessWarnings(event);
                  const assigneeName = eventAssigneeName(event);
                  const startTime = event.allDay ? "All day" : new Date(event.startTime).toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit" });
                  const endTime = event.endTime && !event.allDay ? new Date(event.endTime).toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit" }) : null;

                  return (
                    <Card
                      key={`ev-${event.id}`}
                      className={`cursor-pointer hover:shadow-md transition-shadow ${readinessWarnings.length ? "border-amber-300 dark:border-amber-700" : ""}`}
                      onClick={() => setSelectedEvent(event)}
                    >
                      <CardContent className="py-3 px-4">
                        <div className="flex items-start gap-3">
                          <div className={`p-2 rounded-lg shrink-0 ${config.color}`}>
                            <Icon className="h-4 w-4" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <h4 className="text-sm font-medium truncate">{event.title}</h4>
                              {isUnallocated && <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0" />}
                            </div>
                            <p className="text-xs text-muted-foreground truncate">{event.jobClientName}</p>
                            <div className="flex items-center gap-2 mt-1">
                              <span className="text-xs text-muted-foreground">
                                <Clock className="h-3 w-3 inline mr-0.5" />
                                {startTime}{endTime ? ` – ${endTime}` : ""}
                              </span>
                              {assigneeName && (
                                <span className="text-xs text-muted-foreground">
                                  <UserCircle className="h-3 w-3 inline mr-0.5" />
                                  {assigneeName}
                                </span>
                              )}
                            </div>
                            {readinessWarnings.length > 0 && (
                              <div className="mt-2">
                                <ScheduleReadinessTags warnings={readinessWarnings} />
                              </div>
                            )}
                          </div>
                          <Badge className={`${STATUS_COLORS[event.status] || ""} text-[10px] shrink-0`} variant="secondary">
                            {event.status}
                          </Badge>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}

                {/* Equipment bookings */}
                {dayBookings.map((booking: any) => (
                  <Card
                    key={`eq-${booking.id}`}
                    className="cursor-pointer hover:shadow-md transition-shadow"
                    onClick={() => setSelectedBooking(booking)}
                  >
                    <CardContent className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg shrink-0 bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300">
                          <Package className="h-4 w-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h4 className="text-sm font-medium truncate">{booking.equipmentName}</h4>
                          {booking.jobClientName && (
                            <p className="text-xs text-muted-foreground truncate">{booking.jobClientName}</p>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </>
            )}
          </div>
        </>
      )}

      {/* Week/Month Calendar Grid (Desktop) */}
      {viewMode !== "day" && (
        <>
          {/* Day Headers */}
          <div className="grid grid-cols-7 gap-px bg-border rounded-t-lg overflow-hidden">
            {(viewMode === "week" ? ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] : ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]).map((day) => (
              <div key={day} className="bg-muted px-2 py-1.5 text-center text-xs font-medium text-muted-foreground">
                {day}
              </div>
            ))}
          </div>

          {/* Calendar Grid */}
          <div className="grid grid-cols-7 gap-px bg-border rounded-b-lg overflow-hidden -mt-2">
            {calendarDays.map((day, idx) => {
              const dateKey = toLocalDateKey(day);
              const cellEvents = eventsByDate[dateKey] || [];
              const cellBookings = bookingsByDate[dateKey] || [];
              const isToday2 = dateKey === today;
              const isCurrentMonth = day.getMonth() === currentMonth;
              const minHeight = viewMode === "week" ? "min-h-[360px] xl:min-h-[420px]" : "min-h-[100px]";
              const eventsMaxHeight = viewMode === "week" ? "max-h-[310px] xl:max-h-[370px]" : "max-h-[80px]";
              const showEvents = resourceView !== "equipment";
              const showEquipment = resourceView === "all" || resourceView === "equipment";

              const isRainDay = !!rainDaysByDate[dateKey];
              const availabilityBlock = availabilityByDate[dateKey];
              const unavailable = availabilityBlock?.unavailable;
              const holidayName = availabilityBlock?.holidays?.[0]?.name;
              const availabilityLabel = holidayName || (availabilityBlock?.isWeekend ? "Weekend" : null);
              const blockClass = unavailable
                ? "bg-amber-50 dark:bg-amber-950/20"
                : isRainDay
                ? "bg-sky-50 dark:bg-sky-950/30"
                : "bg-background";

              return (
                <div
                  key={idx}
                  className={`${minHeight} p-1 cursor-pointer hover:bg-muted/30 transition-colors ${!isCurrentMonth && viewMode === "month" ? "opacity-40" : ""} ${blockClass}`}
                  onClick={() => {
                    setSelectedDate(dateKey);
                    if (resourceView === "equipment") {
                      setShowBookEquipment(true);
                    } else {
                      setShowCreateEvent(true);
                    }
                  }}
                >
                  <div className="flex items-center gap-0.5">
                    <div className={`text-xs font-medium mb-0.5 px-1 ${isToday2 ? "bg-primary text-primary-foreground rounded-full w-5 h-5 flex items-center justify-center" : "text-muted-foreground"}`}>
                      {day.getDate()}
                    </div>
                    {isRainDay && (
                      <span title={`Rain Day: ${rainDaysByDate[dateKey]?.reason || "Declared"}`}>
                        <CloudRain className="h-3 w-3 text-sky-500 flex-shrink-0" />
                      </span>
                    )}
                  </div>
                  {availabilityLabel && (
                    <div className={`mb-1 truncate rounded px-1 py-0.5 text-[9px] leading-tight ${unavailable ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"}`}>
                      {unavailable ? availabilityLabel : `Available: ${availabilityLabel}`}
                    </div>
                  )}
                  <div className={`space-y-0.5 overflow-y-auto ${eventsMaxHeight}`}>
                    {/* Schedule events */}
                    {showEvents && cellEvents.map((event: any) => {
                      const config = EVENT_TYPE_CONFIG[event.eventType] || EVENT_TYPE_CONFIG.other;
                      const Icon = config.icon;
                      const isUnallocated = eventIsUnallocated(event);
                      const needsReview = hasScheduleReadinessWarnings(event);
                      return (
                        <button
                          key={`ev-${event.id}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedEvent(event);
                          }}
                          className={`w-full text-left text-[10px] leading-tight px-1.5 py-0.5 rounded truncate flex items-center gap-1 ${config.color} ${isUnallocated ? "border border-dashed border-current" : ""} ${needsReview ? "border border-amber-500" : ""}`}
                        >
                          <Icon className="h-2.5 w-2.5 flex-shrink-0" />
                          <span className="truncate">
                            {event.title}
                          </span>
                          {(isUnallocated || needsReview) && <AlertTriangle className="h-2.5 w-2.5 flex-shrink-0" />}
                        </button>
                      );
                    })}
                    {/* Equipment bookings */}
                    {showEquipment && cellBookings.map((booking: any) => (
                      <button
                        key={`eq-${booking.id}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedBooking(booking);
                        }}
                        className="w-full text-left text-[10px] leading-tight px-1.5 py-0.5 rounded truncate flex items-center gap-1 bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300"
                      >
                        <Package className="h-2.5 w-2.5 flex-shrink-0" />
                        <span className="truncate">{booking.equipmentName}</span>
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Legend */}
          <div className="flex flex-wrap gap-4 text-xs">
            {Object.entries(EVENT_TYPE_CONFIG).map(([type, config]) => {
              const Icon = config.icon;
              return (
                <div key={type} className="flex items-center gap-1.5">
                  <span className={`inline-flex items-center justify-center w-4 h-4 rounded ${config.color}`}>
                    <Icon className="h-2.5 w-2.5" />
                  </span>
                  <span>{config.label}</span>
                </div>
              );
            })}
            <div className="flex items-center gap-1.5">
              <span className="inline-flex items-center justify-center w-4 h-4 rounded bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300">
                <Package className="h-2.5 w-2.5" />
              </span>
              <span>Equipment</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="inline-flex w-4 h-4 rounded bg-amber-100 border border-amber-200" />
              <span>Unavailable by default</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="inline-flex items-center justify-center w-4 h-4 rounded border border-dashed border-muted-foreground">
                <AlertTriangle className="h-2.5 w-2.5 text-muted-foreground" />
              </span>
              <span>Unallocated</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="inline-flex items-center justify-center w-4 h-4 rounded bg-amber-100 text-amber-800 border border-amber-300">
                <AlertTriangle className="h-2.5 w-2.5" />
              </span>
              <span>Needs review</span>
            </div>
          </div>
        </>
      )}

      {/* Event Detail Dialog */}
      <Dialog open={!!selectedEvent} onOpenChange={(open) => !open && setSelectedEvent(null)}>
        <ScheduleDialogContent
          title="Edit Schedule Event"
          size={editDialogSize}
          onSizeChange={setEditDialogSize}
        >
          {selectedEvent && (
            <EventDetailView
              event={selectedEvent}
              jobs={jobsQuery.data || []}
              installers={installersQuery.data || []}
              staffUsers={staffResourcesQuery.data || []}
              onUpdate={(data) => updateEvent.mutate({ id: selectedEvent.id, ...data })}
              onDelete={() => { if (confirm("Delete this event?")) deleteEvent.mutate({ id: selectedEvent.id }); }}
              loading={updateEvent.isPending}
            />
          )}
        </ScheduleDialogContent>
      </Dialog>

      {/* Equipment Booking Detail Dialog */}
      <Dialog open={!!selectedBooking} onOpenChange={(open) => !open && setSelectedBooking(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Equipment Booking</DialogTitle>
          </DialogHeader>
          {selectedBooking && (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300">
                  <Package className="h-5 w-5" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold">{selectedBooking.equipmentName}</h3>
                  {selectedBooking.equipmentCategory && (
                    <Badge variant="secondary" className="text-[10px] mt-0.5">{selectedBooking.equipmentCategory}</Badge>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-muted-foreground">Start:</span>
                  <p className="font-medium">{new Date(selectedBooking.startDate).toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" })}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">End:</span>
                  <p className="font-medium">{new Date(selectedBooking.endDate).toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" })}</p>
                </div>
                {selectedBooking.jobClientName && (
                  <div className="col-span-2">
                    <span className="text-muted-foreground">Job:</span>
                    <p className="font-medium">{selectedBooking.jobClientName} {selectedBooking.quoteNumber ? `(#${selectedBooking.quoteNumber})` : ""}</p>
                  </div>
                )}
                {selectedBooking.jobSiteAddress && (
                  <div className="col-span-2">
                    <span className="text-muted-foreground">Site:</span>
                    <p className="font-medium">{selectedBooking.jobSiteAddress}</p>
                  </div>
                )}
              </div>
              {selectedBooking.notes && (
                <p className="text-sm text-muted-foreground">{selectedBooking.notes}</p>
              )}
              <Button
                variant="destructive"
                size="sm"
                className="w-full"
                onClick={() => {
                  if (confirm("Remove this equipment booking?")) {
                    deleteBooking.mutate({ id: selectedBooking.id });
                  }
                }}
              >
                <Trash2 className="h-4 w-4 mr-1" /> Remove Booking
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Event Form ──────────────────────────────────────────────────────────────
function EventForm({
  jobs, installers, staffUsers, defaultDate, initialEvent, mode = "create", onSubmit, loading,
}: {
  jobs: any[];
  installers: any[];
  staffUsers: any[];
  equipment?: any[];
  defaultDate?: string | null;
  initialEvent?: any;
  mode?: "create" | "edit";
  onSubmit: (data: any) => void;
  onBookEquipment?: (data: any) => void;
  loading: boolean;
}) {
  const initialAllDay = Boolean(initialEvent?.allDay);
  const normalisedDefaultDate = toDateInputValue(defaultDate);
  const initialStartDate = initialEvent?.startTime ? toLocalDateKey(initialEvent.startTime) : normalisedDefaultDate;
  const initialEndDate = initialEvent?.endTime ? toLocalDateKey(initialEvent.endTime) : initialStartDate;
  const initialAssignee = initialEvent?.assignedUserId
    ? `staff:${initialEvent.assignedUserId}`
    : initialEvent?.assignedInstallerId
    ? `trade:${initialEvent.assignedInstallerId}`
    : "none";
  const [form, setForm] = useState({
    jobId: initialEvent?.jobId ? String(initialEvent.jobId) : "",
    title: initialEvent?.title || "",
    description: initialEvent?.description || "",
    startTime: initialAllDay
      ? initialStartDate
      : initialEvent?.startTime
      ? toLocalDateTimeInput(initialEvent.startTime)
      : normalisedDefaultDate ? `${normalisedDefaultDate}T09:00` : "",
    endTime: initialAllDay
      ? initialEndDate
      : initialEvent?.endTime
      ? toLocalDateTimeInput(initialEvent.endTime)
      : normalisedDefaultDate ? `${normalisedDefaultDate}T17:00` : "",
    allDay: initialAllDay,
    eventType: initialEvent?.eventType || "installation",
    assigneeId: initialAssignee,
    notifyClient: Boolean(initialEvent?.notifyClient),
    notifyInstaller: Boolean(initialEvent?.notifyInstaller),
    status: initialEvent?.status || "scheduled",
  });
  const [assigneeBranchFilter, setAssigneeBranchFilter] = useState("all");
  const [assigneeCategoryFilter, setAssigneeCategoryFilter] = useState("all");
  const assigneeBranchOptions = useMemo(() => {
    const byId = new Map<number, string>();
    for (const staff of staffUsers as any[]) {
      if (staff.branchId == null || !staff.branchName) continue;
      byId.set(Number(staff.branchId), staff.branchName);
    }
    return Array.from(byId.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [staffUsers]);
  const assigneeCategoryOptions = useMemo(() => {
    const categories = new Set<string>();
    for (const staff of staffUsers as any[]) {
      const category = staffCategoryValue(staff);
      if (category) categories.add(category);
    }
    return Array.from(categories)
      .map((value) => ({ value, label: staffCategoryLabel(value) }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [staffUsers]);
  const visibleStaffUsers = useMemo(() => {
    const selectedStaffId = form.assigneeId.startsWith("staff:")
      ? Number(form.assigneeId.replace("staff:", ""))
      : null;
    const filtered = (staffUsers as any[]).filter((staff) => {
      if (assigneeBranchFilter !== "all" && String(staff.branchId || "") !== assigneeBranchFilter) return false;
      if (assigneeCategoryFilter !== "all" && staffCategoryValue(staff) !== assigneeCategoryFilter) return false;
      return true;
    });
    if (selectedStaffId && !filtered.some((staff) => Number(staff.id) === selectedStaffId)) {
      const selectedStaff = (staffUsers as any[]).find((staff) => Number(staff.id) === selectedStaffId);
      if (selectedStaff) return [selectedStaff, ...filtered];
    }
    return filtered;
  }, [staffUsers, assigneeBranchFilter, assigneeCategoryFilter, form.assigneeId]);

  const handleSubmit = () => {
    const startDateValue = form.allDay ? form.startTime.slice(0, 10) : form.startTime;
    const endDateValue = form.allDay ? (form.endTime || form.startTime).slice(0, 10) : form.endTime;
    const startTime = form.allDay ? localDateStartToIso(startDateValue) : localDateTimeToIso(startDateValue);
    const endTime = form.allDay
      ? localDateEndToIso(endDateValue)
      : endDateValue ? localDateTimeToIso(endDateValue) : (mode === "edit" ? "" : undefined);

    if (!startTime) {
      toast.error("Start date is required");
      return;
    }
    if (endTime && new Date(endTime) < new Date(startTime)) {
      toast.error("End date must be after the start date");
      return;
    }

    const payload: any = {
      jobId: Number(form.jobId),
      title: form.title.trim(),
      description: form.description.trim() || undefined,
      startTime,
      endTime,
      allDay: form.allDay,
      eventType: form.eventType as any,
      assignedInstallerId: form.assigneeId.startsWith("trade:")
        ? Number(form.assigneeId.replace("trade:", ""))
        : (mode === "edit" ? null : undefined),
      assignedUserId: form.assigneeId.startsWith("staff:")
        ? Number(form.assigneeId.replace("staff:", ""))
        : (mode === "edit" ? null : undefined),
      notifyClient: form.notifyClient,
      notifyInstaller: form.notifyInstaller,
    };
    if (mode === "edit") payload.status = form.status as any;
    onSubmit(payload);
  };

  return (
    <div className="space-y-4">
      <div>
        <Label>Job *</Label>
        <JobCombobox
          jobs={jobs}
          value={form.jobId}
          onChange={(jobId) => setForm({ ...form, jobId })}
        />
      </div>
      <div>
        <Label>Title *</Label>
        <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Roof installation day 1" />
      </div>
      <div>
        <Label>Event Type</Label>
        <Select value={form.eventType} onValueChange={(v) => setForm({ ...form, eventType: v })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="installation">Installation</SelectItem>
            <SelectItem value="inspection">Inspection</SelectItem>
            <SelectItem value="meeting">Meeting</SelectItem>
            <SelectItem value="delivery">Delivery</SelectItem>
            <SelectItem value="other">Other</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-center gap-2">
        <Switch checked={form.allDay} onCheckedChange={(v) => setForm({ ...form, allDay: v })} />
        <Label>All Day Event</Label>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <Label>Start {form.allDay ? "Date" : "Date/Time"}</Label>
          <Input
            type={form.allDay ? "date" : "datetime-local"}
            value={form.allDay ? form.startTime.slice(0, 10) : form.startTime}
            onChange={(e) => setForm({ ...form, startTime: e.target.value })}
          />
        </div>
        <div>
          <Label>End {form.allDay ? "Date" : "Date/Time"}</Label>
          <Input
            type={form.allDay ? "date" : "datetime-local"}
            value={form.allDay ? form.endTime.slice(0, 10) : form.endTime}
            onChange={(e) => setForm({ ...form, endTime: e.target.value })}
          />
        </div>
      </div>
      <div>
        <Label>Assigned Staff / Trade</Label>
        {staffUsers.length > 0 && (
          <div className="mb-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Select value={assigneeBranchFilter} onValueChange={setAssigneeBranchFilter}>
              <SelectTrigger className="h-9 text-xs">
                <SelectValue placeholder="All branches" />
              </SelectTrigger>
              <SelectContent className="max-w-[calc(100vw-2rem)]">
                <SelectItem value="all">All branches</SelectItem>
                {assigneeBranchOptions.map((branch) => (
                  <SelectItem key={branch.id} value={String(branch.id)}>{branch.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={assigneeCategoryFilter} onValueChange={setAssigneeCategoryFilter}>
              <SelectTrigger className="h-9 text-xs">
                <SelectValue placeholder="All user categories" />
              </SelectTrigger>
              <SelectContent className="max-w-[calc(100vw-2rem)]">
                <SelectItem value="all">All user categories</SelectItem>
                {assigneeCategoryOptions.map((category) => (
                  <SelectItem key={category.value} value={category.value}>{category.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <Select value={form.assigneeId} onValueChange={(v) => setForm({ ...form, assigneeId: v })}>
          <SelectTrigger className="w-full min-w-0"><SelectValue placeholder="Leave empty for unallocated..." /></SelectTrigger>
          <SelectContent className="max-w-[calc(100vw-2rem)]">
            <SelectItem value="none">Unallocated</SelectItem>
            {staffUsers.length > 0 && (
              <SelectGroup>
                <SelectLabel>Staff</SelectLabel>
                {visibleStaffUsers.map((staff: any) => (
                  <SelectItem key={`staff-${staff.id}`} value={`staff:${staff.id}`}>
                    {staff.name}{staffCategoryValue(staff) ? ` (${staffCategoryLabel(staffCategoryValue(staff))})` : ""}
                  </SelectItem>
                ))}
              </SelectGroup>
            )}
            {installers.length > 0 && (
              <SelectGroup>
                <SelectLabel>Trades</SelectLabel>
                {installers.map((i: any) => (
                  <SelectItem key={`trade-${i.id}`} value={`trade:${i.id}`}>{i.name}{i.tradeType ? ` (${i.tradeType})` : ""}</SelectItem>
                ))}
              </SelectGroup>
            )}
          </SelectContent>
        </Select>
        <p className="text-[10px] text-muted-foreground mt-1">Choose a staff member for appointments, a trade for site work, or leave unallocated.</p>
      </div>
      <div>
        <Label>Description</Label>
        <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} />
      </div>
      {mode === "edit" && (
        <div>
          <Label>Status</Label>
          <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="scheduled">Scheduled</SelectItem>
              <SelectItem value="confirmed">Confirmed</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}
      <div className="flex flex-col gap-3 sm:flex-row sm:gap-6">
        <div className="flex items-center gap-2">
          <Switch checked={form.notifyClient} onCheckedChange={(v) => setForm({ ...form, notifyClient: v })} />
          <Label className="flex items-center gap-1 text-sm">
            {form.notifyClient ? <Bell className="h-3.5 w-3.5" /> : <BellOff className="h-3.5 w-3.5" />}
            Notify Client
          </Label>
        </div>
        <div className="flex items-center gap-2">
          <Switch checked={form.notifyInstaller} onCheckedChange={(v) => setForm({ ...form, notifyInstaller: v })} />
          <Label className="flex items-center gap-1 text-sm">
            {form.notifyInstaller ? <Bell className="h-3.5 w-3.5" /> : <BellOff className="h-3.5 w-3.5" />}
            Notify Assignee
          </Label>
        </div>
      </div>
      <Button
        className="w-full"
        onClick={handleSubmit}
        disabled={loading || !form.jobId || !form.title || !form.startTime}
      >
        {loading ? (mode === "edit" ? "Saving..." : "Creating...") : (mode === "edit" ? "Save Changes" : "Create Event")}
      </Button>
    </div>
  );
}

// ─── Equipment Booking Form ─────────────────────────────────────────────────
function EquipmentBookingForm({
  equipment, jobs, defaultDate, onSubmit, loading,
}: {
  equipment: any[];
  jobs: any[];
  defaultDate?: string | null;
  onSubmit: (data: any) => void;
  loading: boolean;
}) {
  const normalisedDefaultDate = toDateInputValue(defaultDate);
  const [form, setForm] = useState({
    equipmentId: "",
    jobId: "",
    startDate: normalisedDefaultDate,
    endDate: normalisedDefaultDate,
    notes: "",
  });

  return (
    <div className="space-y-4">
      <div>
        <Label>Equipment *</Label>
        <Select value={form.equipmentId} onValueChange={(v) => setForm({ ...form, equipmentId: v })}>
          <SelectTrigger><SelectValue placeholder="Select equipment..." /></SelectTrigger>
          <SelectContent>
            {equipment.map((e: any) => (
              <SelectItem key={e.id} value={String(e.id)}>
                {e.name} {e.category ? `(${e.category})` : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label>Job (optional)</Label>
        <JobCombobox
          jobs={jobs}
          value={form.jobId}
          onChange={(jobId) => setForm({ ...form, jobId })}
          placeholder="Link to job..."
          allowEmpty
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Start Date *</Label>
          <div className="flex gap-1 items-center">
            <Input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} className="flex-1" />
            {form.startDate && <Button type="button" variant="ghost" size="sm" className="h-8 px-2 text-muted-foreground hover:text-destructive" onClick={() => setForm({ ...form, startDate: "" })} title="Clear date">&times;</Button>}
          </div>
        </div>
        <div>
          <Label>End Date *</Label>
          <div className="flex gap-1 items-center">
            <Input type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} className="flex-1" />
            {form.endDate && <Button type="button" variant="ghost" size="sm" className="h-8 px-2 text-muted-foreground hover:text-destructive" onClick={() => setForm({ ...form, endDate: "" })} title="Clear date">&times;</Button>}
          </div>
        </div>
      </div>
      <div>
        <Label>Notes</Label>
        <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} placeholder="Optional notes..." />
      </div>
      <Button
        className="w-full"
        onClick={() => onSubmit({
          equipmentId: Number(form.equipmentId),
          jobId: form.jobId ? Number(form.jobId) : undefined,
          startDate: localDateStartToIso(form.startDate),
          endDate: localDateEndToIso(form.endDate),
          notes: form.notes || undefined,
        })}
        disabled={loading || !form.equipmentId || !form.startDate || !form.endDate}
      >
        {loading ? "Booking..." : "Book Equipment"}
      </Button>
    </div>
  );
}

// ─── Event Detail View ───────────────────────────────────────────────────────
function EventDetailView({
  event, jobs, installers, staffUsers, onUpdate, onDelete, loading,
}: {
  event: any;
  jobs: any[];
  installers: any[];
  staffUsers: any[];
  onUpdate: (data: any) => void;
  onDelete: () => void;
  loading: boolean;
}) {
  const config = EVENT_TYPE_CONFIG[event.eventType] || EVENT_TYPE_CONFIG.other;
  const Icon = config.icon;
  const readinessWarnings = scheduleReadinessWarnings(event);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className={`p-2 rounded-lg ${config.color}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="flex-1">
          <h3 className="font-semibold text-lg">{event.title}</h3>
          <p className="text-sm text-muted-foreground">
            {event.jobClientName}{eventSpansMultipleDays(event) ? " · Multi-day" : ""}
          </p>
        </div>
        <Badge className={STATUS_COLORS[event.status] || ""} variant="secondary">
          {event.status}
        </Badge>
      </div>

      {eventIsUnallocated(event) && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-300 text-sm">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>This event is <strong>unallocated</strong> — no staff assigned yet</span>
        </div>
      )}

      {readinessWarnings.length > 0 && (
        <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
          <div className="flex items-center gap-2 font-medium">
            <AlertTriangle className="h-4 w-4" />
            <span>Trade booking needs review</span>
          </div>
          <ScheduleReadinessTags warnings={readinessWarnings} />
          <ul className="space-y-1 text-xs">
            {readinessWarnings.map((warning: any) => (
              <li key={warning.key || warning.label}>{warning.message}</li>
            ))}
          </ul>
        </div>
      )}

      <EventForm
        key={event.id}
        jobs={jobs}
        installers={installers}
        staffUsers={staffUsers}
        initialEvent={event}
        mode="edit"
        onSubmit={onUpdate}
        loading={loading}
      />

      <div className="flex gap-2 pt-2">
        <Button variant="destructive" size="sm" onClick={onDelete} className="w-full">
          <Trash2 className="h-4 w-4 mr-1" /> Delete
        </Button>
      </div>
    </div>
  );
}
