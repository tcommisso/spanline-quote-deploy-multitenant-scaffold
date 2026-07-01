import { useEffect, useMemo, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CalendarDays, ChevronLeft, ChevronRight, Plus, GripVertical } from "lucide-react";
import { toast } from "sonner";

const STATUS_COLORS: Record<string, string> = {
  scheduled: "bg-blue-500",
  in_progress: "bg-amber-500",
  completed: "bg-green-500",
  cancelled: "bg-gray-400",
};

const STATUS_BG: Record<string, string> = {
  scheduled: "bg-blue-100 dark:bg-blue-900/30 border-blue-200 dark:border-blue-800",
  in_progress: "bg-amber-100 dark:bg-amber-900/30 border-amber-200 dark:border-amber-800",
  completed: "bg-green-100 dark:bg-green-900/30 border-green-200 dark:border-green-800",
  cancelled: "bg-gray-100 dark:bg-gray-900/30 border-gray-200 dark:border-gray-800",
};

function formatAustralianDate(value?: string | null) {
  if (!value) return "";
  const [year, month, day] = value.split("-");
  return year && month && day ? `${day}-${month}-${year}` : value;
}

export default function ManufacturingCalendar() {
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [branchFilter, setBranchFilter] = useState<string>("all");
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [dragItem, setDragItem] = useState<any>(null);
  const [dragOverDate, setDragOverDate] = useState<string | null>(null);
  const dragGhostRef = useRef<HTMLDivElement | null>(null);
  const utils = trpc.useUtils();

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const startDate = useMemo(() => {
    const d = new Date(year, month, 1);
    d.setDate(d.getDate() - d.getDay());
    return d.toISOString();
  }, [year, month]);

  const endDate = useMemo(() => {
    const d = new Date(year, month + 1, 0);
    d.setDate(d.getDate() + (6 - d.getDay()));
    return d.toISOString();
  }, [year, month]);

  const { data: branches } = trpc.manufacturing.branches.useQuery();
  const { data: scheduleItems } = trpc.manufacturing.schedule.list.useQuery({
    startDate,
    endDate,
    branchId: branchFilter !== "all" ? Number(branchFilter) : undefined,
  });

  const createSchedule = trpc.manufacturing.schedule.create.useMutation({
    onSuccess: () => {
      utils.manufacturing.schedule.list.invalidate();
      setShowCreateDialog(false);
      toast.success("Schedule entry created");
    },
  });

  const reschedule = trpc.manufacturing.schedule.reschedule.useMutation({
    onSuccess: () => utils.manufacturing.schedule.list.invalidate(),
    onError: (err: any) => toast.error(err.message || "Failed to reschedule"),
  });

  // Build calendar grid
  const calendarDays = useMemo(() => {
    const days: Date[] = [];
    const start = new Date(startDate);
    const end = new Date(endDate);
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      days.push(new Date(d));
    }
    return days;
  }, [startDate, endDate]);

  // Group schedule items by date
  const itemsByDate = useMemo(() => {
    const map: Record<string, any[]> = {};
    (scheduleItems || []).forEach(item => {
      const key = new Date(item.scheduledDate).toISOString().split("T")[0];
      if (!map[key]) map[key] = [];
      map[key].push(item);
    });
    return map;
  }, [scheduleItems]);

  const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
  const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1));
  const today = new Date().toISOString().split("T")[0];

  // ─── Drag & Drop Handlers ──────────────────────────────────────────────────
  const handleDragStart = (e: React.DragEvent, item: any) => {
    // Only allow dragging non-completed items
    if (item.status === "completed" || item.status === "cancelled") {
      e.preventDefault();
      return;
    }
    setDragItem(item);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", item.title);

    // Create ghost element
    const ghost = document.createElement("div");
    ghost.className = "fixed top-0 left-0 px-2 py-1 rounded text-xs text-white bg-primary/90 shadow-lg z-[9999] pointer-events-none";
    ghost.textContent = item.title;
    ghost.style.maxWidth = "160px";
    ghost.style.whiteSpace = "nowrap";
    ghost.style.overflow = "hidden";
    ghost.style.textOverflow = "ellipsis";
    document.body.appendChild(ghost);
    dragGhostRef.current = ghost;
    e.dataTransfer.setDragImage(ghost, 0, 0);
  };

  const handleDragEnd = () => {
    setDragItem(null);
    setDragOverDate(null);
    if (dragGhostRef.current) {
      document.body.removeChild(dragGhostRef.current);
      dragGhostRef.current = null;
    }
  };

  const handleDragOver = (e: React.DragEvent, dateKey: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverDate(dateKey);
  };

  const handleDragLeave = () => {
    setDragOverDate(null);
  };

  const handleDrop = (e: React.DragEvent, dateKey: string) => {
    e.preventDefault();
    setDragOverDate(null);
    if (!dragItem) return;

    const originalDate = new Date(dragItem.scheduledDate).toISOString().split("T")[0];
    if (originalDate === dateKey) {
      setDragItem(null);
      return; // Dropped on same date
    }

    // Undo toast pattern
    let undone = false;
    const toastId = toast("Schedule entry moved", {
      description: `"${dragItem.title}" moved to ${formatAustralianDate(dateKey)}`,
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

    const itemId = dragItem.id;
    setTimeout(() => {
      if (!undone) {
        reschedule.mutate({ id: itemId, scheduledDate: dateKey });
      }
    }, 5000);

    setDragItem(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <CalendarDays className="h-6 w-6" />
            Manufacturing Calendar
          </h1>
          <p className="text-muted-foreground text-sm mt-1">Drag entries between dates to reschedule</p>
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={prevMonth}><ChevronLeft className="h-4 w-4" /></Button>
          <h2 className="text-lg font-semibold min-w-[180px] text-center">
            {currentDate.toLocaleDateString("en-AU", { month: "long", year: "numeric" })}
          </h2>
          <Button variant="outline" size="icon" onClick={nextMonth}><ChevronRight className="h-4 w-4" /></Button>
        </div>
        <div className="flex items-center gap-2">
          <Select value={branchFilter} onValueChange={setBranchFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="All Branches" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Branches</SelectItem>
              {(branches || []).map(b => (
                <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="brand" size="sm" onClick={() => { setSelectedDate(today); setShowCreateDialog(true); }}>
            <Plus className="h-4 w-4 mr-1" /> Add Entry
          </Button>
        </div>
      </div>

      {/* Calendar Grid */}
      <div className="border rounded-lg overflow-hidden">
        {/* Day headers */}
        <div className="grid grid-cols-7 bg-muted/50">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(day => (
            <div key={day} className="px-2 py-2 text-center text-xs font-medium text-muted-foreground border-b">
              {day}
            </div>
          ))}
        </div>
        {/* Day cells */}
        <div className="grid grid-cols-7">
          {calendarDays.map((day, idx) => {
            const dateKey = day.toISOString().split("T")[0];
            const isCurrentMonth = day.getMonth() === month;
            const isToday = dateKey === today;
            const isDragTarget = dragOverDate === dateKey;
            const items = itemsByDate[dateKey] || [];
            return (
              <div
                key={idx}
                className={`min-h-[110px] border-b border-r p-1 transition-colors ${
                  !isCurrentMonth ? "bg-muted/20 text-muted-foreground" : ""
                } ${isToday ? "bg-primary/5" : ""} ${isDragTarget ? "bg-primary/10 ring-2 ring-primary/30 ring-inset" : ""}`}
                onDragOver={(e) => handleDragOver(e, dateKey)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, dateKey)}
                onClick={() => { setSelectedDate(dateKey); setShowCreateDialog(true); }}
              >
                <div className={`text-xs font-medium mb-1 ${isToday ? "text-primary font-bold" : ""}`}>
                  {day.getDate()}
                </div>
                <div className="space-y-0.5">
                  {items.slice(0, 4).map(item => {
                    const isDraggable = item.status !== "completed" && item.status !== "cancelled";
                    return (
                      <div
                        key={item.id}
                        draggable={isDraggable}
                        onDragStart={(e) => { e.stopPropagation(); handleDragStart(e, item); }}
                        onDragEnd={handleDragEnd}
                        onClick={(e) => e.stopPropagation()}
                        className={`flex items-center gap-0.5 rounded px-1 py-0.5 border text-[10px] ${
                          STATUS_BG[item.status] || "bg-gray-50 border-gray-200"
                        } ${isDraggable ? "cursor-grab active:cursor-grabbing hover:shadow-sm" : "opacity-70"} ${
                          dragItem?.id === item.id ? "opacity-40" : ""
                        }`}
                      >
                        {isDraggable && <GripVertical className="h-2.5 w-2.5 text-muted-foreground flex-shrink-0" />}
                        <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${STATUS_COLORS[item.status] || "bg-gray-400"}`} />
                        <span className="truncate flex-1">{item.title}</span>
                        {item.branchName && (
                          <span className="text-[8px] text-muted-foreground flex-shrink-0 ml-0.5">{item.branchName.slice(0, 3)}</span>
                        )}
                      </div>
                    );
                  })}
                  {items.length > 4 && (
                    <span className="text-[10px] text-muted-foreground pl-1">+{items.length - 4} more</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 text-xs">
        <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-blue-500" /> Scheduled</span>
        <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-amber-500" /> In Progress</span>
        <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-green-500" /> Completed</span>
        <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-gray-400" /> Cancelled</span>
        <span className="text-muted-foreground ml-2">| Drag items to reschedule</span>
      </div>

      {/* Create Schedule Dialog */}
      <CreateScheduleDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        selectedDate={selectedDate}
        branches={branches || []}
        onSubmit={(data) => createSchedule.mutate(data)}
        isLoading={createSchedule.isPending}
      />
    </div>
  );
}

function CreateScheduleDialog({
  open, onOpenChange, selectedDate, branches, onSubmit, isLoading
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  selectedDate: string;
  branches: { id: number; name: string }[];
  onSubmit: (data: any) => void;
  isLoading: boolean;
}) {
  const [title, setTitle] = useState("");
  const [branchId, setBranchId] = useState("");
  const [orderId, setOrderId] = useState("");

  const { data: orders } = trpc.manufacturing.orders.list.useQuery({ status: "all" });
  const defaultBranchId = useMemo(() => {
    const match = branches.find((branch) => branch.name.trim().toLowerCase() === "spanline act");
    return match ? String(match.id) : "";
  }, [branches]);

  useEffect(() => {
    if (open && !branchId && defaultBranchId) {
      setBranchId(defaultBranchId);
    } else if (!open && defaultBranchId && branchId !== defaultBranchId) {
      setBranchId(defaultBranchId);
    }
  }, [open, branchId, defaultBranchId]);

  const handleSubmit = () => {
    if (!title || !branchId || !orderId) return;
    const branch = branches.find(b => b.id === Number(branchId));
    onSubmit({
      orderId: Number(orderId),
      branchId: Number(branchId),
      branchName: branch?.name || "",
      scheduledDate: selectedDate,
      title,
    });
    setTitle("");
    setBranchId(defaultBranchId);
    setOrderId("");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Schedule Entry</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Date</Label>
            <Input value={formatAustralianDate(selectedDate)} disabled />
          </div>
          <div>
            <Label>Title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Cut beams for Smith job" />
          </div>
          <div>
            <Label>Order</Label>
            <Select value={orderId} onValueChange={setOrderId}>
              <SelectTrigger><SelectValue placeholder="Select order" /></SelectTrigger>
              <SelectContent>
                {(orders || []).map(o => (
                  <SelectItem key={o.id} value={String(o.id)}>{o.orderNumber} - {o.clientName}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Branch</Label>
            <Select value={branchId} onValueChange={setBranchId}>
              <SelectTrigger><SelectValue placeholder="Select branch" /></SelectTrigger>
              <SelectContent>
                {branches.map(b => (
                  <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={isLoading || !title || !branchId || !orderId}>
            {isLoading ? "Creating..." : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
