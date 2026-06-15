import { useState, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, AlertTriangle, Clock, Upload, CheckCircle2, MessageSquare } from "lucide-react";
import { toast } from "sonner";

interface Props {
  projectId: number;
}

const STATUS_COLORS: Record<string, string> = {
  open: "bg-red-100 text-red-800",
  in_progress: "bg-amber-100 text-amber-800",
  responded: "bg-blue-100 text-blue-800",
  closed: "bg-green-100 text-green-800",
  overdue: "bg-red-200 text-red-900",
};

export function ApprovalRfisTab({ projectId }: Props) {
  const [showNew, setShowNew] = useState(false);
  const [newForm, setNewForm] = useState({ subject: "", description: "", requestedBy: "", dueAt: "", isBlocking: false });
  const [respondingTo, setRespondingTo] = useState<number | null>(null);
  const [responseText, setResponseText] = useState("");

  const { data: rfis, isLoading } = trpc.approvals.rfis.list.useQuery({ projectId });
  const utils = trpc.useUtils();

  const createRfi = trpc.approvals.rfis.create.useMutation({
    onSuccess: () => {
      toast.success("RFI created");
      setShowNew(false);
      setNewForm({ subject: "", description: "", requestedBy: "", dueAt: "", isBlocking: false });
      utils.approvals.rfis.list.invalidate({ projectId });
    },
    onError: (err) => toast.error(err.message),
  });

  const updateRfi = trpc.approvals.rfis.update.useMutation({
    onSuccess: () => {
      toast.success("RFI updated");
      setRespondingTo(null);
      setResponseText("");
      utils.approvals.rfis.list.invalidate({ projectId });
    },
    onError: (err) => toast.error(err.message),
  });

  const handleCreate = () => {
    if (!newForm.subject) {
      toast.error("Subject is required");
      return;
    }
    createRfi.mutate({
      projectId,
      subject: newForm.subject,
      description: newForm.description || undefined,
      requestedBy: newForm.requestedBy || undefined,
      dueAt: newForm.dueAt || undefined,
      isBlocking: newForm.isBlocking,
    });
  };

  const handleRespond = (rfiId: number) => {
    if (!responseText.trim()) {
      toast.error("Response text is required");
      return;
    }
    updateRfi.mutate({
      id: rfiId,
      projectId,
      data: {
        status: "responded",
        responseText,
        respondedAt: new Date().toISOString(),
      },
    });
  };

  const handleClose = (rfiId: number) => {
    updateRfi.mutate({
      id: rfiId,
      projectId,
      data: { status: "closed", closedAt: new Date().toISOString() },
    });
  };

  // Calculate overdue RFIs
  const overdueCount = (rfis || []).filter((r: any) => {
    if (r.status === "closed" || r.status === "responded") return false;
    if (!r.dueAt) return false;
    return new Date(r.dueAt) < new Date();
  }).length;

  return (
    <div className="space-y-4 mt-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h3 className="text-lg font-semibold">Requests for Information (RFIs)</h3>
          {overdueCount > 0 && (
            <Badge variant="destructive" className="text-xs">
              {overdueCount} overdue
            </Badge>
          )}
        </div>
        <Dialog open={showNew} onOpenChange={setShowNew}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="h-4 w-4 mr-1" /> New RFI
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create RFI</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Subject *</Label>
                <Input
                  placeholder="RFI subject"
                  value={newForm.subject}
                  onChange={(e) => setNewForm({ ...newForm, subject: e.target.value })}
                />
              </div>
              <div>
                <Label>Description</Label>
                <Textarea
                  placeholder="Details of the information request..."
                  value={newForm.description}
                  onChange={(e) => setNewForm({ ...newForm, description: e.target.value })}
                  rows={3}
                />
              </div>
              <div>
                <Label>Requested By</Label>
                <Input
                  placeholder="e.g. Council, Certifier"
                  value={newForm.requestedBy}
                  onChange={(e) => setNewForm({ ...newForm, requestedBy: e.target.value })}
                />
              </div>
              <div>
                <Label>Due Date</Label>
                <Input
                  type="date"
                  value={newForm.dueAt}
                  onChange={(e) => setNewForm({ ...newForm, dueAt: e.target.value })}
                />
              </div>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={newForm.isBlocking}
                  onChange={(e) => setNewForm({ ...newForm, isBlocking: e.target.checked })}
                  className="rounded border-gray-300"
                />
                <AlertTriangle className="h-4 w-4 text-red-500" />
                Blocking (prevents gate advancement until resolved)
              </label>
              <Button onClick={handleCreate} disabled={createRfi.isPending} className="w-full">
                {createRfi.isPending ? "Creating..." : "Create RFI"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => <div key={i} className="h-20 bg-muted animate-pulse rounded-lg" />)}
        </div>
      ) : !rfis || rfis.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            No RFIs recorded. Create one when information is requested by an authority.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {rfis.map((rfi: any) => {
            const isOverdue = rfi.dueAt && new Date(rfi.dueAt) < new Date() && !["closed", "responded"].includes(rfi.status);
            return (
              <Card key={rfi.id} className={isOverdue ? "border-red-300" : ""}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        {rfi.rfiNumber && <span className="text-xs font-mono text-muted-foreground">{rfi.rfiNumber}</span>}
                        <Badge variant="outline" className={STATUS_COLORS[isOverdue ? "overdue" : rfi.status] || ""}>
                          {isOverdue ? "overdue" : rfi.status.replace(/_/g, " ")}
                        </Badge>
                        {rfi.isBlocking && (
                          <Badge variant="destructive" className="text-xs">
                            <AlertTriangle className="h-3 w-3 mr-1" /> Blocking
                          </Badge>
                        )}
                      </div>
                      <p className="font-medium">{rfi.subject}</p>
                      {rfi.description && <p className="text-sm text-muted-foreground mt-1">{rfi.description}</p>}
                      {rfi.requestedBy && (
                        <p className="text-sm text-muted-foreground">From: {rfi.requestedBy}</p>
                      )}
                      {rfi.responseText && (
                        <div className="mt-2 p-2 bg-green-50 rounded text-sm">
                          <span className="font-medium text-green-700">Response:</span> {rfi.responseText}
                        </div>
                      )}
                    </div>
                    <div className="text-right text-xs text-muted-foreground ml-4">
                      {rfi.dueAt && (
                        <p className={`flex items-center gap-1 ${isOverdue ? "text-red-600 font-semibold" : ""}`}>
                          <Clock className="h-3 w-3" />
                          Due: {new Date(rfi.dueAt).toLocaleDateString()}
                        </p>
                      )}
                      {rfi.respondedAt && (
                        <p className="text-green-600">Responded: {new Date(rfi.respondedAt).toLocaleDateString()}</p>
                      )}
                    </div>
                  </div>

                  {/* Action buttons */}
                  {rfi.status !== "closed" && (
                    <div className="flex gap-2 mt-3 pt-3 border-t">
                      {rfi.status !== "responded" && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setRespondingTo(respondingTo === rfi.id ? null : rfi.id)}
                        >
                          <MessageSquare className="h-3.5 w-3.5 mr-1" /> Respond
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleClose(rfi.id)}
                        disabled={updateRfi.isPending}
                      >
                        <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Close
                      </Button>
                    </div>
                  )}

                  {/* Response form */}
                  {respondingTo === rfi.id && (
                    <div className="mt-3 pt-3 border-t space-y-2">
                      <Textarea
                        placeholder="Enter your response..."
                        value={responseText}
                        onChange={(e) => setResponseText(e.target.value)}
                        rows={2}
                      />
                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => handleRespond(rfi.id)} disabled={updateRfi.isPending}>
                          {updateRfi.isPending ? "Saving..." : "Submit Response"}
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => { setRespondingTo(null); setResponseText(""); }}>
                          Cancel
                        </Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
