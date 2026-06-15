import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Calendar, ShieldCheck, AlertTriangle, CheckCircle2, XCircle, Bug } from "lucide-react";
import { toast } from "sonner";

interface Props {
  projectId: number;
}

const INSPECTION_TYPES = [
  "footing", "slab", "frame", "pre_lining", "waterproofing", "final", "stormwater", "fire_safety", "other",
];

const STATUS_COLORS: Record<string, string> = {
  required: "bg-gray-100 text-gray-800",
  scheduled: "bg-blue-100 text-blue-800",
  booked: "bg-indigo-100 text-indigo-800",
  passed: "bg-green-100 text-green-800",
  failed: "bg-red-100 text-red-800",
  cancelled: "bg-gray-50 text-gray-500",
  deferred: "bg-amber-100 text-amber-800",
};

export function ApprovalInspectionsTab({ projectId }: Props) {
  const [showNew, setShowNew] = useState(false);
  const [newForm, setNewForm] = useState({ inspectionType: "", title: "", scheduledDate: "", inspectorName: "" });
  const [recordingResult, setRecordingResult] = useState<number | null>(null);
  const [resultForm, setResultForm] = useState({ result: "", notes: "" });
  const [addingDefect, setAddingDefect] = useState<number | null>(null);
  const [defectForm, setDefectForm] = useState({ title: "", description: "", severity: "minor" });

  const { data: inspections, isLoading } = trpc.approvals.inspections.list.useQuery({ projectId });
  const utils = trpc.useUtils();

  const createInspection = trpc.approvals.inspections.create.useMutation({
    onSuccess: () => {
      toast.success("Inspection scheduled");
      setShowNew(false);
      setNewForm({ inspectionType: "", title: "", scheduledDate: "", inspectorName: "" });
      utils.approvals.inspections.list.invalidate({ projectId });
    },
    onError: (err) => toast.error(err.message),
  });

  const updateInspection = trpc.approvals.inspections.update.useMutation({
    onSuccess: () => {
      toast.success("Inspection updated");
      setRecordingResult(null);
      setResultForm({ result: "", notes: "" });
      utils.approvals.inspections.list.invalidate({ projectId });
    },
    onError: (err) => toast.error(err.message),
  });

  const createDefect = trpc.approvals.inspections.defects.create.useMutation({
    onSuccess: () => {
      toast.success("Defect recorded");
      setAddingDefect(null);
      setDefectForm({ title: "", description: "", severity: "minor" });
      utils.approvals.inspections.list.invalidate({ projectId });
    },
    onError: (err) => toast.error(err.message),
  });

  const handleCreate = () => {
    if (!newForm.inspectionType || !newForm.title) {
      toast.error("Type and title are required");
      return;
    }
    createInspection.mutate({
      projectId,
      inspectionType: newForm.inspectionType,
      title: newForm.title,
      scheduledDate: newForm.scheduledDate || undefined,
      inspectorName: newForm.inspectorName || undefined,
    });
  };

  const handleRecordResult = (inspId: number) => {
    if (!resultForm.result) {
      toast.error("Select a result");
      return;
    }
    updateInspection.mutate({
      id: inspId,
      projectId,
      data: {
        status: resultForm.result,
        resultNotes: resultForm.notes,
        completedAt: new Date().toISOString(),
      },
    });
  };

  const handleAddDefect = (inspId: number) => {
    if (!defectForm.title) {
      toast.error("Defect title is required");
      return;
    }
    createDefect.mutate({
      projectId,
      inspectionId: inspId,
      title: defectForm.title,
      description: defectForm.description || undefined,
      severity: defectForm.severity as any,
    });
  };

  // OC Readiness check
  const allInspections = inspections || [];
  const requiredInspections = allInspections.filter((i: any) => i.status !== "cancelled");
  const passedInspections = requiredInspections.filter((i: any) => i.status === "passed");
  const failedInspections = requiredInspections.filter((i: any) => i.status === "failed");
  const ocReady = requiredInspections.length > 0 && passedInspections.length === requiredInspections.length;

  return (
    <div className="space-y-4 mt-4">
      {/* OC Readiness Banner */}
      {requiredInspections.length > 0 && (
        <Card className={ocReady ? "border-green-300 bg-green-50" : "border-amber-200 bg-amber-50"}>
          <CardContent className="p-3 flex items-center gap-3">
            {ocReady ? (
              <>
                <CheckCircle2 className="h-5 w-5 text-green-600" />
                <div>
                  <p className="font-medium text-green-800 text-sm">OC/COU Ready</p>
                  <p className="text-xs text-green-700">All {passedInspections.length} inspections passed. Ready to apply for Occupation Certificate.</p>
                </div>
              </>
            ) : (
              <>
                <AlertTriangle className="h-5 w-5 text-amber-600" />
                <div>
                  <p className="font-medium text-amber-800 text-sm">Not OC Ready</p>
                  <p className="text-xs text-amber-700">
                    {passedInspections.length}/{requiredInspections.length} inspections passed.
                    {failedInspections.length > 0 && ` ${failedInspections.length} failed.`}
                    {requiredInspections.length - passedInspections.length - failedInspections.length > 0 &&
                      ` ${requiredInspections.length - passedInspections.length - failedInspections.length} pending.`}
                  </p>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}

      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Inspections</h3>
        <Dialog open={showNew} onOpenChange={setShowNew}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="h-4 w-4 mr-1" /> Schedule Inspection
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Schedule Inspection</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Type *</Label>
                <Select value={newForm.inspectionType} onValueChange={(v) => setNewForm({ ...newForm, inspectionType: v })}>
                  <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                  <SelectContent>
                    {INSPECTION_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>{t.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Title *</Label>
                <Input
                  placeholder="e.g. Footing Inspection"
                  value={newForm.title}
                  onChange={(e) => setNewForm({ ...newForm, title: e.target.value })}
                />
              </div>
              <div>
                <Label>Inspector Name</Label>
                <Input
                  placeholder="e.g. John Smith (PCA)"
                  value={newForm.inspectorName}
                  onChange={(e) => setNewForm({ ...newForm, inspectorName: e.target.value })}
                />
              </div>
              <div>
                <Label>Scheduled Date</Label>
                <Input
                  type="date"
                  value={newForm.scheduledDate}
                  onChange={(e) => setNewForm({ ...newForm, scheduledDate: e.target.value })}
                />
              </div>
              <Button onClick={handleCreate} disabled={createInspection.isPending} className="w-full">
                {createInspection.isPending ? "Creating..." : "Schedule Inspection"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => <div key={i} className="h-20 bg-muted animate-pulse rounded-lg" />)}
        </div>
      ) : !allInspections.length ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            No inspections scheduled. Add inspections as required by the construction certificate.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {allInspections.map((insp: any) => (
            <Card key={insp.id} className={insp.status === "failed" ? "border-red-200" : ""}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <ShieldCheck className={`h-5 w-5 ${insp.status === "passed" ? "text-green-500" : insp.status === "failed" ? "text-red-500" : "text-muted-foreground"}`} />
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium">{insp.title}</span>
                        <Badge variant="outline" className={STATUS_COLORS[insp.status] || ""}>
                          {insp.status}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {insp.inspectionType.replace(/_/g, " ")}
                        {insp.inspectorName && ` • ${insp.inspectorName}`}
                      </p>
                      {insp.resultNotes && (
                        <p className="text-xs text-muted-foreground mt-1 italic">{insp.resultNotes}</p>
                      )}
                    </div>
                  </div>
                  <div className="text-right text-xs text-muted-foreground">
                    {insp.scheduledDate && (
                      <p className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {new Date(insp.scheduledDate).toLocaleDateString()}
                      </p>
                    )}
                    {insp.defectCount > 0 && (
                      <p className="text-red-600 mt-1 flex items-center gap-1">
                        <Bug className="h-3 w-3" /> {insp.defectCount} defect(s)
                      </p>
                    )}
                  </div>
                </div>

                {/* Actions for pending inspections */}
                {!["passed", "cancelled"].includes(insp.status) && (
                  <div className="flex gap-2 mt-3 pt-3 border-t">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setRecordingResult(recordingResult === insp.id ? null : insp.id)}
                    >
                      Record Result
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setAddingDefect(addingDefect === insp.id ? null : insp.id)}
                    >
                      <Bug className="h-3.5 w-3.5 mr-1" /> Add Defect
                    </Button>
                  </div>
                )}

                {/* Record result form */}
                {recordingResult === insp.id && (
                  <div className="mt-3 pt-3 border-t space-y-3">
                    <div className="flex gap-3">
                      <Button
                        size="sm"
                        variant={resultForm.result === "passed" ? "default" : "outline"}
                        onClick={() => setResultForm({ ...resultForm, result: "passed" })}
                        className={resultForm.result === "passed" ? "bg-green-600 hover:bg-green-700" : ""}
                      >
                        <CheckCircle2 className="h-4 w-4 mr-1" /> Pass
                      </Button>
                      <Button
                        size="sm"
                        variant={resultForm.result === "failed" ? "default" : "outline"}
                        onClick={() => setResultForm({ ...resultForm, result: "failed" })}
                        className={resultForm.result === "failed" ? "bg-red-600 hover:bg-red-700" : ""}
                      >
                        <XCircle className="h-4 w-4 mr-1" /> Fail
                      </Button>
                    </div>
                    <Textarea
                      placeholder="Notes about the inspection result..."
                      value={resultForm.notes}
                      onChange={(e) => setResultForm({ ...resultForm, notes: e.target.value })}
                      rows={2}
                    />
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => handleRecordResult(insp.id)} disabled={updateInspection.isPending}>
                        {updateInspection.isPending ? "Saving..." : "Save Result"}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => { setRecordingResult(null); setResultForm({ result: "", notes: "" }); }}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}

                {/* Add defect form */}
                {addingDefect === insp.id && (
                  <div className="mt-3 pt-3 border-t space-y-3">
                    <div>
                      <Label className="text-xs">Defect Title *</Label>
                      <Input
                        placeholder="e.g. Crack in footing"
                        value={defectForm.title}
                        onChange={(e) => setDefectForm({ ...defectForm, title: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Description</Label>
                      <Textarea
                        placeholder="Details of the defect..."
                        value={defectForm.description}
                        onChange={(e) => setDefectForm({ ...defectForm, description: e.target.value })}
                        rows={2}
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Severity</Label>
                      <Select value={defectForm.severity} onValueChange={(v) => setDefectForm({ ...defectForm, severity: v })}>
                        <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="minor">Minor</SelectItem>
                          <SelectItem value="major">Major</SelectItem>
                          <SelectItem value="critical">Critical</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => handleAddDefect(insp.id)} disabled={createDefect.isPending}>
                        {createDefect.isPending ? "Saving..." : "Record Defect"}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => { setAddingDefect(null); setDefectForm({ title: "", description: "", severity: "minor" }); }}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
