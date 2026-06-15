import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Wrench, Plus } from "lucide-react";
import { toast } from "sonner";

export default function PortalMaintenance() {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [urgency, setUrgency] = useState<"low" | "medium" | "high">("medium");

  const requestsQuery = trpc.portal.getMaintenanceRequests.useQuery();
  const utils = trpc.useUtils();

  const createRequest = trpc.portal.submitMaintenanceRequest.useMutation({
    onSuccess: () => {
      toast.success("Maintenance request submitted");
      utils.portal.getMaintenanceRequests.invalidate();
      setOpen(false);
      setTitle("");
      setDescription("");
      setUrgency("medium");
    },
    onError: (err: any) => toast.error(err.message),
  });

  const statusColor = (status: string) => {
    switch (status) {
      case "completed": return "bg-green-100 text-green-700";
      case "scheduled": return "bg-primary/10 text-primary";
      case "reviewed": return "bg-primary/10 text-primary";
      case "submitted": return "bg-gray-100 text-gray-700";
      default: return "bg-gray-100 text-gray-700";
    }
  };

  const urgencyColor = (u: string) => {
    switch (u) {
      case "urgent": return "bg-red-100 text-red-700";
      case "high": return "bg-orange-100 text-orange-700";
      case "normal": return "bg-primary/10 text-primary";
      case "low": return "bg-gray-100 text-gray-700";
      default: return "bg-gray-100 text-gray-700";
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold">Maintenance</h1>
          <p className="text-sm text-muted-foreground">Request service and track repairs</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="shrink-0"><Plus className="w-4 h-4 sm:mr-1" /><span className="hidden sm:inline"> New Request</span></Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Maintenance Request</DialogTitle>
            </DialogHeader>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                createRequest.mutate({ description: `${title}: ${description}`, urgency });
              }}
              className="space-y-4"
            >
              <Input
                placeholder="Brief description (e.g. 'Gutter needs adjustment')"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
              />
              <Select value={urgency} onValueChange={(v) => setUrgency(v as "low" | "medium" | "high")}>
                <SelectTrigger>
                  <SelectValue placeholder="Urgency" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low - No rush</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High - Needs attention soon</SelectItem>
                </SelectContent>
              </Select>
              <Textarea
                placeholder="Provide more detail about the issue..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
                required
              />
              <Button type="submit" className="w-full" disabled={createRequest.isPending}>
                {createRequest.isPending ? "Submitting..." : "Submit Request"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {requestsQuery.isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-24 w-full" />)}
        </div>
      ) : !requestsQuery.data?.length ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Wrench className="w-12 h-12 mx-auto mb-4 text-muted-foreground/50" />
            <p className="text-muted-foreground">No maintenance requests</p>
            <p className="text-sm text-muted-foreground mt-1">Submit a request if you need any maintenance or repairs.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {requestsQuery.data.map((req) => (
            <Card key={req.id}>
              <CardContent className="pt-6">
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-1 sm:gap-3 mb-2">
                  <p className="font-medium text-sm sm:text-base">{req.description?.split(":")[0] || "Maintenance Request"}</p>
                  <div className="flex gap-1 shrink-0">
                    <Badge className={`text-[10px] sm:text-xs ${urgencyColor(req.urgency)}`}>{req.urgency}</Badge>
                    <Badge className={`text-[10px] sm:text-xs ${statusColor(req.status)}`}>{req.status}</Badge>
                  </div>
                </div>
                {req.description && <p className="text-sm text-muted-foreground">{req.description}</p>}
                {req.scheduledDate && (
                  <p className="text-xs text-primary mt-2">
                    Scheduled: {new Date(req.scheduledDate).toLocaleDateString("en-AU")}
                  </p>
                )}
                <p className="text-xs text-muted-foreground mt-2">
                  Submitted: {new Date(req.createdAt).toLocaleDateString("en-AU")}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
